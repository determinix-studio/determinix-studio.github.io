#!/usr/bin/env bash
#
# preview.sh — serve this site locally and open it in your browser.
# Usage:  ./preview.sh [port]        (default port: 8000)
#
set -euo pipefail

PORT="${1:-8000}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
URL="http://localhost:${PORT}/"

cd "$DIR"

# Fail early if the port is already in use.
if lsof -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port ${PORT} is already in use. Try another, e.g.:  ./preview.sh 8001"
  exit 1
fi

echo "Serving ${DIR}"
echo "  → ${URL}"
echo "Press Ctrl+C to stop."

# Open the browser once the server is up (macOS `open`, Linux `xdg-open`).
( sleep 1
  if command -v open >/dev/null 2>&1; then open "$URL"
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL"
  fi
) &

# Serve. Prefer python3, fall back to python.
if command -v python3 >/dev/null 2>&1; then
  exec python3 -m http.server "$PORT"
elif command -v python >/dev/null 2>&1; then
  exec python -m http.server "$PORT"
else
  echo "Python not found. Install Python 3, or run any static server in this folder."
  exit 1
fi
