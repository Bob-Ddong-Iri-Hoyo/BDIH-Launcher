import { execFile } from "child_process";
import os from "os";
import { ROSETTA_INSTALL_COMMAND } from "../../Common/Constant/Rosetta";
import type { RosettaStatusPayload } from "../../Common/Types/IPC";

const ROSETTA_PACKAGE_ID = "com.apple.pkg.RosettaUpdateAuto";

export class RosettaManager {
  async getStatus(): Promise<RosettaStatusPayload> {
    const isAppleSilicon = process.platform === "darwin" && os.arch() === "arm64";

    if (!isAppleSilicon) {
      return {
        status: "not-required",
        isAppleSilicon: false,
        installCommand: ROSETTA_INSTALL_COMMAND,
      };
    }

    try {
      const [hasReceipt, canRunX64] = await Promise.all([
        command_exits_successfully("/usr/sbin/pkgutil", ["--pkg-info", ROSETTA_PACKAGE_ID]),
        command_exits_successfully("/usr/bin/arch", ["-x86_64", "/usr/bin/true"]),
      ]);

      return {
        status: hasReceipt || canRunX64 ? "installed" : "missing",
        isAppleSilicon: true,
        installCommand: ROSETTA_INSTALL_COMMAND,
      };
    } catch (error) {
      return {
        status: "error",
        isAppleSilicon: true,
        installCommand: ROSETTA_INSTALL_COMMAND,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

function command_exits_successfully(command: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const child = execFile(command, args, { timeout: 5000 }, (error) => {
      resolve(!error);
    });

    child.once("error", () => resolve(false));
  });
}

export const rosettaManager = new RosettaManager();
