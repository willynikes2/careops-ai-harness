#!/usr/bin/env bash
# Rebuilds the CareOps KB instance from seed/kb-docs (its data is derived; nothing else lives there).
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose rm -sf careops-kb
docker volume rm careops_careops-kb-data
docker compose up -d careops-kb
for i in $(seq 1 30); do
  docker compose exec -T careops node -e "fetch('http://careops-kb:3838/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" && break
  sleep 2
done
docker compose run --rm careops node scripts/load-kb.js
