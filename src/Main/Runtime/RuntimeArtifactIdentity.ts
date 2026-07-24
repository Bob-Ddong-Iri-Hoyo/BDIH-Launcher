import { createHash, randomUUID } from "crypto";
import { createReadStream, existsSync, readFileSync, renameSync, statSync, writeFileSync } from "fs";
import path from "path";

export type RuntimeArtifactKind = "wine" | "dxmt";
export type RuntimeArtifactIdentityAlgorithm = "sha256" | "fingerprint";

export interface RuntimeArtifactIdentity {
  kind: RuntimeArtifactKind;
  versionId: string;
  algorithm: RuntimeArtifactIdentityAlgorithm;
  digest: string;
}

export interface RuntimeArtifactReceipt extends RuntimeArtifactIdentity {
  schemaVersion: 1;
  artifactFileName: string;
  artifactSize: number;
  artifactMtimeMs: number;
  sourceUrl?: string;
  installedAt: string;
}

const WINE_ARTIFACT_RECEIPT_FILE = ".bdih-runtime-artifact.json";
const DXMT_ARTIFACT_RECEIPT_SUFFIX = ".bdih-runtime-artifact.json";

export function runtime_artifact_receipt_path(
  kind: RuntimeArtifactKind,
  targetPath: string,
): string {
  return kind === "wine"
    ? path.join(targetPath, WINE_ARTIFACT_RECEIPT_FILE)
    : `${targetPath}${DXMT_ARTIFACT_RECEIPT_SUFFIX}`;
}

export function read_runtime_artifact_receipt(
  kind: RuntimeArtifactKind,
  targetPath: string,
): RuntimeArtifactReceipt | undefined {
  const receiptPath = runtime_artifact_receipt_path(kind, targetPath);

  if (!existsSync(receiptPath)) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(readFileSync(receiptPath, "utf8")) as Partial<RuntimeArtifactReceipt>;

    if (
      parsed.schemaVersion !== 1
      || parsed.kind !== kind
      || typeof parsed.versionId !== "string"
      || (parsed.algorithm !== "sha256" && parsed.algorithm !== "fingerprint")
      || typeof parsed.digest !== "string"
      || !/^[a-f0-9]{64}$/i.test(parsed.digest)
      || typeof parsed.artifactFileName !== "string"
      || typeof parsed.artifactSize !== "number"
      || typeof parsed.artifactMtimeMs !== "number"
      || typeof parsed.installedAt !== "string"
    ) {
      return undefined;
    }

    return parsed as RuntimeArtifactReceipt;
  } catch {
    return undefined;
  }
}

export async function ensure_runtime_artifact_receipt(options: {
  kind: RuntimeArtifactKind;
  versionId: string;
  artifactPath: string;
  receiptTargetPath: string;
  sourceUrl?: string;
  force?: boolean;
  refreshWhenArtifactChanged?: boolean;
}): Promise<RuntimeArtifactReceipt | undefined> {
  if (!existsSync(options.artifactPath)) {
    return undefined;
  }

  if (!options.force) {
    const existing = read_runtime_artifact_receipt(options.kind, options.receiptTargetPath);

    if (existing?.versionId === options.versionId) {
      if (!options.refreshWhenArtifactChanged) {
        return existing;
      }

      const currentStats = statSync(options.artifactPath);

      if (
        currentStats.isFile()
        && existing.artifactSize === currentStats.size
        && existing.artifactMtimeMs === Math.trunc(currentStats.mtimeMs)
      ) {
        return existing;
      }
    }
  }

  const artifactStats = statSync(options.artifactPath);

  if (!artifactStats.isFile()) {
    return undefined;
  }

  const receipt: RuntimeArtifactReceipt = {
    schemaVersion: 1,
    kind: options.kind,
    versionId: options.versionId,
    algorithm: "sha256",
    digest: await calculate_file_sha256(options.artifactPath),
    artifactFileName: path.basename(options.artifactPath),
    artifactSize: artifactStats.size,
    artifactMtimeMs: Math.trunc(artifactStats.mtimeMs),
    sourceUrl: options.sourceUrl,
    installedAt: new Date().toISOString(),
  };
  const receiptPath = runtime_artifact_receipt_path(options.kind, options.receiptTargetPath);
  const temporaryPath = `${receiptPath}.${process.pid}.${randomUUID()}.tmp`;

  writeFileSync(temporaryPath, JSON.stringify(receipt, null, 2), "utf8");
  renameSync(temporaryPath, receiptPath);
  return receipt;
}

export async function calculate_file_sha256(targetPath: string): Promise<string> {
  const digest = createHash("sha256");

  for await (const chunk of createReadStream(targetPath)) {
    digest.update(chunk);
  }

  return digest.digest("hex");
}

export function create_fingerprint_artifact_identity(
  kind: RuntimeArtifactKind,
  versionId: string,
  fingerprint: string,
): RuntimeArtifactIdentity {
  return {
    kind,
    versionId,
    algorithm: "fingerprint",
    digest: createHash("sha256").update(fingerprint).digest("hex"),
  };
}

export function same_runtime_artifact(
  left: RuntimeArtifactIdentity | undefined,
  right: RuntimeArtifactIdentity | undefined,
): boolean {
  if (!left || !right) {
    return left === right;
  }

  return left.kind === right.kind
    && left.versionId === right.versionId
    && left.algorithm === right.algorithm
    && left.digest === right.digest;
}
