#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
command -v node >/dev/null || { echo 'Install Node.js 24 or newer first.' >&2; exit 1; }
node -e "if (Number(process.versions.node.split('.')[0]) < 24) { console.error('Node.js 24 or newer is required.'); process.exit(1); }"
command -v npm >/dev/null || { echo 'Install npm first.' >&2; exit 1; }
if [[ ! -f node_modules/wrangler/bin/wrangler.js ]]; then
  npm ci
fi
exec node scripts/deploy.mjs "$@"
