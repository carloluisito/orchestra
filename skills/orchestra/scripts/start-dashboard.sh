#!/usr/bin/env bash
set -euo pipefail

# ========== Cross-platform start script for Orchestra dashboard server ==========
# Usage: start-dashboard.sh --orchestra-dir <path> [--host <bind-host>] [--url-host <display-host>] [--foreground] [--background]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_SCRIPT="$SCRIPT_DIR/dashboard-server.cjs"

# ========== Defaults ==========
ORCHESTRA_DIR=""
HOST="127.0.0.1"
URL_HOST="localhost"
FORCE_FOREGROUND=false
FORCE_BACKGROUND=false

# ========== Argument Parsing ==========
while [[ $# -gt 0 ]]; do
  case "$1" in
    --orchestra-dir)  ORCHESTRA_DIR="$2"; shift 2 ;;
    --host)           HOST="$2"; shift 2 ;;
    --url-host)       URL_HOST="$2"; shift 2 ;;
    --foreground)     FORCE_FOREGROUND=true; shift ;;
    --background)     FORCE_BACKGROUND=true; shift ;;
    *)
      echo "{\"error\": \"Unknown argument: $1\"}"
      exit 1
      ;;
  esac
done

# ========== Validation ==========
if [[ -z "$ORCHESTRA_DIR" ]]; then
  echo '{"error": "--orchestra-dir is required"}'
  exit 1
fi

if [[ ! -d "$ORCHESTRA_DIR" ]]; then
  echo "{\"error\": \"Orchestra directory not found: $ORCHESTRA_DIR\"}"
  exit 1
fi

if [[ ! -f "$SERVER_SCRIPT" ]]; then
  echo "{\"error\": \"Server script not found: $SERVER_SCRIPT\"}"
  exit 1
fi

# ========== Cross-Platform Auto-Detection ==========
# Windows (Git Bash / msys / cygwin / mingw) => force foreground
# Codex CI => force foreground
# --background flag overrides auto-foreground

AUTO_FOREGROUND=false

if [[ "${OSTYPE:-}" == *msys* ]] || [[ "${OSTYPE:-}" == *cygwin* ]] || [[ "${OSTYPE:-}" == *mingw* ]] || [[ -n "${MSYSTEM:-}" ]]; then
  AUTO_FOREGROUND=true
fi

if [[ -n "${CODEX_CI:-}" ]]; then
  AUTO_FOREGROUND=true
fi

# Determine run mode
RUN_FOREGROUND=false
if [[ "$FORCE_FOREGROUND" == true ]]; then
  RUN_FOREGROUND=true
elif [[ "$FORCE_BACKGROUND" == true ]]; then
  RUN_FOREGROUND=false
elif [[ "$AUTO_FOREGROUND" == true ]]; then
  RUN_FOREGROUND=true
fi

# ========== Kill Existing Server ==========
PID_FILE="$ORCHESTRA_DIR/dashboard.pid"
LOG_FILE="$ORCHESTRA_DIR/dashboard.log"

if [[ -f "$PID_FILE" ]]; then
  OLD_PID=$(cat "$PID_FILE" 2>/dev/null || true)
  if [[ -n "$OLD_PID" ]]; then
    kill "$OLD_PID" 2>/dev/null || true
    # Brief wait for process to exit
    for i in 1 2 3 4 5; do
      kill -0 "$OLD_PID" 2>/dev/null || break
      sleep 0.2
    done
  fi
  rm -f "$PID_FILE"
fi

# ========== Resolve Owner PID ==========
# Grandparent of this script: the process that launched the caller
OWNER_PID=""
if command -v ps >/dev/null 2>&1; then
  OWNER_PID=$(ps -o ppid= -p "$PPID" 2>/dev/null | tr -d ' ' || true)
fi

# ========== Environment Variables ==========
export ORCHESTRA_DIR
export ORCHESTRA_HOST="$HOST"
export ORCHESTRA_URL_HOST="$URL_HOST"
export ORCHESTRA_OWNER_PID="${OWNER_PID:-}"

# ========== Launch Server ==========
if [[ "$RUN_FOREGROUND" == true ]]; then
  # ---------- Foreground Mode ----------
  # Run node directly; the caller is expected to use run_in_background on the Bash tool call
  node "$SERVER_SCRIPT" &
  SERVER_PID=$!
  echo "$SERVER_PID" > "$PID_FILE"

  # Wait up to 5 seconds for server-started in stdout
  # In foreground mode we can't easily tail a log, so we wait and check the PID file and info file
  for i in $(seq 1 50); do
    if [[ -f "$ORCHESTRA_DIR/dashboard-info.json" ]]; then
      break
    fi
    sleep 0.1
  done

  # Verify server is still alive
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    rm -f "$PID_FILE"
    echo '{"error": "Server process exited immediately"}'
    exit 1
  fi

  # Read the dashboard-info.json for output
  if [[ -f "$ORCHESTRA_DIR/dashboard-info.json" ]]; then
    INFO=$(cat "$ORCHESTRA_DIR/dashboard-info.json")
    echo "{\"type\": \"server-started\", \"pid\": $SERVER_PID, \"foreground\": true, \"info\": $INFO}"
  else
    echo "{\"error\": \"Server started (PID $SERVER_PID) but did not write dashboard-info.json within 5 seconds\"}"
    exit 1
  fi

  # Keep the script alive so the foreground node process continues
  wait "$SERVER_PID" 2>/dev/null || true

else
  # ---------- Background Mode ----------
  rm -f "$LOG_FILE"
  nohup node "$SERVER_SCRIPT" > "$LOG_FILE" 2>&1 &
  SERVER_PID=$!
  disown "$SERVER_PID" 2>/dev/null || true
  echo "$SERVER_PID" > "$PID_FILE"

  # Wait up to 5 seconds for server-started in log file
  STARTED=false
  for i in $(seq 1 50); do
    if [[ -f "$LOG_FILE" ]] && grep -q "server-started" "$LOG_FILE" 2>/dev/null; then
      STARTED=true
      break
    fi
    sleep 0.1
  done

  # Verify server is still alive (catches process reapers)
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    rm -f "$PID_FILE"
    # Try to capture any error from log
    LOG_CONTENT=""
    if [[ -f "$LOG_FILE" ]]; then
      LOG_CONTENT=$(cat "$LOG_FILE" 2>/dev/null || true)
    fi
    echo "{\"error\": \"Server process exited immediately\", \"log\": $(echo "$LOG_CONTENT" | head -5 | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))' 2>/dev/null || echo '""')}"
    exit 1
  fi

  if [[ "$STARTED" == true ]]; then
    # Output the server-started JSON line from the log
    grep "server-started" "$LOG_FILE" | head -1
  else
    echo "{\"error\": \"Server started (PID $SERVER_PID) but did not report ready within 5 seconds\"}"
    exit 1
  fi
fi
