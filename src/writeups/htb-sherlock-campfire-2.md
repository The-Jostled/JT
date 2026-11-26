---
title: "HTB Sherlock Campfire-2 — hunting AS-REP roasting in a single event log"
date: 2026-05-15
platform: Hack The Box Sherlock
difficulty: Easy
os: Windows
category: Defense
summary: "One security.evtx from a domain controller, one anomalous Event ID 4768, and a compromised account identified from the source IP. Plus the tooling fight that came before any of it."
tags: [dfir, kerberos, as-rep-roasting, event-logs, evtx, blue-team]
---

Forela's security team got an alert that an old, supposedly inactive admin account had requested a Kerberos ticket from the domain controller. The working theory was AS-REP roasting: if an account has Kerberos pre-authentication disabled, anyone on the network can request an encrypted ticket for it without knowing the password, take it offline, and crack it.

The task was to confirm the attack, timeline it, identify the vulnerable account, and trace it back to the attacker's machine and the account they were using. Evidence: a single `security.evtx` from the DC.

## Getting a working toolchain first

Before the investigation could start I had to get a fresh Kali VM into a usable state — it was crawling despite 8 GB and 8 cores. The fix was unintuitive: turning **off** both 3D acceleration and TPM in VirtualBox made it dramatically faster. Worth checking on any new Kali VM.

Then EVTX parsing. The format is a proprietary binary; you can't grep it directly. Both Python options on Kali shipped a broken `evtx_dump`:

```bash
pip3 install evtx --break-system-packages   # ModuleNotFoundError: No module named 'scripts'
sudo apt install python3-evtx                # same
```

The Rust build from omerbenamram worked out of the box:

```bash
wget https://github.com/omerbenamram/evtx/releases/download/v0.8.1/evtx_dump-v0.8.1-x86_64-unknown-linux-gnu \
  -O /usr/local/bin/evtx_dump && chmod +x /usr/local/bin/evtx_dump
evtx_dump /tmp/security.evtx > /tmp/security.xml
```

## The investigation

### The event that matters: 4768

For AS-REP roasting the key event is **4768** — logged on every Kerberos Authentication Service request (AS-REQ) to the DC. That's the attacker's ticket request.

```bash
grep -E "SystemTime|EventID|TargetUserName|Status|IpAddress" /tmp/security.xml | grep -A 4 "4768"
```

Nearly every 4768 came from `::1` — the DC authenticating to itself, normal background noise. One did not:

```
Time:    2024-05-29T06:36:40Z
User:    arthur.kyle
IP:      ::ffff:172.17.79.129
Status:  0x0
```

The only AS-REQ from a non-localhost address, for an inactive account. `Status 0x0` means the ticket was issued — which confirms pre-authentication was disabled on `arthur.kyle`. A failed request would show `0x18`.

### Who sent it

Searching the log for other activity from that IP in the same window:

```bash
grep -B 5 -A 50 "172.17.79.129" /tmp/security.xml \
  | grep -E "SubjectUserName|TargetUserName|IpAddress|SystemTime"
```

`happy.grunwald` appeared repeatedly as `SubjectUserName` in events from `172.17.79.129` — the compromised account the attacker was operating from.

The target account's SID came out of the same 4768 block. Two SIDs appear there: the `-1601` RID is `arthur.kyle`; `-502` is `krbtgt`, which is a red herring.

> Some events log the address as `::ffff:172.17.79.129` and others as `172.17.79.129`. Both are the same host — it depends on whether the connection came through the dual-stack listener.

## Findings

| | |
|---|---|
| Attack timestamp | 2024-05-29 06:36:40 UTC |
| Targeted account | `arthur.kyle` (pre-auth disabled) |
| Attacker account | `happy.grunwald` |
| Attacker source | `172.17.79.129` |
| Domain | `FORELA.LOCAL` |

**Containment I'd recommend:** disable `happy.grunwald` immediately; isolate `172.17.79.129` pending imaging; enable pre-authentication on `arthur.kyle` or disable the account outright; and audit the whole domain for other accounts with `DONT_REQ_PREAUTH` set, because an environment with one usually has more.

## What I took away

- AS-REP roasting has a clean detection signature: a 4768 for a dormant account from a non-DC source. A SOC rule matching 4768 `TargetUserName` against an inactive-account list would have caught this in real time.
- A grep-based EVTX workflow is enough for small cases: convert, target the Event ID, filter the fields, look for whatever breaks the baseline pattern.
- Fix the tooling before the investigation, and keep the working binary somewhere permanent.
