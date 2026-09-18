# Deploying Meridian

From this directory, run:

```sh
bash deploy.sh
```

This works in Git Bash on Windows and Bash on macOS/Linux. Requirements: Node.js 24+, npm, Rust with `wasm32-unknown-unknown`, and the existing Wrangler login (`npx wrangler login` if signed out). Dependencies are installed automatically when Wrangler is missing. `npm run deploy` uses the same release pipeline after `npm ci`.

```sh
bash deploy.sh --dry-run             # build and validate, without publishing
bash deploy.sh --release RELEASE_ID  # roll back NEW rooms to an archived build
```

The script builds Rust/WASM, captures a content-addressed release, verifies every retained file, runs five focused release tests, checks the production release catalog, and publishes. It takes an exclusive local deployment lock. Direct Wrangler publishing is blocked because it could bypass these protections. If the process is interrupted, first check that it has stopped, then remove `.deploy.lock` before retrying.

## Existing matches

Each room stores an immutable release ID in SQLite. The stable `Room` dispatcher loads that release's complete server implementation and WASM for commands, AI, alarms, socket messages, and reconnects. It never substitutes the latest release. Existing lobbies stay pinned when configured or started.

Invitation links and refreshes resolve the room's release before loading its browser client. Scripts, styles, normal maps, models, audio and preview WASM have release-scoped URLs. Every new room uses the current release, including when created from an old preview. A client whose release does not match its room is sent a reload before receiving a gameplay connection. Existing rooms keep their pinned client when rejoined. Choosing an archived release changes new rooms and the homepage, not existing rooms.

The initial bootstrap is a captured copy of the deployed Worker, WASM and browser assets. Previously created rooms without a release ID are assigned that baseline without rebuilding their state. Pre-v4 rooms retain their original engine binaries and legacy client. This protection starts with this rollout; releases before it did not have per-build IDs.

Cloudflare may restart an object or socket during deployment. The client reconnects to the persisted room and its original rules; this is not a promise of uninterrupted network connections. Ordinary deployments replace the running Worker, which is why the immutable dispatcher is necessary. [Cloudflare deployment documentation](https://developers.cloudflare.com/workers/versions-and-deployments/).

## Keeping history safe

Commit `releases/` with deployment changes so other checkouts retain all live versions. The production catalog prevents a stale checkout from deleting another deployment's archives. Bring in the latest shared changes before deploying; do not force past that check. The immutable files are SHA-256 verified, and identical server WASM binaries are stored only once.

Archives are retained, not automatically pruned. A future size-limit failure must be resolved without deleting versions referenced by rooms. The script stops on build, integrity, compatibility or upload failures instead of silently changing existing games. `.deploy/` is generated and ignored by Git.

`npm run dev` builds and captures the local client, then serves the same dispatcher on port 8793. After source edits, restart it to prepare a new local release. Existing local rooms continue using their old release, just like production.
