#!/usr/bin/env bash
# Fix Chromium "profile in use on another computer" after hostname rename
# (e.g. baronpi → rpi3-view). Safe only when Chromium is not running.
set -euo pipefail

CHROME_DIR="${HOME}/.config/chromium"

if pgrep -x chromium >/dev/null 2>&1; then
  echo "Chromium is running — close it first, then re-run." >&2
  exit 1
fi

echo "hostname: $(hostname)"
echo "before:"
ls -la "$CHROME_DIR"/Singleton* 2>/dev/null || echo "  (no Singleton* files)"

rm -f "$CHROME_DIR/SingletonLock" \
      "$CHROME_DIR/SingletonCookie" \
      "$CHROME_DIR/SingletonSocket"
# Old lock target names like baronpi-1349
find "$CHROME_DIR" -maxdepth 1 -name 'baronpi-*' -delete 2>/dev/null || true
rm -rf /tmp/org.chromium.Chromium.* 2>/dev/null || true

echo "after:"
ls -la "$CHROME_DIR"/Singleton* 2>/dev/null || echo "  (none — good)"

echo
echo "Smoke: chromium-browser --version"
timeout 15 chromium-browser --version

echo
echo "Done. Open Chromium from the menu, or:"
echo "  chromium-browser http://127.0.0.1/"
echo "If it fails again with a lock, another session still holds the profile."
