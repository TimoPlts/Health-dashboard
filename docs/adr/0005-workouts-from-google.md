# ADR-0005: Workouts from Google exercise sessions; Hevy out of scope

**Status:** accepted · 2026-11-26

## Context
The Hevy API needs Hevy Pro, which the owner does not have. Real-data inspection showed that Hevy writes each workout to Apple Health, and Google Health imports it as an `exercise` session (`HEALTH_KIT`, `com.hevyapp.hevy`). That session carries only the type (`STRENGTH_TRAINING`), a generic name, an active duration and a calorie estimate, with **no exercises, sets, reps or weights**. Hevy sometimes writes a workout twice, and the Fitbit Air may detect the same workout itself.

## Decision
- Workouts are built from Google `exercise` sessions plus the Air's heart rate.
  - Sessions of the same type that overlap ≥ 50 % of the shorter one are grouped into one workout, keeping every source's provenance.
  - Method: [CALCULATIONS → WORKOUTS](../CALCULATIONS.md).
- Strength detail is never inferred or fabricated.
- Wrongly detected workouts can be excluded. Exclusions live in their own table and never modify provider data.
- The existing Hevy client stays optional and unused. No page, metric or sync depends on it.

## Consequences
- Every workout gets HR analytics (zones, load, HR recovery) without Hevy Pro.
- Exercise-level history (volume, e1RM, progression) is unavailable until a Hevy Pro import is chosen.
