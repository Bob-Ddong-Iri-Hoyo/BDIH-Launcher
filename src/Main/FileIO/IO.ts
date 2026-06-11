import { mkdir, readFile, writeFile } from "fs/promises";
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
  await writeFile(filePath, data, "utf-8");
}

export async function readUserSettings(): Promise<string> {
  return readConfigFile(get_settings_path());
}

export async function writeUserSettings(data: string): Promise<void> {
  await writeConfigFile(get_settings_path(), data);
}
