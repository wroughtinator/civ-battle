# Deployments

- Deploy with `bash deploy.sh` or `npm run deploy`. Use `--dry-run` to validate without publishing. Do not bypass the Wrangler deployment guard.
- Before deploying from another checkout, bring in the latest deployment tooling and `releases/` catalog from the shared branch. The script refuses to drop any release already present in production. Resolve that failure by incorporating the missing archives, never by disabling the check.
- `releases/` contains immutable server code, client files, and WASM used by existing rooms. Never edit or delete an archived release. Make changes in `worker/index.js`, `worker/wasm.js`, `engine/`, and `public/`; deployment captures a new release automatically.
- Keep the exported `Room` Durable Object class, namespace, persisted release IDs, and bootstrap release intact. An unknown release must fail rather than fall back to the latest rules. Lobbies are pinned too.
- Do not introduce dependencies from an archived module into mutable source files. Keep room initialization compatible with the `loaded` constructor argument used by the release dispatcher.
