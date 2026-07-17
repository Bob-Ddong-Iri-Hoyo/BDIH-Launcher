import { mkdtemp, mkdir, readFile, rm, unlink, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import {
  DXMT_PREFIX_REQUIRED_WINDOWS_FILES,
  is_prefix_dxmt_runtime_ready,
  prepare_prefix_dxmt_runtime_files,
} from "../../../src/Main/Execution/DxmtPrefixRuntime";

describe("DXMT prefix runtime preparation", () => {
  let rootPath: string;
  let dxmtRuntimePath: string;
  let prefixPath: string;

  beforeEach(async () => {
    rootPath = await mkdtemp(path.join(os.tmpdir(), "bdih-dxmt-prefix-"));
    dxmtRuntimePath = path.join(rootPath, "dxmt");
    prefixPath = path.join(rootPath, "steam-prefix");

    await Promise.all([
      mkdir(path.join(dxmtRuntimePath, "x86_64-windows"), { recursive: true }),
      mkdir(path.join(dxmtRuntimePath, "i386-windows"), { recursive: true }),
    ]);

    await Promise.all(
      DXMT_PREFIX_REQUIRED_WINDOWS_FILES.flatMap((name) => [
        writeFile(path.join(dxmtRuntimePath, "x86_64-windows", name), `x64:${name}`),
        writeFile(path.join(dxmtRuntimePath, "i386-windows", name), `x86:${name}`),
      ]),
    );
    await writeFile(
      path.join(dxmtRuntimePath, "x86_64-windows", "optional-dxmt.dll"),
      "x64:optional",
    );
  });

  afterEach(async () => {
    await rm(rootPath, { recursive: true, force: true });
  });

  it("copies x64 and x86 DXMT DLLs into the matching Windows system directories", async () => {
    prepare_prefix_dxmt_runtime_files({ dxmtRuntimePath, prefixPath });

    await expect(readFile(
      path.join(prefixPath, "drive_c", "windows", "system32", "d3d11.dll"),
      "utf8",
    )).resolves.toBe("x64:d3d11.dll");
    await expect(readFile(
      path.join(prefixPath, "drive_c", "windows", "syswow64", "d3d11.dll"),
      "utf8",
    )).resolves.toBe("x86:d3d11.dll");
    await expect(readFile(
      path.join(prefixPath, "drive_c", "windows", "system32", "optional-dxmt.dll"),
      "utf8",
    )).resolves.toBe("x64:optional");
    expect(is_prefix_dxmt_runtime_ready(prefixPath, dxmtRuntimePath)).toBe(true);
  });

  it("detects and repairs a missing 32-bit DXMT DLL", async () => {
    prepare_prefix_dxmt_runtime_files({ dxmtRuntimePath, prefixPath });
    const missingPath = path.join(
      prefixPath,
      "drive_c",
      "windows",
      "syswow64",
      "dxgi.dll",
    );

    await unlink(missingPath);
    expect(is_prefix_dxmt_runtime_ready(prefixPath, dxmtRuntimePath)).toBe(false);

    prepare_prefix_dxmt_runtime_files({ dxmtRuntimePath, prefixPath });
    expect(is_prefix_dxmt_runtime_ready(prefixPath, dxmtRuntimePath)).toBe(true);
  });
});
