@AGENTS.md

## Claude-specific notes
- Development happens on Windows (Git Bash + PowerShell). The repo sits in OneDrive, so prefer an out-of-tree `DATABASE_PATH`.
- Next.js 16 docs ship in `node_modules/next/dist/docs/`. Check them before relying on memory (APIs changed: `proxy.ts`, async `params`/`searchParams`/`cookies()`).
- Google Health API reference: https://developers.google.com/health/reference/rest/v4. Hevy spec: https://developers.hevy.com/openapi.json.
- The owner wants autonomy on minor decisions, questions only for credentials, paid services, consequential trade-offs, impossibilities, or irreversible actions.
