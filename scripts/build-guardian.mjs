import { chmod, mkdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const sourcePath = path.join(root, "native", "BDIHGuardian", "guardian.c");
const outputDir = path.join(root, "build", "native");
const outputPath = path.join(outputDir, "bdih-guardian");
const targetArch = process.env.BDIH_GUARDIAN_ARCH || "arm64";

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code ?? -1}.`));
      }
    });
  });
}

if (process.platform !== "darwin") {
  process.stdout.write("Skipping BDIH Guardian build outside macOS.\n");
  process.exit(0);
}

await mkdir(outputDir, { recursive: true });
await run("xcrun", [
  "--sdk",
  "macosx",
  "clang",
  "-std=c11",
  "-O2",
  "-Wall",
  "-Wextra",
  "-Werror",
  "-mmacosx-version-min=11.0",
  "-arch",
  targetArch,
  sourcePath,
  "-o",
  outputPath,
]);
await chmod(outputPath, 0o755);
await run("codesign", ["--force", "--sign", "-", outputPath]);
process.stdout.write(`${outputPath}\n`);
