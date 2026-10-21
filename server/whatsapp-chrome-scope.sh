#!/bin/sh
set -eu

case "${WHATSAPP_BROWSER_SITE:-}" in
  ''|*[!a-z0-9-]*) echo 'Invalid WhatsApp browser site identifier.' >&2; exit 64 ;;
esac
if [ ! -x "${WHATSAPP_CHROME_REAL:-}" ]; then
  echo 'WhatsApp browser executable is unavailable.' >&2
  exit 69
fi

set -- --scope --quiet --collect \
  --unit="whatsapp-${WHATSAPP_BROWSER_SITE}-$$" \
  --slice=whatsapp-browsers.slice \
  --property=MemoryAccounting=yes \
  --property=MemoryHigh=1073741824 \
  --property=MemoryMax=1610612736 \
  --property=MemorySwapMax=268435456 \
  --property=TasksMax=256 \
  "$WHATSAPP_CHROME_REAL" "$@"

if [ "$(id -u)" -ne 0 ]; then
  XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
  DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=${XDG_RUNTIME_DIR}/bus}"
  export XDG_RUNTIME_DIR DBUS_SESSION_BUS_ADDRESS
  exec /usr/bin/systemd-run --user "$@"
fi
exec /usr/bin/systemd-run "$@"
