# ADR-0002: SQLite via better-sqlite3 + Drizzle

**Status:** accepted · 2026-11-26

Single user, single process, write volume ~10⁴–10⁵ HR rows/day. SQLite (WAL) is fast enough, needs no server, and backs up as one file. Drizzle gives typed queries and generated SQL migrations. Revisit (PostgreSQL) only for multi-user or multi-process deployments.
