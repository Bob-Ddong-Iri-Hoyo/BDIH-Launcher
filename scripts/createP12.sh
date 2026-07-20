#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/private"
IDENTITY_NAME="${BDIH_SIGNING_IDENTITY:-BDIH Launcher Update Signing}"
VALIDITY_DAYS="${BDIH_SIGNING_VALIDITY_DAYS:-3650}"
PRIVATE_KEY_FILE_NAME="launcher-private-key.pem"
CERTIFICATE_FILE_NAME="bdih-code-signing.crt"
P12_FILE_NAME="bdih-code-signing.p12"
FORCE=0
COPY_BASE64=0
REEXPORT_P12=0
PREPARE_RENEWAL=0
ACTIVATE_RENEWAL_ID=""
CONFIRM_BRIDGE_RELEASE=0
BRIDGE_OUTPUT_DIR="$ROOT_DIR/build/signing/bridge"

print_help() {
  cat <<'EOF'
Usage: ./scripts/createP12.sh [options]

Creates a self-signed macOS code-signing identity and exports it as PKCS#12.
This is not an Apple Developer ID certificate and cannot be notarized.

Options:
  --force                 Replace the existing key, certificate, and .p12.
  --reexport-p12          Rebuild only .p12 in a macOS-compatible format.
  --prepare-renewal       Create a replacement identity and bridge requirements.
  --activate-renewal <id> Promote a prepared identity after bridge releases ship.
  --confirm-bridge-release
                          Required acknowledgement for --activate-renewal.
  --output-dir <path>     Override the output directory (default: ./private).
  --bridge-output-dir <path>
                          Override public bridge metadata output (default:
                          ./build/signing/bridge).
  --copy-base64           Copy the resulting .p12 as Base64 to the clipboard.
  --help                  Show this help.

Environment:
  BDIH_SIGNING_PASSWORD       Skip the interactive password prompt.
  BDIH_RENEWAL_PASSWORD       Password for a prepared replacement identity.
  BDIH_SIGNING_IDENTITY       Certificate name (default: BDIH Launcher Update Signing).
  BDIH_SIGNING_VALIDITY_DAYS  Certificate validity in days (default: 3650).
EOF
}

while (($# > 0)); do
  case "$1" in
    --force)
      FORCE=1
      shift
      ;;
    --copy-base64)
      COPY_BASE64=1
      shift
      ;;
    --reexport-p12)
      REEXPORT_P12=1
      shift
      ;;
    --prepare-renewal)
      PREPARE_RENEWAL=1
      shift
      ;;
    --activate-renewal)
      if (($# < 2)); then
        echo "--activate-renewal requires a renewal id." >&2
        exit 1
      fi
      ACTIVATE_RENEWAL_ID="$2"
      shift 2
      ;;
    --confirm-bridge-release)
      CONFIRM_BRIDGE_RELEASE=1
      shift
      ;;
    --output-dir)
      if (($# < 2)); then
        echo "--output-dir requires a path." >&2
        exit 1
      fi
      OUTPUT_DIR="$2"
      shift 2
      ;;
    --bridge-output-dir)
      if (($# < 2)); then
        echo "--bridge-output-dir requires a path." >&2
        exit 1
      fi
      BRIDGE_OUTPUT_DIR="$2"
      shift 2
      ;;
    --help)
      print_help
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      print_help >&2
      exit 1
      ;;
  esac
done

MODE_COUNT=$((REEXPORT_P12 + PREPARE_RENEWAL))
if [[ -n "$ACTIVATE_RENEWAL_ID" ]]; then
  MODE_COUNT=$((MODE_COUNT + 1))
fi

if ((MODE_COUNT > 1)); then
  echo "Choose only one of --reexport-p12, --prepare-renewal, or --activate-renewal." >&2
  exit 1
fi

if ((FORCE == 1 && MODE_COUNT > 0)); then
  echo "--force cannot be combined with a renewal or re-export mode." >&2
  exit 1
fi

if ((CONFIRM_BRIDGE_RELEASE == 1)) && [[ -z "$ACTIVATE_RENEWAL_ID" ]]; then
  echo "--confirm-bridge-release is only valid with --activate-renewal." >&2
  exit 1
fi

if ((PREPARE_RENEWAL == 1 && COPY_BASE64 == 1)); then
  echo "--copy-base64 is intentionally unavailable during --prepare-renewal." >&2
  echo "Copy the replacement only during confirmed --activate-renewal." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required." >&2
  exit 1
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "OpenSSL is required." >&2
  exit 1
fi

if ! [[ "$VALIDITY_DAYS" =~ ^[1-9][0-9]*$ ]]; then
  echo "BDIH_SIGNING_VALIDITY_DAYS must be a positive integer." >&2
  exit 1
fi

OUTPUT_DIR="$(mkdir -p "$OUTPUT_DIR" && cd "$OUTPUT_DIR" && pwd)"
chmod 700 "$OUTPUT_DIR"

PRIVATE_KEY_PATH="$OUTPUT_DIR/$PRIVATE_KEY_FILE_NAME"
CERTIFICATE_PATH="$OUTPUT_DIR/$CERTIFICATE_FILE_NAME"
P12_PATH="$OUTPUT_DIR/$P12_FILE_NAME"

copy_p12_base64_to_clipboard() {
  local source_p12="${1:-$P12_PATH}"

  if ! command -v pbcopy >/dev/null 2>&1 || ! command -v pbpaste >/dev/null 2>&1; then
    echo "pbcopy and pbpaste are required to copy and verify the Base64 value." >&2
    return 1
  fi

  base64 -i "$source_p12" | pbcopy

  if command -v shasum >/dev/null 2>&1; then
    local expected_hash
    local clipboard_hash

    expected_hash="$(base64 -i "$source_p12" | shasum -a 256 | awk '{print $1}')"
    clipboard_hash="$(pbpaste | shasum -a 256 | awk '{print $1}')"

    if [[ "$expected_hash" != "$clipboard_hash" ]]; then
      echo "Clipboard verification failed; the copied value does not match the PKCS#12 Base64." >&2
      return 1
    fi
  fi

  echo "Base64 PKCS#12 copied and verified for MACOS_SIGNING_P12_BASE64."
}

read_existing_signing_password() {
  CURRENT_SIGNING_PASSWORD="${BDIH_SIGNING_PASSWORD:-}"

  if [[ -z "$CURRENT_SIGNING_PASSWORD" ]]; then
    read -r -s -p "Current signing password: " CURRENT_SIGNING_PASSWORD
    printf '\n'
  fi

  if [[ -z "$CURRENT_SIGNING_PASSWORD" ]]; then
    echo "Current signing password must not be empty." >&2
    exit 1
  fi
}

read_renewal_password() {
  RENEWAL_PASSWORD="${BDIH_RENEWAL_PASSWORD:-}"

  if [[ -z "$RENEWAL_PASSWORD" ]]; then
    read -r -s -p "Replacement signing password: " RENEWAL_PASSWORD
    printf '\n'
    read -r -s -p "Confirm replacement signing password: " RENEWAL_PASSWORD_CONFIRM
    printf '\n'

    if [[ "$RENEWAL_PASSWORD" != "$RENEWAL_PASSWORD_CONFIRM" ]]; then
      echo "Replacement signing passwords do not match." >&2
      exit 1
    fi
  fi

  if [[ -z "$RENEWAL_PASSWORD" ]]; then
    echo "Replacement signing password must not be empty." >&2
    exit 1
  fi
}

certificate_sha1() {
  openssl x509 -in "$1" -outform DER \
    | openssl dgst -sha1 -r \
    | awk '{print toupper($1)}'
}

certificate_sha256() {
  openssl x509 -in "$1" -outform DER \
    | openssl dgst -sha256 -r \
    | awk '{print toupper($1)}'
}

certificate_not_after_iso() {
  local not_after
  not_after="$(openssl x509 -in "$1" -noout -enddate | cut -d= -f2-)"
  node -e '
    const value = Date.parse(process.argv[1]);
    if (!Number.isFinite(value)) process.exit(1);
    process.stdout.write(new Date(value).toISOString());
  ' "$not_after"
}

read_signing_password() {
  SIGNING_PASSWORD="${BDIH_SIGNING_PASSWORD:-}"

  if [[ -z "$SIGNING_PASSWORD" ]]; then
    read -r -s -p "Signing password: " SIGNING_PASSWORD
    printf '\n'
    read -r -s -p "Confirm signing password: " SIGNING_PASSWORD_CONFIRM
    printf '\n'

    if [[ "$SIGNING_PASSWORD" != "$SIGNING_PASSWORD_CONFIRM" ]]; then
      echo "Passwords do not match." >&2
      exit 1
    fi
  fi

  if [[ -z "$SIGNING_PASSWORD" ]]; then
    echo "Signing password must not be empty." >&2
    exit 1
  fi
}

if ((PREPARE_RENEWAL == 1)); then
  if [[ ! -f "$P12_PATH" ]]; then
    echo "The active PKCS#12 is required to prepare a renewal: $P12_PATH" >&2
    exit 1
  fi

  if ! command -v csreq >/dev/null 2>&1; then
    echo "macOS csreq is required to validate bridge requirements." >&2
    exit 1
  fi

  BRIDGE_OUTPUT_DIR="$(mkdir -p "$BRIDGE_OUTPUT_DIR" && cd "$BRIDGE_OUTPUT_DIR" && pwd)"
  chmod 755 "$BRIDGE_OUTPUT_DIR"
  ACTIVE_BRIDGE_MANIFEST="$BRIDGE_OUTPUT_DIR/active.json"

  if [[ -e "$ACTIVE_BRIDGE_MANIFEST" ]]; then
    echo "A signing-certificate bridge is already active: $ACTIVE_BRIDGE_MANIFEST" >&2
    echo "Complete or archive that bridge before preparing another renewal." >&2
    exit 1
  fi

  read_existing_signing_password
  read_renewal_password
  export BDIH_CURRENT_SIGNING_PASSWORD="$CURRENT_SIGNING_PASSWORD"
  export BDIH_PRIVATE_KEY_PASSWORD="$RENEWAL_PASSWORD"

  TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/bdih-prepare-renewal.XXXXXX")"
  chmod 700 "$TEMP_DIR"
  TEMP_CURRENT_CERTIFICATE_BUNDLE="$TEMP_DIR/current-certificate-bundle.pem"
  TEMP_CURRENT_CERTIFICATE="$TEMP_DIR/current-certificate.crt"
  TEMP_CURRENT_PRIVATE_KEY="$TEMP_DIR/current-private-key.pem"
  TEMP_REPLACEMENT_DIR="$TEMP_DIR/replacement"
  TEMP_BRIDGE_DIR="$TEMP_DIR/bridge"
  TEMP_ACTIVE_MANIFEST="$TEMP_DIR/active.json"
  mkdir -p "$TEMP_REPLACEMENT_DIR" "$TEMP_BRIDGE_DIR"
  chmod 700 "$TEMP_REPLACEMENT_DIR"

  cleanup() {
    find "$TEMP_DIR" -type f -delete >/dev/null 2>&1 || true
    find "$TEMP_DIR" -depth -type d -exec rmdir {} \; >/dev/null 2>&1 || true
  }
  trap cleanup EXIT INT TERM

  openssl pkcs12 \
    -legacy \
    -in "$P12_PATH" \
    -nokeys \
    -passin env:BDIH_CURRENT_SIGNING_PASSWORD \
    -out "$TEMP_CURRENT_CERTIFICATE_BUNDLE"
  openssl x509 \
    -in "$TEMP_CURRENT_CERTIFICATE_BUNDLE" \
    -out "$TEMP_CURRENT_CERTIFICATE"
  openssl pkcs12 \
    -legacy \
    -in "$P12_PATH" \
    -nocerts \
    -nodes \
    -passin env:BDIH_CURRENT_SIGNING_PASSWORD \
    -out "$TEMP_CURRENT_PRIVATE_KEY"
  chmod 600 "$TEMP_CURRENT_PRIVATE_KEY"

  CURRENT_P12_KEY_PUBLIC_HASH="$(
    openssl pkey -in "$TEMP_CURRENT_PRIVATE_KEY" -pubout \
      | openssl dgst -sha256
  )"
  CURRENT_P12_CERTIFICATE_PUBLIC_HASH="$(
    openssl x509 -in "$TEMP_CURRENT_CERTIFICATE" -pubkey -noout \
      | openssl dgst -sha256
  )"

  if [[ "$CURRENT_P12_KEY_PUBLIC_HASH" != "$CURRENT_P12_CERTIFICATE_PUBLIC_HASH" ]]; then
    echo "The active .p12 private key does not match its certificate." >&2
    exit 1
  fi

  if [[ -f "$CERTIFICATE_PATH" ]]; then
    ACTIVE_CERTIFICATE_SHA256="$(certificate_sha256 "$CERTIFICATE_PATH")"
    P12_CERTIFICATE_SHA256="$(certificate_sha256 "$TEMP_CURRENT_CERTIFICATE")"

    if [[ "$ACTIVE_CERTIFICATE_SHA256" != "$P12_CERTIFICATE_SHA256" ]]; then
      echo "The active .crt does not match the certificate stored in the active .p12." >&2
      exit 1
    fi
  fi

  node "$SCRIPT_DIR/createPrivate.mjs" --output-dir "$TEMP_REPLACEMENT_DIR" >/dev/null

  REPLACEMENT_PRIVATE_KEY="$TEMP_REPLACEMENT_DIR/$PRIVATE_KEY_FILE_NAME"
  REPLACEMENT_CERTIFICATE="$TEMP_REPLACEMENT_DIR/$CERTIFICATE_FILE_NAME"
  REPLACEMENT_P12="$TEMP_REPLACEMENT_DIR/$P12_FILE_NAME"

  openssl req -new -x509 -sha256 \
    -days "$VALIDITY_DAYS" \
    -key "$REPLACEMENT_PRIVATE_KEY" \
    -passin env:BDIH_PRIVATE_KEY_PASSWORD \
    -out "$REPLACEMENT_CERTIFICATE" \
    -subj "/CN=$IDENTITY_NAME/O=BDIH Launcher" \
    -addext "basicConstraints=critical,CA:TRUE" \
    -addext "keyUsage=critical,digitalSignature,keyCertSign" \
    -addext "extendedKeyUsage=codeSigning"

  openssl pkcs12 -export \
    -legacy \
    -inkey "$REPLACEMENT_PRIVATE_KEY" \
    -passin env:BDIH_PRIVATE_KEY_PASSWORD \
    -in "$REPLACEMENT_CERTIFICATE" \
    -name "$IDENTITY_NAME" \
    -out "$REPLACEMENT_P12" \
    -passout env:BDIH_PRIVATE_KEY_PASSWORD

  openssl pkey \
    -in "$REPLACEMENT_PRIVATE_KEY" \
    -passin env:BDIH_PRIVATE_KEY_PASSWORD \
    -check -noout
  openssl pkcs12 \
    -legacy \
    -in "$REPLACEMENT_P12" \
    -passin env:BDIH_PRIVATE_KEY_PASSWORD \
    -info -noout >/dev/null 2>&1

  OLD_CERTIFICATE_SHA1="$(certificate_sha1 "$TEMP_CURRENT_CERTIFICATE")"
  NEW_CERTIFICATE_SHA1="$(certificate_sha1 "$REPLACEMENT_CERTIFICATE")"
  OLD_CERTIFICATE_SHA256="$(certificate_sha256 "$TEMP_CURRENT_CERTIFICATE")"
  NEW_CERTIFICATE_SHA256="$(certificate_sha256 "$REPLACEMENT_CERTIFICATE")"

  if [[ "$OLD_CERTIFICATE_SHA1" == "$NEW_CERTIFICATE_SHA1" ]]; then
    echo "Replacement certificate unexpectedly matches the active certificate." >&2
    exit 1
  fi

  RENEWAL_ID="renewal-$(date -u +%Y%m%dT%H%M%SZ)-${NEW_CERTIFICATE_SHA1:0:12}"
  RENEWAL_ROOT="$OUTPUT_DIR/renewal"
  RENEWAL_TARGET="$RENEWAL_ROOT/$RENEWAL_ID"
  PUBLIC_BRIDGE_TARGET="$BRIDGE_OUTPUT_DIR/$RENEWAL_ID"

  if [[ -e "$RENEWAL_TARGET" || -e "$PUBLIC_BRIDGE_TARGET" ]]; then
    echo "Renewal output already exists for $RENEWAL_ID." >&2
    exit 1
  fi

  mkdir -p "$RENEWAL_ROOT"
  chmod 700 "$RENEWAL_ROOT"

  STABLE_REQUIREMENTS_PATH="$(node -e '
    const path = require("path");
    const value = path.relative(process.argv[1], process.argv[2]);
    process.stdout.write(value.startsWith("..") ? process.argv[2] : value);
  ' "$ROOT_DIR" "$PUBLIC_BRIDGE_TARGET/stable.requirements")"
  NIGHTLY_REQUIREMENTS_PATH="$(node -e '
    const path = require("path");
    const value = path.relative(process.argv[1], process.argv[2]);
    process.stdout.write(value.startsWith("..") ? process.argv[2] : value);
  ' "$ROOT_DIR" "$PUBLIC_BRIDGE_TARGET/nightly.requirements")"

  export RENEWAL_ID IDENTITY_NAME
  export OLD_CERTIFICATE_SHA1 NEW_CERTIFICATE_SHA1
  export OLD_CERTIFICATE_SHA256 NEW_CERTIFICATE_SHA256
  export OLD_CERTIFICATE_NOT_AFTER="$(certificate_not_after_iso "$TEMP_CURRENT_CERTIFICATE")"
  export NEW_CERTIFICATE_NOT_AFTER="$(certificate_not_after_iso "$REPLACEMENT_CERTIFICATE")"
  export STABLE_REQUIREMENTS_PATH NIGHTLY_REQUIREMENTS_PATH
  export TEMP_BRIDGE_DIR TEMP_ACTIVE_MANIFEST

  node <<'NODE'
  const fs = require("fs");
  const path = require("path");

  const stableRequirement =
    `designated => identifier "day.faby.bdih-launcher" and ` +
    `(certificate leaf = H"${process.env.OLD_CERTIFICATE_SHA1}" or ` +
    `certificate leaf = H"${process.env.NEW_CERTIFICATE_SHA1}")\n`;
  const nightlyRequirement =
    `designated => identifier "day.faby.bdih-launcher.nightly" and ` +
    `(certificate leaf = H"${process.env.OLD_CERTIFICATE_SHA1}" or ` +
    `certificate leaf = H"${process.env.NEW_CERTIFICATE_SHA1}")\n`;
  const manifest = {
    schemaVersion: 1,
    state: "prepared",
    renewalId: process.env.RENEWAL_ID,
    createdAt: new Date().toISOString(),
    identity: process.env.IDENTITY_NAME,
    stableRequirements: process.env.STABLE_REQUIREMENTS_PATH,
    nightlyRequirements: process.env.NIGHTLY_REQUIREMENTS_PATH,
    oldCertificate: {
      sha1: process.env.OLD_CERTIFICATE_SHA1,
      sha256: process.env.OLD_CERTIFICATE_SHA256,
      notAfter: process.env.OLD_CERTIFICATE_NOT_AFTER,
    },
    newCertificate: {
      sha1: process.env.NEW_CERTIFICATE_SHA1,
      sha256: process.env.NEW_CERTIFICATE_SHA256,
      notAfter: process.env.NEW_CERTIFICATE_NOT_AFTER,
    },
  };

  fs.writeFileSync(path.join(process.env.TEMP_BRIDGE_DIR, "stable.requirements"), stableRequirement);
  fs.writeFileSync(path.join(process.env.TEMP_BRIDGE_DIR, "nightly.requirements"), nightlyRequirement);
  fs.writeFileSync(path.join(process.env.TEMP_BRIDGE_DIR, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(process.env.TEMP_ACTIVE_MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
NODE

  csreq -r "$TEMP_BRIDGE_DIR/stable.requirements" -t >/dev/null
  csreq -r "$TEMP_BRIDGE_DIR/nightly.requirements" -t >/dev/null

  chmod 600 "$REPLACEMENT_PRIVATE_KEY" "$REPLACEMENT_P12"
  chmod 644 "$REPLACEMENT_CERTIFICATE"
  mv "$TEMP_REPLACEMENT_DIR" "$RENEWAL_TARGET"
  mv "$TEMP_BRIDGE_DIR" "$PUBLIC_BRIDGE_TARGET"
  mv "$TEMP_ACTIVE_MANIFEST" "$ACTIVE_BRIDGE_MANIFEST"
  chmod 644 "$ACTIVE_BRIDGE_MANIFEST" "$PUBLIC_BRIDGE_TARGET"/*

  unset BDIH_CURRENT_SIGNING_PASSWORD BDIH_PRIVATE_KEY_PASSWORD

  echo
  echo "Prepared signing-certificate renewal without replacing the active identity:"
  echo "  Renewal id:         $RENEWAL_ID"
  echo "  Private replacement: $RENEWAL_TARGET"
  echo "  Public bridge data:  $PUBLIC_BRIDGE_TARGET"
  echo "  Active bridge:       $ACTIVE_BRIDGE_MANIFEST"
  echo "  Old SHA-1:           $OLD_CERTIFICATE_SHA1"
  echo "  New SHA-1:           $NEW_CERTIFICATE_SHA1"
  echo
  echo "Keep the existing GitHub signing secrets while publishing bridge releases."
  echo "Commit the public bridge directory and active.json; never commit $RENEWAL_TARGET."

  exit 0
fi

if [[ -n "$ACTIVATE_RENEWAL_ID" ]]; then
  if ((CONFIRM_BRIDGE_RELEASE != 1)); then
    echo "Refusing to activate a replacement identity without --confirm-bridge-release." >&2
    echo "First publish and test bridge releases for stable, beta, and Nightly." >&2
    exit 1
  fi

  if ! [[ "$ACTIVATE_RENEWAL_ID" =~ ^renewal-[0-9A-Za-z._-]+$ ]]; then
    echo "Invalid renewal id: $ACTIVATE_RENEWAL_ID" >&2
    exit 1
  fi

  if [[ ! -d "$BRIDGE_OUTPUT_DIR" ]]; then
    echo "Bridge metadata directory does not exist: $BRIDGE_OUTPUT_DIR" >&2
    exit 1
  fi

  BRIDGE_OUTPUT_DIR="$(cd "$BRIDGE_OUTPUT_DIR" && pwd)"
  ACTIVE_BRIDGE_MANIFEST="$BRIDGE_OUTPUT_DIR/active.json"
  RENEWAL_TARGET="$OUTPUT_DIR/renewal/$ACTIVATE_RENEWAL_ID"

  if [[ ! -f "$ACTIVE_BRIDGE_MANIFEST" ]]; then
    echo "There is no active bridge manifest to activate." >&2
    exit 1
  fi

  MANIFEST_RENEWAL_ID="$(node -e '
    const fs = require("fs");
    const value = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    process.stdout.write(String(value.renewalId ?? ""));
  ' "$ACTIVE_BRIDGE_MANIFEST")"

  if [[ "$MANIFEST_RENEWAL_ID" != "$ACTIVATE_RENEWAL_ID" ]]; then
    echo "Active bridge is $MANIFEST_RENEWAL_ID, not $ACTIVATE_RENEWAL_ID." >&2
    exit 1
  fi

  COMPLETED_MANIFEST="$BRIDGE_OUTPUT_DIR/completed-$ACTIVATE_RENEWAL_ID.json"
  if [[ -e "$COMPLETED_MANIFEST" ]]; then
    echo "Completed bridge manifest already exists: $COMPLETED_MANIFEST" >&2
    exit 1
  fi

  for required in \
    "$RENEWAL_TARGET/$PRIVATE_KEY_FILE_NAME" \
    "$RENEWAL_TARGET/$CERTIFICATE_FILE_NAME" \
    "$RENEWAL_TARGET/$P12_FILE_NAME"; do
    if [[ ! -f "$required" ]]; then
      echo "Prepared renewal material is missing: $required" >&2
      exit 1
    fi
  done

  read_renewal_password
  export BDIH_PRIVATE_KEY_PASSWORD="$RENEWAL_PASSWORD"
  TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/bdih-activate-renewal.XXXXXX")"
  chmod 700 "$TEMP_DIR"

  cleanup() {
    find "$TEMP_DIR" -type f -delete >/dev/null 2>&1 || true
    find "$TEMP_DIR" -depth -type d -exec rmdir {} \; >/dev/null 2>&1 || true
  }
  trap cleanup EXIT INT TERM

  RENEWAL_PRIVATE_KEY="$RENEWAL_TARGET/$PRIVATE_KEY_FILE_NAME"
  RENEWAL_CERTIFICATE="$RENEWAL_TARGET/$CERTIFICATE_FILE_NAME"
  RENEWAL_P12="$RENEWAL_TARGET/$P12_FILE_NAME"
  TEMP_P12_CERTIFICATE_BUNDLE="$TEMP_DIR/p12-certificate-bundle.pem"
  TEMP_P12_CERTIFICATE="$TEMP_DIR/p12-certificate.crt"
  TEMP_P12_PRIVATE_KEY="$TEMP_DIR/p12-private-key.pem"

  openssl pkcs12 \
    -legacy \
    -in "$RENEWAL_P12" \
    -nokeys \
    -passin env:BDIH_PRIVATE_KEY_PASSWORD \
    -out "$TEMP_P12_CERTIFICATE_BUNDLE"
  openssl x509 -in "$TEMP_P12_CERTIFICATE_BUNDLE" -out "$TEMP_P12_CERTIFICATE"
  openssl pkcs12 \
    -legacy \
    -in "$RENEWAL_P12" \
    -nocerts \
    -nodes \
    -passin env:BDIH_PRIVATE_KEY_PASSWORD \
    -out "$TEMP_P12_PRIVATE_KEY"
  chmod 600 "$TEMP_P12_PRIVATE_KEY"

  KEY_PUBLIC_HASH="$(
    openssl pkey \
      -in "$RENEWAL_PRIVATE_KEY" \
      -passin env:BDIH_PRIVATE_KEY_PASSWORD \
      -pubout \
      | openssl dgst -sha256
  )"
  CERTIFICATE_PUBLIC_HASH="$(
    openssl x509 -in "$RENEWAL_CERTIFICATE" -pubkey -noout \
      | openssl dgst -sha256
  )"

  if [[ "$KEY_PUBLIC_HASH" != "$CERTIFICATE_PUBLIC_HASH" ]]; then
    echo "Prepared private key does not match its certificate." >&2
    exit 1
  fi

  P12_KEY_PUBLIC_HASH="$(
    openssl pkey -in "$TEMP_P12_PRIVATE_KEY" -pubout \
      | openssl dgst -sha256
  )"
  if [[ "$P12_KEY_PUBLIC_HASH" != "$CERTIFICATE_PUBLIC_HASH" ]]; then
    echo "Prepared .p12 private key does not match the prepared certificate." >&2
    exit 1
  fi

  if [[ "$(certificate_sha256 "$RENEWAL_CERTIFICATE")" != "$(certificate_sha256 "$TEMP_P12_CERTIFICATE")" ]]; then
    echo "Prepared .p12 does not contain the prepared certificate." >&2
    exit 1
  fi

  EXPECTED_NEW_SHA1="$(node -e '
    const fs = require("fs");
    const value = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    process.stdout.write(String(value.newCertificate?.sha1 ?? ""));
  ' "$ACTIVE_BRIDGE_MANIFEST")"
  ACTUAL_NEW_SHA1="$(certificate_sha1 "$RENEWAL_CERTIFICATE")"

  if [[ "$EXPECTED_NEW_SHA1" != "$ACTUAL_NEW_SHA1" ]]; then
    echo "Prepared certificate does not match the active bridge manifest." >&2
    exit 1
  fi

  EXPECTED_OLD_SHA1="$(node -e '
    const fs = require("fs");
    const value = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    process.stdout.write(String(value.oldCertificate?.sha1 ?? ""));
  ' "$ACTIVE_BRIDGE_MANIFEST")"
  ARCHIVE_DIR="$OUTPUT_DIR/archive/${ACTIVATE_RENEWAL_ID}-old-${EXPECTED_OLD_SHA1:0:12}"

  if [[ -e "$ARCHIVE_DIR" ]]; then
    echo "Archive destination already exists: $ARCHIVE_DIR" >&2
    exit 1
  fi

  mkdir -p "$ARCHIVE_DIR"
  chmod 700 "$OUTPUT_DIR/archive" "$ARCHIVE_DIR"

  for current in "$PRIVATE_KEY_PATH" "$CERTIFICATE_PATH" "$P12_PATH"; do
    if [[ -f "$current" ]]; then
      cp "$current" "$ARCHIVE_DIR/"
    fi
  done

  cp "$RENEWAL_PRIVATE_KEY" "$TEMP_DIR/$PRIVATE_KEY_FILE_NAME"
  cp "$RENEWAL_CERTIFICATE" "$TEMP_DIR/$CERTIFICATE_FILE_NAME"
  cp "$RENEWAL_P12" "$TEMP_DIR/$P12_FILE_NAME"
  chmod 600 "$TEMP_DIR/$PRIVATE_KEY_FILE_NAME" "$TEMP_DIR/$P12_FILE_NAME"
  chmod 644 "$TEMP_DIR/$CERTIFICATE_FILE_NAME"

  mv -f "$TEMP_DIR/$PRIVATE_KEY_FILE_NAME" "$PRIVATE_KEY_PATH"
  mv -f "$TEMP_DIR/$CERTIFICATE_FILE_NAME" "$CERTIFICATE_PATH"
  mv -f "$TEMP_DIR/$P12_FILE_NAME" "$P12_PATH"

  export ACTIVE_BRIDGE_MANIFEST COMPLETED_MANIFEST
  node <<'NODE'
  const fs = require("fs");
  const manifest = JSON.parse(fs.readFileSync(process.env.ACTIVE_BRIDGE_MANIFEST, "utf8"));
  manifest.state = "activated";
  manifest.activatedAt = new Date().toISOString();
  fs.writeFileSync(process.env.COMPLETED_MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
NODE
  chmod 644 "$COMPLETED_MANIFEST"
  find "$ACTIVE_BRIDGE_MANIFEST" -delete

  unset BDIH_PRIVATE_KEY_PASSWORD

  echo
  echo "Activated replacement signing identity:"
  echo "  Renewal id:     $ACTIVATE_RENEWAL_ID"
  echo "  Active SHA-1:   $ACTUAL_NEW_SHA1"
  echo "  Old key archive: $ARCHIVE_DIR"
  echo "  Completed bridge: $COMPLETED_MANIFEST"
  echo
  echo "Update MACOS_SIGNING_P12_BASE64 and MACOS_SIGNING_P12_PASSWORD before committing the bridge deactivation."

  if ((COPY_BASE64 == 1)); then
    copy_p12_base64_to_clipboard "$P12_PATH"
  fi

  exit 0
fi

if ((REEXPORT_P12 == 1)); then
  if ((FORCE == 1)); then
    echo "--reexport-p12 and --force cannot be used together." >&2
    exit 1
  fi

  for required in "$PRIVATE_KEY_PATH" "$CERTIFICATE_PATH"; do
    if [[ ! -f "$required" ]]; then
      echo "Required signing material is missing: $required" >&2
      exit 1
    fi
  done

  read_signing_password
  export BDIH_PRIVATE_KEY_PASSWORD="$SIGNING_PASSWORD"

  TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/bdih-reexport-p12.XXXXXX")"
  chmod 700 "$TEMP_DIR"
  TEMP_P12_PATH="$TEMP_DIR/$P12_FILE_NAME"

  cleanup() {
    find "$TEMP_DIR" -type f -delete >/dev/null 2>&1 || true
    rmdir "$TEMP_DIR" >/dev/null 2>&1 || true
  }
  trap cleanup EXIT INT TERM

  KEY_PUBLIC_HASH="$(
    openssl pkey \
      -in "$PRIVATE_KEY_PATH" \
      -passin env:BDIH_PRIVATE_KEY_PASSWORD \
      -pubout \
      | openssl dgst -sha256
  )"
  CERTIFICATE_PUBLIC_HASH="$(
    openssl x509 \
      -in "$CERTIFICATE_PATH" \
      -pubkey \
      -noout \
      | openssl dgst -sha256
  )"

  if [[ "$KEY_PUBLIC_HASH" != "$CERTIFICATE_PUBLIC_HASH" ]]; then
    echo "The private key does not match the certificate; refusing to replace .p12." >&2
    exit 1
  fi

  openssl pkcs12 -export \
    -legacy \
    -inkey "$PRIVATE_KEY_PATH" \
    -passin env:BDIH_PRIVATE_KEY_PASSWORD \
    -in "$CERTIFICATE_PATH" \
    -name "$IDENTITY_NAME" \
    -out "$TEMP_P12_PATH" \
    -passout env:BDIH_PRIVATE_KEY_PASSWORD

  openssl pkcs12 \
    -legacy \
    -in "$TEMP_P12_PATH" \
    -passin env:BDIH_PRIVATE_KEY_PASSWORD \
    -info -noout >/dev/null 2>&1

  mv -f "$TEMP_P12_PATH" "$P12_PATH"
  chmod 600 "$P12_PATH"
  unset BDIH_PRIVATE_KEY_PASSWORD

  echo "Re-exported macOS-compatible PKCS#12 without rotating the signing identity:"
  echo "  PKCS#12: $P12_PATH"

  if ((COPY_BASE64 == 1)); then
    copy_p12_base64_to_clipboard
  fi

  exit 0
fi

if ((FORCE == 0)); then
  if ((COPY_BASE64 == 1)) && [[ -f "$P12_PATH" ]]; then
    echo "Using existing PKCS#12 without rotating the signing identity: $P12_PATH"
    copy_p12_base64_to_clipboard
    exit 0
  fi

  for target in "$PRIVATE_KEY_PATH" "$CERTIFICATE_PATH" "$P12_PATH"; do
    if [[ -e "$target" ]]; then
      echo "Signing material already exists: $target" >&2
      echo "Use --force only when intentionally rotating the signing identity." >&2
      exit 1
    fi
  done
else
  echo "Warning: --force rotates the signing identity. Existing installations may require a manual reinstall." >&2
fi

read_signing_password

TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/bdih-create-p12.XXXXXX")"
chmod 700 "$TEMP_DIR"

cleanup() {
  find "$TEMP_DIR" -type f -delete >/dev/null 2>&1 || true
  rmdir "$TEMP_DIR" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

export BDIH_PRIVATE_KEY_PASSWORD="$SIGNING_PASSWORD"

node "$SCRIPT_DIR/createPrivate.mjs" --output-dir "$TEMP_DIR" >/dev/null

TEMP_PRIVATE_KEY_PATH="$TEMP_DIR/$PRIVATE_KEY_FILE_NAME"
TEMP_CERTIFICATE_PATH="$TEMP_DIR/$CERTIFICATE_FILE_NAME"
TEMP_P12_PATH="$TEMP_DIR/$P12_FILE_NAME"

openssl req -new -x509 -sha256 \
  -days "$VALIDITY_DAYS" \
  -key "$TEMP_PRIVATE_KEY_PATH" \
  -passin env:BDIH_PRIVATE_KEY_PASSWORD \
  -out "$TEMP_CERTIFICATE_PATH" \
  -subj "/CN=$IDENTITY_NAME/O=BDIH Launcher" \
  -addext "basicConstraints=critical,CA:TRUE" \
  -addext "keyUsage=critical,digitalSignature,keyCertSign" \
  -addext "extendedKeyUsage=codeSigning"

openssl pkcs12 -export \
  -legacy \
  -inkey "$TEMP_PRIVATE_KEY_PATH" \
  -passin env:BDIH_PRIVATE_KEY_PASSWORD \
  -in "$TEMP_CERTIFICATE_PATH" \
  -name "$IDENTITY_NAME" \
  -out "$TEMP_P12_PATH" \
  -passout env:BDIH_PRIVATE_KEY_PASSWORD

openssl pkey \
  -in "$TEMP_PRIVATE_KEY_PATH" \
  -passin env:BDIH_PRIVATE_KEY_PASSWORD \
  -check -noout
openssl x509 \
  -in "$TEMP_CERTIFICATE_PATH" \
  -checkend 0 -noout
openssl pkcs12 \
  -legacy \
  -in "$TEMP_P12_PATH" \
  -passin env:BDIH_PRIVATE_KEY_PASSWORD \
  -info -noout >/dev/null 2>&1

mv -f "$TEMP_PRIVATE_KEY_PATH" "$PRIVATE_KEY_PATH"
mv -f "$TEMP_CERTIFICATE_PATH" "$CERTIFICATE_PATH"
mv -f "$TEMP_P12_PATH" "$P12_PATH"
chmod 600 "$PRIVATE_KEY_PATH" "$P12_PATH"
chmod 644 "$CERTIFICATE_PATH"

unset BDIH_PRIVATE_KEY_PASSWORD

echo
echo "Self-signed code-signing bundle created:"
echo "  Private key: $PRIVATE_KEY_PATH"
echo "  Certificate: $CERTIFICATE_PATH"
echo "  PKCS#12:     $P12_PATH"
echo "  Identity:    $IDENTITY_NAME"
echo "  Validity:    $VALIDITY_DAYS days"

if ((COPY_BASE64 == 1)); then
  copy_p12_base64_to_clipboard
fi

echo
echo "GitHub Actions secrets:"
echo "  MACOS_SIGNING_P12_BASE64  <- Base64 of $P12_FILE_NAME"
echo "  MACOS_SIGNING_P12_PASSWORD <- the password entered above"
echo
echo "Workflow signing identity: $IDENTITY_NAME"
