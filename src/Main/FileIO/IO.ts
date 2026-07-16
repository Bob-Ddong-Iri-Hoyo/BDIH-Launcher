import { randomUUID } from "crypto";
import { mkdir, readFile, rename, rm, writeFile } from "fs/promises";
import path from "path";
import { get_settings_path } from "../Environment/AppPaths";

async function ensure_parent_directory(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
}

export async function readConfigFile(filePath: string): Promise<string> {
  return readFile(filePath, "utf-8");
}

export async function writeConfigFile(filePath: string, data: string): Promise<void> {
  await ensure_parent_directory(filePath);
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;

  try {
    await writeFile(temporaryPath, data, "utf-8");
    await rename(temporaryPath, filePath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

export async function readUserSettings(): Promise<string> {
  return readConfigFile(get_settings_path());
}

export async function writeUserSettings(data: string): Promise<void> {
  await writeConfigFile(get_settings_path(), data);
}

export async function backupInvalidUserSettings(): Promise<string | undefined> {
  const settingsPath = get_settings_path();
  const backupPath = `${settingsPath}.invalid-${Date.now()}-${randomUUID()}`;

  try {
    await rename(settingsPath, backupPath);
    return backupPath;
  } catch (error) {
    if (
      typeof error === "object"
      && error !== null
      && "code" in error
      && (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return undefined;
    }

    throw error;
  }
}
