# Roadmap

| Phase | Scope | Status |
|---|---|---|
| 0 Research & feasibility | API research, metric inventory, architecture, docs | ✅ 2026-11-26 |
| 1 Real-data integration | Google Health: 35 streams verified on the owner's account, 365-day backfill, double-count checks | ✅ 2026-11-26 |
| 2 Analytics engine | recovery, readiness, fatigue flags, sleep score/need/debt/SRI, Edwards TRIMP, zones, ACWR, derived cache, metric registry | ✅ 2026-11-26 |
| 3 Design & pages | Liquid-Glass design system, Today, Sleep, Health index, metric detail, Trends, Training, workout detail, Settings, sheets, view transitions, desktop layout | ✅ 2026-11-26 (iterate with use) |
| 4 Workouts without Hevy Pro | Google exercise sessions + Fitbit HR, grouping, exclusions, comparisons | ✅ 2026-11-26 |
| 5 Reliability | automatic sync scheduler, retry backoff, cross-process lock, sync status UI | ✅ 2026-11-26 |
| 6 Next | export + delete-all; per-workout manual labels; Hevy direct import if Pro is bought (code exists) | 🟡 |
| 7 Deployment | always-on host (BASELINE_HOME), HTTPS via Tailscale | 🟡 needs your decision |
| 8 Advanced | Google webhooks, native shell (live BLE HR / HealthKit) if still needed | 🟡 |

Calibration note: recovery, readiness and HRV/RHR baselines need 14 nights of data and ACWR needs 21 tracked days. The Fitbit Air was first worn on 2026-11-24, so these become available around 2026-12-08 and 2026-12-15.
