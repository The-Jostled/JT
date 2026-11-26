---
title: "A headless Linux desktop in a college dorm, reachable from anywhere"
date: 2026-09-01
summary: "Full-disk-encrypted Arch on an external SSD with TPM unlock, a recovery Wi-Fi hotspot, SSH scoped to an overlay network — and what I did when the campus firewall broke all of it."
tags: [linux, luks, tpm, tailscale, ssh, networking, wireguard]
---

Moving into a dorm meant my desktop would live somewhere with no monitor, no keyboard, and a Wi-Fi network I couldn't test in advance. The goal was a machine I could power on blind and reach from my laptop or phone no matter what the network did.

## Design

- **Dual OS without a boot menu.** Omarchy (Arch) lives on an external USB SSD; Windows 11 stays on the internal NVMe. BIOS boot order makes plugging the SSD in or out select the OS, and `efibootmgr --bootnext` gives a one-time reboot into the other one remotely.
- **Encryption that doesn't need me at the keyboard.** LUKS on btrfs with the Limine bootloader, unlocked at boot by the TPM 2.0 via `systemd-cryptenroll` — no passphrase prompt on a machine nobody can type into.
- **Networking with a safety net.** NetworkManager (I moved off iwd/systemd-networkd for this), with a fallback hotspot that comes up when no known network is found, so a misconfigured Wi-Fi profile can never lock me out.
- **Remote access.** Tailscale for the overlay, and SSH on both operating systems bound *only* to the Tailscale interface, key-only.

## What the campus network did to it

It all worked for about two weeks. Then the residence-hall Wi-Fi started breaking Tailscale on every device I owned. Investigating: a FortiGate doing SSL deep inspection was substituting its own certificate for Tailscale's control plane, and any client that pins certificates — Tailscale, commercial VPNs — fails the handshake. Authenticating a device over my phone's hotspot and then moving it to the dorm Wi-Fi worked, with peer traffic relayed through DERP since no direct connection could be established. I reported it to campus IT; they confirmed they can't open access to Tailscale.

So I moved the access path to a small VPS I already had. WireGuard to the VPS also died on the dorm network — the handshake completes and then the session drops about fifteen seconds in, which looks like protocol fingerprinting. What survived was the most boring option: an `autossh` reverse tunnel from the desktop to the VPS (`-R 2222:localhost:22`), with my laptop and phone reaching the desktop by `ProxyJump` through the VPS. Plain SSH over 22 is apparently the one thing the firewall leaves alone.

## What I took away

- Design for the failure mode you can't test. The recovery hotspot and the reverse tunnel were both "probably unnecessary" and both ended up being the only things that worked.
- Enterprise firewalls will interfere with more than you expect — cert pinning, WireGuard's handshake pattern. Understanding *how* they broke things was the most useful part of the project.
- Bind services to the interface you mean. SSH only on the overlay meant the box never had a listener on the dorm network at all.
