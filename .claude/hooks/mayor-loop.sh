#!/bin/bash
set -e

LOOP_STATE_FILE=".claude/hooks/.mayor-loop-state"
MAX_ITERATIONS="${MAYOR_MAX_ITERATIONS:-100}"
COUNTER_FILE=".claude/hooks/.mayor-loop-counter"

payload=$(cat)

if [[ ! -f "$LOOP_STATE_FILE" ]] || [[ "$(cat "$LOOP_STATE_FILE")" != "active" ]]; then
  exit 0
fi

if [[ ! -f "$COUNTER_FILE" ]]; then
  echo "1" > "$COUNTER_FILE"
fi

count=$(cat "$COUNTER_FILE")

if [[ $count -ge $MAX_ITERATIONS ]]; then
  echo "inactive" > "$LOOP_STATE_FILE"
  rm -f "$COUNTER_FILE"
  exit 0
fi

echo $((count + 1)) > "$COUNTER_FILE"
echo "Mayor autopilot iteration $((count + 1))/$MAX_ITERATIONS" >&2
exit 1
