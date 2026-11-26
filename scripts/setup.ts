/**
 * Creates .env.local with freshly generated secrets and your app password hash.
 *   npm run setup -- "your app password"
 * Refuses to overwrite an existing .env.local (secrets there encrypt your stored tokens).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { hashPassword } from "../src/server/crypto";

const password = process.argv[2];
if (!password || password.length < 10) {
  console.error('Usage: npm run setup -- "<app password, min 10 chars>"');
  process.exit(1);
}
if (existsSync(".env.local")) {
  console.error(".env.local already exists — not overwriting. To change only the password, run: npm run hash-password -- \"<password>\"");
  process.exit(1);
}
const tpl = readFileSync(".env.example", "utf8");
const out = tpl
  .replace(/^APP_PASSWORD_HASH=.*$/m, `APP_PASSWORD_HASH=${hashPassword(password)}`)
  .replace(/^SESSION_SECRET=.*$/m, `SESSION_SECRET=${randomBytes(32).toString("base64")}`)
  .replace(/^ENCRYPTION_KEY=.*$/m, `ENCRYPTION_KEY=${randomBytes(32).toString("base64")}`);
writeFileSync(".env.local", out, { mode: 0o600 });
console.log("Wrote .env.local with generated SESSION_SECRET, ENCRYPTION_KEY and APP_PASSWORD_HASH.");
console.log("Next: add GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (docs/SETUP_GOOGLE.md), then `npm run dev`.");
console.log("Back up ENCRYPTION_KEY securely — without it the stored provider tokens cannot be decrypted.");
