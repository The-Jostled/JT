---
title: "Purple-team homelab: pfSense, Wazuh, and a BadBlood Active Directory"
date: 2026-02-01
summary: "An isolated VirtualBox network with a firewall at the edge, a populated Windows domain to attack, a Kali box to attack it from, and a Wazuh SIEM watching the whole thing."
tags: [homelab, wazuh, pfsense, active-directory, siem, virtualbox]
# Nunjucks runs before Markdown on this page so the diagram include works
templateEngineOverride: njk,md
---

I built this lab to have somewhere I could run an attack and then go look at what it produced on the defensive side — the same event, from both chairs. Every HTB box teaches the offense; the lab is where I learned what that offense looks like in a SIEM.

## Topology

<figure class="diagram">
<div class="d-scroll">
{% include "diagrams/homelab.svg.njk" %}
</div>
<figcaption>Hover or focus <strong>Kali</strong> to trace its attack paths, or <strong>Wazuh SIEM</strong> to trace log forwarding.</figcaption>
</figure>

- **Hypervisor:** VirtualBox
- **Edge:** pfSense, with the lab on a VirtualBox *internal* network so nothing I run can touch my real home network
- **Target domain:** Windows Server as a domain controller, populated with [BadBlood](https://github.com/davidprowe/BadBlood) so the directory has realistic users, groups and ACL mess to enumerate
- **Legacy target:** Metasploitable, for the classic stuff
- **Attacker:** Kali
- **Detection:** Wazuh all-in-one (manager, indexer, dashboard) on Ubuntu Server, with the agent on the DC

## What went wrong, and what I learned fixing it

**Networking.** My first attempt had VirtualBox's NAT network handing out DHCP over the whole lab while pfSense sat there doing nothing. Then I swapped the LAN and WAN DHCP settings and made it worse. Rebuilding it with pfSense as the only gateway and DHCP server is what made the lab actually behave like a segmented corporate subnet — and it's the reason I now understand what each interface is doing.

**Wazuh.** Installing everything at once failed, and I lost the admin password in the process. Resetting it meant regenerating the hash and pushing it through `securityadmin.sh` against the indexer's security config — which I did several times with no effect, until I noticed I'd been replacing the hash in the YAML and never saving the file. Embarrassing, instructive, and I now know how the indexer's security plugin stores credentials.

**Disk.** Wazuh's logs filled the root volume. Resizing a live Ubuntu LVM volume and growing the filesystem without a reboot was a good exercise I wouldn't have chosen voluntarily.

## Exercises I've run on it

- RDP brute force from Kali → Event ID 4625 storms in the Wazuh dashboard
- Enumeration of the BadBlood domain with BloodHound → what AD reconnaissance looks like from the DC's logs
- Mimikatz on the DC → Wazuh's built-in detection rules firing

## Next

Suricata on the pfSense LAN interface for network-level alerts alongside the host-level ones, and a small n8n flow that takes a Wazuh alert and blocks the source IP at the firewall — a minimal SOAR loop.
