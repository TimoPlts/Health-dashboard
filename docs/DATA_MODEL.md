# Data model

Schema source of truth: `src/server/db/schema.ts`. Migrations: `src/server/db/migrations/` (generated with `npx drizzle-kit generate`, applied automatically on DB open).

## Principles
- **Raw is immutable:** `raw_pages` holds each provider response verbatim (gzip, SHA-256 deduplicated). Normalized rows point to it via `raw_page_id`.
- **Idempotent:** natural primary keys, so re-imports update rows in place and never duplicate.
- **Missing ≠ zero:** no rows are synthesized. Queries return `null` when there are no rows.
- **Provenance:** every Google row has a `source_id` → `sources` (platform, recording method, device, app). Reconciled rows use platform `RECONCILED`; demo rows use `DEMO_FICTIONAL`.
- **Time:** UTC epoch ms; `utc_offset_s` as reported by the provider.

## Tables
| Table | Key | Contents |
|---|---|---|
| `provider_connections` | provider | status, encrypted access/refresh token or API key, scopes, expiry, last error |
| `raw_pages` | id; unique(provider, resource, sha256) | original response bodies |
| `sources` | id; unique(provider, key) | provenance descriptors |
| `heart_rate_samples` | (source_id, t_ms) | bpm (int), motion context, offset |
| `observations` | (data_type, source_id, start_ms, end_ms, variant) | interval & sparse sample data; `variant` = zone / activity level |
| `daily_metrics` | (metric, date, source_id) | provider daily values (`resting_hr`, `hrv_rmssd_daily`, `spo2_avg`, `respiratory_rate`, `skin_temp_nightly`, `skin_temp_deviation`, `vo2max`, `hr_zone_<zone>_<min/max>`, …) |
| `sleep_sessions` / `sleep_stages` | id / (session_id, start_ms, is_short_awakening) | sessions with provider summary JSON + stage segments |
| `exercise_sessions` | id | Google exercise sessions + metricsSummary JSON |
| `hevy_workouts` / `hevy_exercises` / `hevy_sets` | id / (workout_id, idx) / (workout_id, exercise_idx, idx) | workouts (soft-deleted via `deleted_at`) |
| `hevy_exercise_templates` | id | muscle groups, equipment |
| `sync_state` | (provider, stream) | synced-through, backfill start, cursor, last success/error, row counts |
| `sync_runs` | id | run log (trigger, status, per-stream stats; no health values) |
| `settings` | key | JSON values (UI planned) |

## Units
HR bpm · HRV ms · SpO₂ % · temperature °C · distance m (Google mm → m) · weight kg (Google g → kg) · height m · energy kcal · durations s (minutes where named `min`) · respiratory rate breaths/min.

## Backup & restore
- Stop the app, copy `data/health.db` (plus `-wal`/`-shm` if present) **and** keep `.env.local` (`ENCRYPTION_KEY` is needed to decrypt stored tokens). Without the key, data stays readable but providers must be reconnected.
- Online backup: `sqlite3 data/health.db ".backup backup.db"`.
- Restore: put the file back at `DATABASE_PATH` and start the app. Migrations run automatically.
- Do not keep the DB in a synced cloud folder you share. See SECURITY.md about OneDrive.
