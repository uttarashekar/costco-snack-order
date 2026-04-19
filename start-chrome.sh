#!/bin/bash
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PROFILE_DIR="$HOME/.costco-chrome-profile"
PORT=9222

if curl -s http://127.0.0.1:$PORT/json/version > /dev/null 2>&1; then
  echo "✓ Chrome already running with debugging on port $PORT."
  exit 0
fi

echo "Launching Chrome with debugging on port $PORT..."
"$CHROME" --remote-debugging-port=$PORT --user-data-dir="$PROFILE_DIR" --no-first-run &>/dev/null &

for i in $(seq 1 15); do
  if curl -s http://127.0.0.1:$PORT/json/version > /dev/null 2>&1; then
    echo "✓ Chrome ready on port $PORT."
    echo ""
    echo "  First time? Log into sameday.costco.com in this Chrome window."
    echo "  Your session will be saved in $PROFILE_DIR"
    echo ""
    echo "  Then run: npm run reorder"
    exit 0
  fi
  sleep 1
done

echo "❌ Failed to start Chrome with debugging. Is another Chrome instance running?"
exit 1
