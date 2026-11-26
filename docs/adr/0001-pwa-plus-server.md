# ADR-0001: PWA + Node server for v1 (not native)

**Status:** accepted · 2026-11-26

## Context
Data comes from two cloud REST APIs (Google Health, Hevy). iOS PWAs cannot use HealthKit or Bluetooth. Native iOS needs an Apple Developer membership ($99/yr) for durable installs, and a Mac for local builds (EAS can build from Windows). The owner develops on Windows and wants no unnecessary subscriptions.

## Decision
Build a Next.js server + installable PWA. All credentials, sync and analytics stay server-side behind a JSON-shaped read layer so a native client can be added later.

## Consequences
- No on-device background sync; the server syncs. The server must run somewhere: (a) the Windows PC with Task Scheduler + Tailscale HTTPS for iPhone access (free, PC must be on), or (b) a small always-on host such as a VPS or home server (≈€4–6/month). **Owner decision pending.**
- Live BLE HR / HealthKit would require the native shell (Phase 8). Not needed for core features; Hevy handles live BLE HR natively.
