#!/usr/bin/env bash
# Type-checks every Supabase Edge Function (and the shared Claude module) with Deno.
set -euo pipefail
cd "$(dirname "$0")/.."
export DENO_NO_UPDATE_CHECK=1
status=0
for fn in supabase/functions/*/index.ts; do
  echo "deno check $fn"
  deno check --config "$(dirname "$fn")/deno.json" "$fn" || status=1
done
deno check --config supabase/functions/answers/deno.json supabase/functions/_shared/anthropic.ts || status=1
exit $status
