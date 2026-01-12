#!/bin/bash
set -e

LOOP_STATE_FILE=".claude/hooks/.mayor-loop-state"
COUNTER_FILE=".claude/hooks/.mayor-loop-counter"

echo "active" > "$LOOP_STATE_FILE"
rm -f "$COUNTER_FILE"
echo "Mayor autopilot loop activated" >&2
