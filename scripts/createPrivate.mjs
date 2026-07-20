import { generateKeyPairSync, randomUUID } from "node:crypto";
import {
  chmod,
  link,
  mkdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUTPUT_DIR = path.join(ROOT, "private");
const PRIVATE_KEY_FILE_NAME = "launcher-private-key.pem";
const PRIVATE_KEY_PASSWORD_ENV = "BDIH_PRIVATE_KEY_PASSWORD";
const RSA_MODULUS_LENGTH = 2048;

function print_help() {
  console.log(`Usage: node scripts/createPrivate.mjs [options]

Creates an RSA private key for a future Apple certificate request.
This does not create an Apple Developer ID certificate or a .p12 file.

Options:
  --force                 Replace an existing private key atomically.
  --output-dir <path>     Override the output directory (default: ./private).
  --unencrypted           Allow an unencrypted PKCS#8 key.
  --help                  Show this help.

By default the key is encrypted with AES-256-CBC and the password is read from
${PRIVATE_KEY_PASSWORD_ENV}. Pass --unencrypted only for an intentionally
unencrypted local key.`);
}

function parse_arguments(args) {
  const options = {
    force: false,
    outputDir: DEFAULT_OUTPUT_DIR,
    unencrypted: false,
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (argument === "--force") {
      options.force = true;
      continue;
    }

    if (argument === "--unencrypted") {
      options.unencrypted = true;
      continue;
    }

    if (argument === "--help") {
      options.help = true;
      continue;
    }

    if (argument === "--output-dir") {
      const value = args[index + 1];

      if (!value || value.startsWith("--")) {
        throw new Error("--output-dir requires a path.");
      }

      options.outputDir = path.resolve(process.cwd(), value);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function resolve_private_key_encoding(options) {
  const password = process.env[PRIVATE_KEY_PASSWORD_ENV]?.trim();

  if (options.unencrypted) {
    if (password) {
      throw new Error(
        `Do not combine --unencrypted with ${PRIVATE_KEY_PASSWORD_ENV}.`,
      );
    }

    return {
      type: "pkcs8",
      format: "pem",
    };
  }

  if (!password) {
    throw new Error(
      `${PRIVATE_KEY_PASSWORD_ENV} is required. Set it without putting the password in this script, or pass --unencrypted explicitly.`,
    );
  }

  return {
    type: "pkcs8",
    format: "pem",
    cipher: "aes-256-cbc",
    passphrase: password,
  };
}

async function install_private_key(targetPath, privateKey, force) {
  const temporaryPath = path.join(
    path.dirname(targetPath),
    `.${path.basename(targetPath)}.${process.pid}.${randomUUID()}.tmp`,
  );

  try {
    await writeFile(temporaryPath, privateKey, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    await chmod(temporaryPath, 0o600);

    if (force) {
      await rename(temporaryPath, targetPath);
      await chmod(targetPath, 0o600);
      return;
    }

    try {
      // A hard link gives us an atomic create-without-overwrite operation.
      await link(temporaryPath, targetPath);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "EEXIST") {
        throw new Error(
          `Private key already exists: ${targetPath}\nUse --force only when intentionally rotating the key.`,
        );
      }

      throw error;
    }

    await chmod(targetPath, 0o600);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

async function main() {
  const options = parse_arguments(process.argv.slice(2));

  if (options.help) {
    print_help();
    return;
  }

  const privateKeyEncoding = resolve_private_key_encoding(options);
  const previousUmask = process.umask(0o077);

  try {
    await mkdir(options.outputDir, { recursive: true, mode: 0o700 });
    await chmod(options.outputDir, 0o700);

    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: RSA_MODULUS_LENGTH,
      publicExponent: 0x10001,
      publicKeyEncoding: {
        type: "spki",
        format: "pem",
      },
      privateKeyEncoding,
    });
    const targetPath = path.join(options.outputDir, PRIVATE_KEY_FILE_NAME);

    await install_private_key(targetPath, privateKey, options.force);
    console.log(`Private key created: ${targetPath}`);
    console.log(`Permissions: directory 0700, key 0600`);
    console.log(
      options.unencrypted
        ? "Key format: unencrypted PKCS#8 PEM"
        : `Key format: AES-256-CBC encrypted PKCS#8 PEM (${PRIVATE_KEY_PASSWORD_ENV})`,
    );
    console.log("Next step: create a CSR from this key, then request a Developer ID Application certificate from Apple.");
  } finally {
    process.umask(previousUmask);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
