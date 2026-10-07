#!/bin/bash
# Hourly epoch settlement loop (operator runtime).
# Closes + funds the current epoch shortly after each UTC hour boundary.
# Required env: COORDINATOR_URL, ADMIN_TOKEN, (all chain env lives coordinator-side).
# No secrets in this file.
set -u
COORD="${COORDINATOR_URL:-http://127.0.0.1:3001}"
LOG="${CLOSER_LOG:-/tmp/opencode/closer.log}"

log() { echo "$(date -u +%FT%TZ) $*" >> "$LOG"; }

log "hourly closer armed against $COORD"
while true; do
  NOW=$(date +%s)
  NEXT=$(( (NOW / 3600 + 1) * 3600 + 150 ))
  SLEEP_FOR=$(( NEXT - NOW ))
  log "next close in ${SLEEP_FOR}s"
  sleep "$SLEEP_FOR"
  OUT=$(curl -s --max-time 120 -X POST "$COORD/api/epochs/close" \
    -H "Authorization: Bearer $ADMIN_TOKEN")
  log "close result: $(echo "$OUT" | head -c 400)"
done
