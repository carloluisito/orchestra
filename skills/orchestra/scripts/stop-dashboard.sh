#!/usr/bin/env bash
set -euo pipefail

# ========== Stop script for Orchestra dashboard server ==========
# Usage: stop-dashboard.sh <orchestra-dir>

ORCHESTRA_DIR="${1:-}"

if [[ -z "$ORCHESTRA_DIR" ]]; then
  echo '{"error": "Usage: stop-dashboard.sh <orchestra-dir>"}'
  exit 1
fi

PID_FILE="$ORCHESTRA_DIR/dashboard.pid"

if [[ ! -f "$PID_FILE" ]]; then
  echo '{"status": "not running"}'
  exit 0
fi

PID=$(cat "$PID_FILE" 2>/dev/null || true)

if [[ -z "$PID" ]]; then
  rm -f "$PID_FILE"
  echo '{"status": "not running"}'
  exit 0
fi

# Attempt to kill the process
if kill "$PID" 2>/dev/null; then
  # Wait briefly for process to exit
  for i in 1 2 3 4 5; do
    kill -0 "$PID" 2>/dev/null || break
    sleep 0.2
  done
  rm -f "$PID_FILE"
  echo '{"status": "stopped"}'
else
  # Process was already gone
  rm -f "$PID_FILE"
  echo '{"status": "already stopped"}'
fi
