#!/usr/bin/env bash

set -euo pipefail

if (($# != 1)); then
  echo "Usage: ./scripts/verifyMacosSigningBridge.sh <path-to-app>" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_PATH="$1"
ACTIVE_MANIFEST="$ROOT_DIR/build/signing/bridge/active.json"

if [[ ! -f "$ACTIVE_MANIFEST" ]]; then
  echo "No active signing-certificate bridge; default designated requirement is in use."
  exit 0
fi

if [[ ! -d "$APP_PATH" ]]; then
  echo "Packaged application does not exist: $APP_PATH" >&2
  exit 1
fi

BUNDLE_IDENTIFIER="$(
  /usr/libexec/PlistBuddy \
    -c 'Print :CFBundleIdentifier' \
    "$APP_PATH/Contents/Info.plist"
)"

case "$BUNDLE_IDENTIFIER" in
  day.faby.bdih-launcher)
    EXPECTED_IDENTIFIER="day.faby.bdih-launcher"
    ;;
  day.faby.bdih-launcher.nightly)
    EXPECTED_IDENTIFIER="day.faby.bdih-launcher.nightly"
    ;;
  *)
    echo "Unexpected bundle identifier for signing bridge: $BUNDLE_IDENTIFIER" >&2
    exit 1
    ;;
esac

OLD_CERTIFICATE_SHA1="$(node -e '
  const fs = require("fs");
  const manifest = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  process.stdout.write(String(manifest.oldCertificate?.sha1 ?? ""));
' "$ACTIVE_MANIFEST")"
NEW_CERTIFICATE_SHA1="$(node -e '
  const fs = require("fs");
  const manifest = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  process.stdout.write(String(manifest.newCertificate?.sha1 ?? ""));
' "$ACTIVE_MANIFEST")"

if ! [[ "$OLD_CERTIFICATE_SHA1" =~ ^[0-9A-Fa-f]{40}$ ]]; then
  echo "Active bridge has an invalid old certificate SHA-1." >&2
  exit 1
fi

if ! [[ "$NEW_CERTIFICATE_SHA1" =~ ^[0-9A-Fa-f]{40}$ ]]; then
  echo "Active bridge has an invalid replacement certificate SHA-1." >&2
  exit 1
fi

DESIGNATED_REQUIREMENT="$(codesign -dr - "$APP_PATH" 2>&1)"
NORMALIZED_REQUIREMENT="$(
  printf '%s' "$DESIGNATED_REQUIREMENT" | tr '[:lower:]' '[:upper:]'
)"
NORMALIZED_IDENTIFIER="$(printf '%s' "$EXPECTED_IDENTIFIER" | tr '[:lower:]' '[:upper:]')"

for expected in "$NORMALIZED_IDENTIFIER" "$OLD_CERTIFICATE_SHA1" "$NEW_CERTIFICATE_SHA1"; do
  normalized_expected="$(printf '%s' "$expected" | tr '[:lower:]' '[:upper:]')"

  if [[ "$NORMALIZED_REQUIREMENT" != *"$normalized_expected"* ]]; then
    echo "Bridge designated requirement is missing: $expected" >&2
    printf '%s\n' "$DESIGNATED_REQUIREMENT" >&2
    exit 1
  fi
done

echo "Verified bridge designated requirement for $BUNDLE_IDENTIFIER:"
echo "  Old certificate SHA-1: $OLD_CERTIFICATE_SHA1"
echo "  New certificate SHA-1: $NEW_CERTIFICATE_SHA1"
