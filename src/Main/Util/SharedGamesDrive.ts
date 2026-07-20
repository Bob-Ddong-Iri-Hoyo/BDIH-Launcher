import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import path from "path";

export interface SharedGamesDrivePreference {
  gameInstallPath: string;
}

export interface SharedGamesDriveLogger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
}

export interface SymlinkInspection {
  exists: boolean;
  isSymbolicLink: boolean;
  target?: string;
}

export function ensure_shared_games_drive(
  prefixPath: string,
  preference: SharedGamesDrivePreference,
  logger: SharedGamesDriveLogger,
): void {
  const dosDevicesPath = path.join(prefixPath, "dosdevices");
  const driveLinkPath = path.join(dosDevicesPath, "g:");
  const markerPath = path.join(prefixPath, ".bdih-shared-games-drive.json");
  const managedTarget = read_shared_games_drive_marker(markerPath);
  const currentLink = inspect_symlink(driveLinkPath);
  const configuredPath = preference.gameInstallPath.trim();

  if (!configuredPath) {
    if (managedTarget && currentLink.target === managedTarget) {
      rmSync(driveLinkPath, { force: true });
    }
    rmSync(markerPath, { force: true });
    return;
  }

  const targetPath = path.resolve(expand_user_home_path(configuredPath));
  mkdirSync(targetPath, { recursive: true });
  mkdirSync(dosDevicesPath, { recursive: true });

  if (currentLink.exists && currentLink.target !== targetPath) {
    if (!currentLink.isSymbolicLink || !managedTarget || currentLink.target !== managedTarget) {
      logger.warn("shared games G: drive was not changed because an unmanaged mapping already exists", {
        prefixPath,
        currentTarget: currentLink.target,
        requestedTarget: targetPath,
      });
      return;
    }

    rmSync(driveLinkPath, { force: true });
  }

  if (!currentLink.exists || currentLink.target !== targetPath) {
    symlinkSync(targetPath, driveLinkPath);
  }

  writeFileSync(markerPath, JSON.stringify({ schemaVersion: 1, targetPath }, null, 2));
  logger.info("shared games G: drive configured", { prefixPath, targetPath });
}

export function inspect_symlink(targetPath: string): SymlinkInspection {
  try {
    const stat = lstatSync(targetPath);

    if (!stat.isSymbolicLink()) {
      return { exists: true, isSymbolicLink: false };
    }

    return {
      exists: true,
      isSymbolicLink: true,
      target: path.resolve(path.dirname(targetPath), readlinkSync(targetPath)),
    };
  } catch {
    return { exists: false, isSymbolicLink: false };
  }
}

function read_shared_games_drive_marker(markerPath: string): string | undefined {
  if (!existsSync(markerPath)) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(readFileSync(markerPath, "utf8"));
    return typeof parsed?.targetPath === "string"
      ? path.resolve(expand_user_home_path(parsed.targetPath))
      : undefined;
  } catch {
    return undefined;
  }
}

function expand_user_home_path(targetPath: string): string {
  if (targetPath === "~") {
    return process.env.HOME ?? targetPath;
  }

  if (targetPath.startsWith("~/")) {
    return path.join(process.env.HOME ?? "", targetPath.slice(2));
  }

  return targetPath;
}
