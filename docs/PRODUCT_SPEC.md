# Product spec

**Baseline** is a private, single-user health & training app that shows Fitbit Air data (Google Health API) in a premium, iPhone-first interface. Hevy is out of scope ([ADR-0005](adr/0005-workouts-from-google.md)). It has no AI coaching, social features, ads or subscriptions.

## Goals
1. Replace day-to-day use of Google Health / Bevel for *looking at* data. The Google Health app keeps running in the background for device sync.
2. Accurate data with explicit provenance and documented calculations.
3. Every workout gets heart-rate analytics from the Fitbit Air.
4. Excellent mobile UX: installable, fast, readable, honest charts.

## Non-goals (v1)
AI insights, chat, social, food logging, multi-user, writing data back to providers.

## Navigation
Today · Sleep · Training · Trends · Health (tab bar), plus metric detail, workout detail and Settings. Current state: [PROJECT_STATUS](PROJECT_STATUS.md).
