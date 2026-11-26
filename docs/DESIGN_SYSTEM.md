# Design system — “Pulse”

Tokens: `src/app/globals.css`. Primitives: `src/ui/primitives.tsx`. Charts: `src/ui/charts/`. Icons: `src/ui/icons.tsx` (original 24 px line set, no emoji).

## Principles
1. **Numbers first.** One hero number per card, large and tabular. Units are small and secondary. Missing values are “—”, never 0.
2. **Colour means something.** Heart = coral, sleep = blue ramp, activity = amber, recovery = mint, strength = ice blue. Everything else is neutral glass.
3. **Glass is a material, not a decoration.** One translucent layer over a quiet ambient light field. Nested glass is avoided.
4. **Progressive disclosure.** Today shows a summary. Tapping goes to detail (workout page today; metric pages planned).
5. **Honest charts.** No smoothing, no interpolation across gaps, data-driven scales, estimates labelled “est.”.

## Material: `.glass`
- Fill `--glass` (light 62 % white / dark 52 % graphite) + `backdrop-filter: blur(28px) saturate(170%)` refracting the fixed `.ambient` field (three low-alpha radial lights).
- **Rim:** 1 px gradient border via mask, bright at top-left and fading toward bottom-right (consistent light source).
- **Specular:** radial sheen in the top-left third (`::after`).
- Fallback without backdrop-filter: opaque `--glass-strong`.
- Radius 26 px cards, full pills for the tab bar and buttons.

## Type
System SF Pro on iOS (`-apple-system`), Inter fallback elsewhere. Large title 34/700/−0.02em, hero numbers 48/600, card titles 16–17/600, labels 13/500, captions 11–12. `tabular-nums` for all numbers.

## Colour tokens (light / dark)
| Token | Light | Dark | Use |
|---|---|---|---|
| `--ink`, `--ink-2`, `--ink-3` | 100/70/60 % | 100/72/56 % | text hierarchy (all ≥ 4.5:1, checked with axe) |
| `--heart` | #f0503c | #ff6a55 | HR, zones (single-hue ordinal opacity ramp) |
| `--sleep-awake / rem / light / deep` | #f47230 #6aabf1 #2370cd #0e3d7e | #e76624 #84b9f3 #338ced #1757ac | sleep stages: ordinal blue ramp + orange awake |
| `--activity` | #e8930c | #ffb02e | steps/energy |
| `--recovery` | #13a679 | #3ddc97 | HRV, OK status |
| `--strength` | #1c68b4 | #5ab4ff | training, links |

Sleep-stage palette was checked with the dataviz palette validator: adjacent CVD ΔE ≥ 12 and normal-vision ΔE ≥ 15 in both modes. Stage is also encoded by row position and legend text, so colour is never the only cue.

## Components
- `PageTitle` (large title + eyebrow + trailing action), `SectionLabel`, `Glass`, `Stat`, `MetricLabel`, `Badge`.
- `TabBar`: floating glass capsule with a Motion `layoutId` pill (instant under `prefers-reduced-motion`). Safe-area aware.
- `Ring` (progress; null → empty track), `Sparkline` (breaks across missing days), `ZoneBars`, `Hypnogram` (tap/hover tooltip), `HrChart` (crosshair tooltip, zone bands, workout markers, gap breaks).
- `SyncButton` (starts background sync, polls, refreshes).

## Layout
Mobile-first column, max 560 px, 16 px gutters, bottom padding clears the tab bar + home indicator. `viewport-fit=cover` + `env(safe-area-inset-*)`. Desktop currently shows the same centred column. A wider desktop layout is planned.

## Avoid list (enforced in review)
Generic dashboard grids, neon/glow everywhere, random purple gradients, emoji icons, pill overload, placeholder copy, fake stats outside demo mode, decorative charts.
