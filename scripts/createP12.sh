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

print_help() {
  cat <<'EOF'
Usage: ./scripts/createP12.sh [options]

Creates a self-signed macOS code-signing identity and exports it as PKCS#12.
This is not an Apple Developer ID certificate and cannot be notarized.

Options:
  --force                 Replace the existing key, certificate, and .p12.
  --reexport-p12          Rebuild only .p12 in a macOS-compatible format.
  --output-dir <path>     Override the output directory (default: ./private).
  --copy-base64           Copy the resulting .p12 as Base64 to the clipboard.
  --help                  Show this help.

Environment:
  BDIH_SIGNING_PASSWORD       Skip the interactive password prompt.
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
    --output-dir)
      if (($# < 2)); then
        echo "--output-dir requires a path." >&2
        exit 1
      fi
      OUTPUT_DIR="$2"
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
  if ! command -v pbcopy >/dev/null 2>&1 || ! command -v pbpaste >/dev/null 2>&1; then
    echo "pbcopy and pbpaste are required to copy and verify the Base64 value." >&2
    return 1
  fi

  base64 -i "$P12_PATH" | pbcopy

  if command -v shasum >/dev/null 2>&1; then
    local expected_hash
    local clipboard_hash

    expected_hash="$(base64 -i "$P12_PATH" | shasum -a 256 | awk '{print $1}')"
    clipboard_hash="$(pbpaste | shasum -a 256 | awk '{print $1}')"

    if [[ "$expected_hash" != "$clipboard_hash" ]]; then
      echo "Clipboard verification failed; the copied value does not match the PKCS#12 Base64." >&2
      return 1
    fi
  fi

  echo "Base64 PKCS#12 copied and verified for MACOS_SIGNING_P12_BASE64."
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
