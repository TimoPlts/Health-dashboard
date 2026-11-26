@AGENTS.md

## Claude-specific notes
- Development happens on Windows (Git Bash + PowerShell). The repo sits in OneDrive; runtime data is in `%LOCALAPPDATA%\Baseline` (enforced). In Git Bash, `icacls /reset`-style flags get path-mangled; use PowerShell for those.
- Dev server binds to 127.0.0.1 (`npm run dev`). Killing the npm wrapper can orphan `next start-server.js`; check port 3000.
- Next.js 16 docs ship in `node_modules/next/dist/docs/`. Check them before relying on memory (APIs changed: `proxy.ts`, async `params`/`searchParams`/`cookies()`).
- Google Health API reference: https://developers.google.com/health/reference/rest/v4. Hevy spec: https://developers.hevy.com/openapi.json.
- The owner wants autonomy on minor decisions, questions only for credentials, paid services, consequential trade-offs, impossibilities, or irreversible actions.
