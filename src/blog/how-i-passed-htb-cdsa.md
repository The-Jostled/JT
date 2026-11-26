---
title: "How I prepared for the HTB CDSA — and what the exam is actually like"
date: 2026-06-01
summary: "The Academy path, the order I took it in, a 19-day study plan, and what matters on a seven-day exam that grades you on the report, not the flags."
tags: [cdsa, hack-the-box, blue-team, certification, study]
---

The Certified Defensive Security Analyst is Hack The Box's SOC-analyst certification. It's hands-on from start to finish: a 13-module Academy path, then a seven-day exam where you investigate real incidents in a live environment and write a professional incident report. Nothing in this post spoils the exam — HTB's rules and my own interest both say no — but I can say what preparing for it looked like and what I'd tell someone starting it.

## The path

The SOC Analyst job-role path is the prerequisite. These are the modules, in the order I did them, which is roughly "foundations first, reporting early, specialties last":

1. Windows Event Logs & Finding Evil
2. Detecting Windows Attacks with Splunk
3. Understanding Log Sources & Investigating with Splunk
4. Threat Hunting with Elastic
5. Security Incident Reporting
6. Windows Attacks & Defense
7. YARA & Sigma
8. IDS/IPS
9. Intermediate Network Traffic Analysis
10. Intro to Network Traffic Analysis
11. Intro to Malware Analysis
12. Digital Forensics
13. JavaScript Deobfuscation

Two reorderings I'd recommend. Do **Security Incident Reporting** much earlier than its position in the path suggests — the exam is graded on the report, and knowing what a finished report needs to contain changes how you take notes in every other module. And do **Windows Attacks & Defense** with real attention; it's the module where the offensive technique and its detection sit side by side, and that pairing is the whole job.

## How I studied

I compressed the path into a 19-day schedule, about one module per day with the heavier ones (Splunk detection, Windows event logs, digital forensics) getting two. The things that mattered more than the schedule:

- **Notes as if I'd have to hand them to someone.** Every module got a page in Obsidian with the key event IDs, the queries that worked, and the artifacts I'd want to pull first. Those pages are what I actually used during the exam.
- **Skills assessments done cold, then written up.** I treated each module's skills assessment as a mini-incident and wrote a short report for it. By the exam, writing the report was the familiar part.
- **Sherlocks between modules.** HTB's blue-team labs are the closest practice to the exam format. [Campfire-2](/writeups/htb-sherlock-campfire-2/) is a good first one — a single event log, one anomaly to find.
- **A working toolchain before day one.** EVTX parsers, Splunk/ELK queries, Volatility, KAPE output layouts. Fighting tools during a timed exam is the one thing you can fully prevent in advance.

## What the exam is actually like

Without specifics: you get a letter of engagement describing an organization and an incident, an environment to investigate, a set of questions to answer along the way, and seven days. Then you submit a formal incident report. The report is the deliverable; the questions keep you honest.

Things I'd tell past me:

- **Start the report on day one.** Not at the end. Fill in the executive summary, scope and timeline as you go, and the last day becomes editing instead of writing.
- **Keep a running timeline with timestamps and sources** from the first artifact you look at. Reconstructing it later is the most expensive mistake available.
- **Write for someone who wasn't there.** The audience is a manager or a client, not another analyst. Every finding needs what you saw, where you saw it, and what it means.
- **Seven days is enough time to sleep.** It's a marathon, and the quality of the report drops hard when you're tired.

## Was it worth it

Yes. It's the most realistic certification exam I've taken, the report-writing practice transfers directly to the job, and having a defensive foundation first has made the offensive work I'm doing now (the CPTS path) sharper — I know what each technique looks like from the other side.
