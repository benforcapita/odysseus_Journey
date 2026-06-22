#!/bin/bash
# Double-click this to start Odysseus. It opens Terminal, starts the server,
# and prints the address to open in your browser. Close the Terminal window
# (or press Ctrl+C) to stop it.
cd "$(dirname "$0")" || { echo "Could not enter the odysseus folder."; read -n 1 -s -r -p "Press any key to close."; exit 1; }

PORT="7860"
URL="http://127.0.0.1:${PORT}"

# If it's already running, just open the page.
if /usr/bin/curl -s -o /dev/null --max-time 2 "$URL"; then
  /usr/bin/open "$URL"
  exit 0
fi

echo "Starting Odysseus…"
echo "Once you see \"Application startup complete\", open this address in your browser:"
echo "    $URL"
echo "To stop Odysseus later: close this window or press Ctrl+C."
echo "------------------------------------------------------------"

if [ -x "./venv/bin/python" ]; then
  ./venv/bin/python -m uvicorn app:app --host 127.0.0.1 --port "$PORT"
else
  echo "The Python environment is missing. Run ./start-macos.sh first to set it up."
  read -n 1 -s -r -p "Press any key to close."
  exit 1
fi
