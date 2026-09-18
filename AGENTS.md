# Interface

- Keep visible UI text limited to numbers and usernames outside the manual. Use icons for labels and actions; keep explanations and rule details in the manual. Preserve accessible names for screen readers.
- Tile inspectors use the same tappable terrain icons as the manual. Show a single concise effect value rather than multiple conditional values; explain exceptions in the manual.

# Deployments

- Deploy with `bash deploy.sh` or `npm run deploy`. Use `--dry-run` to validate without publishing. Do not bypass the Wrangler deployment guard.
- Before deploying from another checkout, bring in the latest deployment tooling and `releases/` catalog from the shared branch. The script refuses to drop any release already present in production. Resolve that failure by incorporating the missing archives, never by disabling the check.
- `releases/` contains immutable server code, client files, and WASM used by existing rooms. Never edit or delete an archived release. Make changes in `worker/index.js`, `worker/wasm.js`, `engine/`, and `public/`; deployment captures a new release automatically.
- Keep the exported `Room` Durable Object class, namespace, persisted release IDs, and bootstrap release intact. An unknown release must fail rather than fall back to the latest rules. Lobbies are pinned too.
- Do not introduce dependencies from an archived module into mutable source files. Keep room initialization compatible with the `loaded` constructor argument used by the release dispatcher.
