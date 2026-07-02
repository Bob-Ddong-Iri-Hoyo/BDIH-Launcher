import { spawn } from "child_process";
import { existsSync } from "fs";

export async function remove_quarantine_xattr(targetPath: string): Promise<{
  ok: boolean;
  skipped: boolean;
  error?: string;
}> {
  if (process.platform !== "darwin") {
    return { ok: true, skipped: true };
  }

  if (!targetPath || !existsSync(targetPath)) {
    return { ok: true, skipped: true };
  }

  return new Promise((resolve) => {
    const child = spawn("xattr", ["-dr", "com.apple.quarantine", targetPath], {
      shell: false,
      windowsHide: true,
      stdio: "ignore",
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ ok: true, skipped: false });
        return;
      }

      resolve({
        ok: false,
        skipped: false,
        error: `xattr exited with code ${code ?? -1}`,
      });
    });
    child.on("error", (error) => {
      resolve({
        ok: false,
        skipped: false,
        error: error.message,
      });
    });
  });
}
