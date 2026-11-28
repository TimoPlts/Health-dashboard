# Data model

Schema source of truth: `src/server/db/schema.ts`. Migrations: `src/server/db/migrations/` (generated with `npx drizzle-kit generate`, applied automatically on DB open).

## Principles
- **Raw is immutable:** `raw_pages` holds each provider response verbatim (gzip, SHA-256 deduplicated). Normalized rows point to it via `raw_page_id`.
- **Idempotent:** natural primary keys, so re-imports update rows in place and never duplicate.
- **Missing ≠ zero:** no rows are synthesized. Queries return `null` when there are no rows.
- **Provenance:** every Google row has a `source_id` → `sources` (platform, recording method, device, app). Reconciled rows use platform `RECONCILED`; Google `dailyRollUp` rows use platform `ROLLUP`; demo rows use `DEMO_FICTIONAL`.
- **Time:** UTC epoch ms; `utc_offset_s` as reported by the provider.

## Tables
| Table | Key | Contents |
|---|---|---|
| `provider_connections` | provider | status, encrypted access/refresh token or API key, scopes, expiry, last error |
| `raw_pages` | id; unique(provider, resource, sha256) | original response bodies |
| `sources` | id; unique(provider, key) | provenance descriptors |
| `heart_rate_samples` | (source_id, t_ms) | bpm (int), motion context, offset |
| `observations` | (data_type, source_id, start_ms, end_ms, variant) | interval & sparse sample data; `variant` = zone / activity level |
| `daily_metrics` | (metric, date, source_id) | provider daily values (`resting_hr`, `hrv_rmssd_daily`, `spo2_avg`, `respiratory_rate`, `skin_temp_nightly`, `skin_temp_deviation`, `vo2max`, `hr_zone_<zone>_<min/max>`, …) and Google daily rollups (`total_kcal`, `kcal_hr_zone_<zone>`, `hr_day_min/avg/max`). A rollup day without a value has no row (≠ 0). |
| `sleep_sessions` / `sleep_stages` | id / (session_id, start_ms, is_short_awakening) | sessions with provider summary JSON + stage segments |
| `exercise_sessions` | id | Google exercise sessions + metricsSummary JSON |
| `hevy_workouts` / `hevy_exercises` / `hevy_sets` | id / (workout_id, idx) / (workout_id, exercise_idx, idx) | workouts (soft-deleted via `deleted_at`) |
| `hevy_exercise_templates` | id | muscle groups, equipment |
| `sync_state` | (provider, stream) | synced-through, backfill start, cursor, last success/error, row counts |
| `sync_runs` | id | run log (trigger, status, per-stream stats; no health values) |
| `settings` | key | JSON values: sleep need, HRmax override, sync interval, retention, `goals`, `todayLayout`, … |
| `derived_daily` | (metric, date) | cache of Baseline's per-day calculations (TRIMP, zone minutes, worn time); safe to drop |
| `exercise_exclusions` | session_id | owner's exclusions of provider sessions (provider rows untouched) |
| `workout_annotations` | session_id | owner's workout name, category, effort 1–10 (written for every session of a grouped workout) |
| `habits` / `habit_entries` | id / (habit_id, date) | owner-defined journal habits; one value per habit per day, no row = not logged |
| `weight_day_choice` | date | the designated morning weigh-in of a day (points at an observation by start_ms + source_id; Google rows are never modified). Missing/stale → first morning weigh-in (weight-trend@2) |
| `weight_phases` | id | cutting / maintaining / bulking phases: name, start date, starting weight, optional end date, goal and target rate; kept after they end |

Manual weigh-ins are rows in `observations` (`data_type = weight`, source `baseline/MANUAL`); an optional note is stored in that row's `attrs.note`. Added in migration `0004_weight_tracking` (new tables only; no existing table changed).

## Units
HR bpm · HRV ms · SpO₂ % · temperature °C · distance m (Google mm → m) · weight kg (Google g → kg) · height m · energy kcal · durations s (minutes where named `min`) · respiratory rate breaths/min.

## Backup & restore
- Location: `%LOCALAPPDATA%\Baseline\data\baseline.db` (see SECURITY.md); the app refuses OneDrive/repo paths.
- Backup: `npm run backup` → `%LOCALAPPDATA%\Baseline\backups\` (consistent online backup). Keep `ENCRYPTION_KEY` (in `config.env`) in a password manager: it is needed to decrypt stored tokens. Without it the data stays readable, but providers must be reconnected.
- Restore: `npm run data -- restore <backup>` (verifies, keeps a safety copy, stops and restarts the service). Migrations run automatically.
