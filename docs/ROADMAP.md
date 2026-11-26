# Roadmap

| Phase | Scope | Status |
|---|---|---|
| 0 Research & feasibility | API research, metric inventory, architecture, docs | ✅ 2026-11-26 |
| 1 Real-data PoC | OAuth + clients + sync implemented; **run probes against real accounts**; verify filter syntax, HR resolution, populated types, history depth, workout matching | 🟡 code done, **blocked on credentials** |
| 2 Foundation | schema, normalization, idempotent sync, status/errors ✅ · 2b: export, delete-all, settings table UI, scheduled sync (Task Scheduler / in-process timer) | partly ✅ |
| 3 Design system & core UI | tokens, glass, tab bar, Today, charts, screenshot review ✅ · metric detail sheets, date navigation, desktop layout | partly ✅ |
| 4 Health & sleep | Sleep tab (history, consistency SRI, debt), Health tab (baselines, z-scores, trends) | 🟡 |
| 5 Training | progression/PRs, muscle-group sets, frequency, exercise pages, TRIMP per workout | 🟡 |
| 6 Recovery & load | app recovery index (documented, labelled), EWMA load, balance | 🟡 |
| 7 Deployment & polish | hosting decision, HTTPS (Tailscale), PWA polish, performance | 🟡 needs your decision |
| 8 Advanced | Google webhooks, native shell (live BLE HR / HealthKit) if still needed | 🟡 |

Next recommended milestone: **Phase 1 verification** (≈30 min of your time for credentials, then probes + first real sync), followed by Phase 2b + 4.
