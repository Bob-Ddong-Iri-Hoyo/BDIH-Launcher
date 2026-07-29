#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_ROOT="${BDIH_TEST_DATA_ROOT:-$SCRIPT_DIR/tmp_test_resource}"
BOTTLES_DIR="$DATA_ROOT/Bottles"
RECOVERY_DIR="$DATA_ROOT/Recovery"
SEED_DIR="${BDIH_HOYO_SEED_DIR:-$RECOVERY_DIR/yuki-hoyo-1.16.1.364-seed}"
TARGET_DIR="${BDIH_HOYO_TARGET_DIR:-$BOTTLES_DIR/yuki-hoyo}"
TARGET_PREFIX_DIR="$TARGET_DIR/hoyo-prefix"
SEED_PREFIX_DIR="$SEED_DIR/hoyo-prefix"
TARGET_HOYOPLAY_DIR="$TARGET_PREFIX_DIR/drive_c/Program Files/HoYoPlay"
SEED_HOYOPLAY_DIR="$SEED_PREFIX_DIR/drive_c/Program Files/HoYoPlay"
EXPECTED_VERSION="1.16.1.364"
EXPECTED_LAUNCHER_SHA256="07fc2587adafb9c2145574cfa67a3efeb6362ced2bbee8b8bf744e954879f351"
EXPECTED_CLIENT_SHA256="5fc52f1bb03f923e62df4640919cdbf3e66f77adea5fe033895672acc824a03a"
LAUNCHER_RELATIVE_PATH="launcher.exe"
CLIENT_RELATIVE_PATH="$EXPECTED_VERSION/HYP.exe"

usage() {
  cat <<'EOF'
Usage: ./resethoyo.sh

Restores only C:\Program Files\HoYoPlay in the yuki-hoyo Bottle from the
preserved HoYoPlay 1.16.1.364 seed. The Wine prefix, registry, AppData,
.update-timestamp, Bottle metadata, runtime selection, and caches are left
unchanged. The current HoYoPlay directory is backed up under
tmp_test_resource/Recovery before it is replaced.

Close the development BDIH Launcher and HoYoPlay before running this script.

Optional environment overrides:
  BDIH_TEST_DATA_ROOT   Test data root (default: ./tmp_test_resource)
  BDIH_HOYO_SEED_DIR   HoYoPlay 1.16 seed directory
  BDIH_HOYO_TARGET_DIR Target yuki-hoyo Bottle directory
EOF
}

if (($# > 0)); then
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      exit 2
      ;;
  esac
fi

fail() {
  printf 'resethoyo: %s\n' "$*" >&2
  exit 1
}

sha256_for_file() {
  shasum -a 256 "$1" | awk '{print $1}'
}

[[ "$TARGET_DIR" == "$BOTTLES_DIR/yuki-hoyo" ]] \
  || fail "refusing unexpected target path: $TARGET_DIR"
[[ -d "$SEED_DIR" ]] || fail "seed directory is missing: $SEED_DIR"
[[ -f "$SEED_DIR/seed-manifest.json" ]] || fail "seed manifest is missing"
[[ -d "$SEED_PREFIX_DIR" ]] || fail "seed hoyo-prefix is missing: $SEED_PREFIX_DIR"
[[ -d "$SEED_HOYOPLAY_DIR" ]] || fail "seed HoYoPlay directory is missing: $SEED_HOYOPLAY_DIR"
[[ -f "$SEED_HOYOPLAY_DIR/$LAUNCHER_RELATIVE_PATH" ]] || fail "seed launcher.exe is missing"
[[ -f "$SEED_HOYOPLAY_DIR/$CLIENT_RELATIVE_PATH" ]] || fail "seed HYP.exe is missing"
[[ -d "$TARGET_DIR" ]] || fail "target Bottle is missing: $TARGET_DIR"
[[ -d "$TARGET_PREFIX_DIR" ]] || fail "target hoyo-prefix is missing: $TARGET_PREFIX_DIR"
[[ -d "$TARGET_PREFIX_DIR/drive_c/Program Files" ]] \
  || fail "target Program Files directory is missing: $TARGET_PREFIX_DIR/drive_c/Program Files"
command -v shasum >/dev/null 2>&1 || fail "shasum is required to verify the seed"

ACTIVE_TARGET_PIDS="$(pgrep -f "$TARGET_DIR" 2>/dev/null || true)"
if [[ -n "$ACTIVE_TARGET_PIDS" ]]; then
  fail "a process is still using yuki-hoyo (PID: ${ACTIVE_TARGET_PIDS//$'\n'/, }). Close HoYoPlay first."
fi

ACTIVE_LAUNCHER_PIDS="$(pgrep -f "bdih-guardian.*--root $DATA_ROOT" 2>/dev/null || true)"
if [[ -n "$ACTIVE_LAUNCHER_PIDS" ]]; then
  fail "the development BDIH Launcher is open (Guardian PID: ${ACTIVE_LAUNCHER_PIDS//$'\n'/, }). Close it before resetting so it cannot access the prefix while it is being replaced."
fi

ACTUAL_LAUNCHER_SHA256="$(sha256_for_file "$SEED_HOYOPLAY_DIR/$LAUNCHER_RELATIVE_PATH")"
ACTUAL_CLIENT_SHA256="$(sha256_for_file "$SEED_HOYOPLAY_DIR/$CLIENT_RELATIVE_PATH")"
[[ "$ACTUAL_LAUNCHER_SHA256" == "$EXPECTED_LAUNCHER_SHA256" ]] \
  || fail "seed launcher.exe checksum does not match the preserved 1.16 build"
[[ "$ACTUAL_CLIENT_SHA256" == "$EXPECTED_CLIENT_SHA256" ]] \
  || fail "seed HYP.exe checksum does not match the preserved 1.16 build"

mkdir -p "$BOTTLES_DIR" "$RECOVERY_DIR"

TIMESTAMP="$(date '+%Y%m%d-%H%M%S')"
STAGING_HOYOPLAY_DIR="$TARGET_PREFIX_DIR/drive_c/Program Files/.HoYoPlay-reset-$TIMESTAMP-$$"
BACKUP_HOYOPLAY_DIR="$RECOVERY_DIR/yuki-hoyo-hoyoplay-before-reset-$TIMESTAMP"

if [[ -e "$BACKUP_HOYOPLAY_DIR" ]]; then
  BACKUP_HOYOPLAY_DIR="$RECOVERY_DIR/yuki-hoyo-hoyoplay-before-reset-$TIMESTAMP-$$"
fi

cleanup_staging() {
  if [[ -e "$STAGING_HOYOPLAY_DIR" ]]; then
    rm -rf -- "$STAGING_HOYOPLAY_DIR"
  fi
}
trap cleanup_staging EXIT

printf 'Verifying and staging HoYoPlay %s application files...\n' "$EXPECTED_VERSION"
if [[ "$(uname -s)" == "Darwin" ]]; then
  cp -cR "$SEED_HOYOPLAY_DIR" "$STAGING_HOYOPLAY_DIR"
else
  cp -a "$SEED_HOYOPLAY_DIR" "$STAGING_HOYOPLAY_DIR"
fi

[[ "$(sha256_for_file "$STAGING_HOYOPLAY_DIR/$LAUNCHER_RELATIVE_PATH")" == "$EXPECTED_LAUNCHER_SHA256" ]] \
  || fail "staged launcher.exe verification failed"
[[ "$(sha256_for_file "$STAGING_HOYOPLAY_DIR/$CLIENT_RELATIVE_PATH")" == "$EXPECTED_CLIENT_SHA256" ]] \
  || fail "staged HYP.exe verification failed"

TARGET_HOYOPLAY_WAS_PRESENT=0
if [[ -e "$TARGET_HOYOPLAY_DIR" ]]; then
  mv "$TARGET_HOYOPLAY_DIR" "$BACKUP_HOYOPLAY_DIR"
  TARGET_HOYOPLAY_WAS_PRESENT=1
fi

if ! mv "$STAGING_HOYOPLAY_DIR" "$TARGET_HOYOPLAY_DIR"; then
  if ((TARGET_HOYOPLAY_WAS_PRESENT)); then
    mv "$BACKUP_HOYOPLAY_DIR" "$TARGET_HOYOPLAY_DIR"
  fi
  fail "failed to promote the staged HoYoPlay 1.16 files; the previous HoYoPlay directory was restored"
fi

trap - EXIT

printf '\nHoYoPlay application reset complete.\n'
printf '  Version:  %s\n' "$EXPECTED_VERSION"
printf '  Bottle:   %s\n' "$TARGET_DIR"
printf '  Restored: %s\n' "$TARGET_HOYOPLAY_DIR"
if ((TARGET_HOYOPLAY_WAS_PRESENT)); then
  printf '  Backup:   %s\n' "$BACKUP_HOYOPLAY_DIR"
fi
printf '  Prefix:   unchanged (including registry, AppData, and .update-timestamp)\n'
printf '  Metadata: unchanged\n'
printf '\nStart the development BDIH Launcher again and launch yuki-hoyo.\n'
