import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import {
  ensure_runtime_artifact_receipt,
  read_runtime_artifact_receipt,
  runtime_artifact_receipt_path,
  same_runtime_artifact,
} from "../../../src/Main/Runtime/RuntimeArtifactIdentity";

describe("RuntimeArtifactIdentity", () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "bdih-runtime-artifact-"));
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("records the downloaded Wine archive SHA-256 inside the installed runtime", async () => {
    const archivePath = path.join(tempRoot, "wine-runtime.tar.gz");
    const runtimePath = path.join(tempRoot, "wine-runtime");

    await writeFile(archivePath, "first runtime artifact", "utf8");
    await mkdir(runtimePath, { recursive: true });

    const receipt = await ensure_runtime_artifact_receipt({
      kind: "wine",
      versionId: "bdih-wine-test",
      artifactPath: archivePath,
      receiptTargetPath: runtimePath,
      sourceUrl: "https://example.invalid/wine-runtime.tar.gz",
      force: true,
    });

    expect(receipt).toEqual(expect.objectContaining({
      kind: "wine",
      versionId: "bdih-wine-test",
      algorithm: "sha256",
    }));
    expect(read_runtime_artifact_receipt("wine", runtimePath)).toEqual(receipt);
    expect(JSON.parse(await readFile(runtime_artifact_receipt_path("wine", runtimePath), "utf8")))
      .toEqual(expect.objectContaining({ digest: receipt?.digest }));
  });

  it("updates a DXMT receipt when the package contents change without changing its version", async () => {
    const archivePath = path.join(tempRoot, "dxmt.tar.gz");

    await writeFile(archivePath, "first dxmt artifact", "utf8");
    const first = await ensure_runtime_artifact_receipt({
      kind: "dxmt",
      versionId: "bdih-dxmt-test",
      artifactPath: archivePath,
      receiptTargetPath: archivePath,
      refreshWhenArtifactChanged: true,
    });

    await writeFile(archivePath, "second dxmt artifact with different contents", "utf8");
    const second = await ensure_runtime_artifact_receipt({
      kind: "dxmt",
      versionId: "bdih-dxmt-test",
      artifactPath: archivePath,
      receiptTargetPath: archivePath,
      refreshWhenArtifactChanged: true,
    });

    expect(second?.digest).not.toBe(first?.digest);
    expect(same_runtime_artifact(first, second)).toBe(false);
  });
});
