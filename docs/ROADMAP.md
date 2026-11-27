# Roadmap

## Done
| Phase | Scope | Status |
|---|---|---|
| 0 Research & feasibility | API research, metric inventory, architecture, docs | ✅ 2026-11-26 |
| 1 Real-data integration | 35 Google Health streams verified on the owner's account, 365-day backfill, double-count checks | ✅ |
| 2 Analytics engine | recovery, readiness, fatigue flags, sleep score/need/debt/SRI, Edwards TRIMP, zones, ACWR, metric registry | ✅ |
| 3 Design & pages | Liquid-Glass design system, all pages, sheets, view transitions, desktop layout | ✅ |
| 4 Workouts without Hevy Pro | Google sessions + Fitbit HR, grouping, exclusions (false-detection removal), comparisons | ✅ |
| 5 Reliability | sync scheduler, backoff, cross-process lock, status UI | ✅ |
| 6 Production readiness | calculation audit ([FEATURE_AUDIT](FEATURE_AUDIT.md)), Tailscale HTTPS + tailnet gate, supervised autostart, PWA, backups/restore/export/retention/delete-all | ✅ 2026-11-26 |

## Next: prioritised features
Ranked by **usefulness** for daily use, **feasibility** with data Baseline already has, and **readiness** (how much history the feature needs). Each one is built one at a time, with the usual rules: documented method, tests, missing ≠ 0, no AI.

| # | Feature | Why | Inputs / method | Size | Depends on | Earliest useful |
|---|---|---|---|---|---|---|
| **R1** ✅ | Manual workout labels + effort | Auto-detected and Hevy-imported workouts carry generic names. A label ("Push day", "Zone 2 ride") and an optional 1–10 effort make history readable. **Exclusion of false detections already exists.** | New `workout_labels` table keyed like `exercise_exclusions`, never modifying provider rows. Effort is shown next to HR load and is not mixed into it. | S | — | now |
| **R2** ✅ | Weekly & monthly report | One page per week/month: averages vs previous period and vs baseline, best/worst days, training distribution, sleep consistency. | Existing `metricDetail` aggregates; partial-week rules as for daily totals. Generated on read, no AI text. | M | ≥ 4 weeks of data for comparisons | mid-Dec 2026 |
| **R3** ✅ | Cardio & Zone 2 view | Weekly Zone 2 minutes and AZM vs the WHO 150 min/week guideline; today's load range that keeps ACWR within 0.8–1.3. | Derived zone minutes; AZM (Google); ACWR band × chronic load (Gabbett 2016). Label as %HRmax Zone 2 (CALCULATIONS limits). | M | ACWR needs 21 tracked days | load range ≈ 2026-12-15; rest now |
| **R4** ✅ | Sleep page depth | Bedtime target from sleep need + usual wake time; overnight HRV and SpO₂ curves; awakenings; naps. | HRV/SpO₂ samples (stored, night-attributed); median wake time over 14 nights. | M | — | now |
| **R5** ✅ | Weight trend | A smoothed trend so daily water swings don't read as change. | Exponentially smoothed weight (10 % per day, Walker *The Hacker's Diet*) with raw points; only with ≥ 1 entry/week. | S | weight entries (1 so far) | when weighing regularly |
| **R6** ✅ | Daily habit journal | Log caffeine, alcohol, late meal, stretching, etc. in a few taps; the basis for R7. | Owner-defined yes/no or count habits; one row per day; quick-entry sheet on Today. | M | — | now |
| **R7** 🟡 | Habit correlations | "On days after alcohol your HRV was 9 % lower." | Next-day HRV/RHR/sleep on habit vs no-habit days: difference in means with a 95 % CI and n per group. Shown only with ≥ 8 nights in each group. Wording is "associated with", never causal. | M | R6 + several weeks of logging | ≈ 4–8 weeks after R6 |
| **R8** ✅ | Personal goals | Targets for steps, AZM/week, sleep duration, bedtime window, Zone 2 per week, with progress rings. | Owner-set targets; progress from existing metrics. Never auto-generated. | S–M | — | now |
| **R9** ✅ | Customisable Today | Choose and order the cards (vitals, activity, workouts, goals, habits). | Per-user layout in `settings`; same components. | M | R8, R6 add cards worth choosing | after R6/R8 |
| **R10** | Nutrition & hydration, energy balance | Energy in vs out, weight trend context. | Google Health has nutrition/hydration data types, but only if an app writes them (none does for this account). Energy-out error is large (CALCULATIONS → ENERGY). | M | a logging app that syncs to Google Health | conditional |
| **R11** | Hevy import (optional) | Exercises, sets, weights, e1RM, volume. | Client and normalizer exist and are tested ([ADR-0005](adr/0005-workouts-from-google.md)). | S to enable | Hevy Pro (paid; owner's decision) | conditional |
| **R12** | Live Bluetooth heart rate | Live HR during a workout in Baseline. | iOS Safari has no Web Bluetooth, so this needs a native iOS app (Swift/Expo) calling Baseline's server. | L | native app | low priority |

**Recommended order:** R1 → R4 → R3 → R8 → R6 → R2 (mid-December) → R7 → R9 → R5. Done: R1, R3, R4 (Milestone A), R6, R8, R9 (Milestone B), R2, R5 (Milestone C), 2026-11-27. R7: statistics and safeguards built; results appear once enough journal days exist. Energy balance waits for an intake source (R10). R10–R12 are conditional on a data source or purchase.

## Infrastructure (as needed)
- Start at boot without signing in: `npm run service -- install` from an administrator terminal ([DEPLOYMENT](DEPLOYMENT.md)).
- Move the repo out of OneDrive to remove the `node_modules`/`.next` sync caveat.
- Google webhooks (instead of polling) would need a public endpoint. Not planned, because the app stays tailnet-only.

## Calibration
Recovery, readiness and HRV/RHR baselines need 14 nights; ACWR needs 21 tracked days of ≥ 10 h wear. The Fitbit Air was first worn on 2026-11-24, so these become available around **2026-12-08** and **2026-12-15**. Calibration periods are not shortened.
