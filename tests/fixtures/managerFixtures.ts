import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";

export interface ManagerFixtureEnvironment {
  root: string;
  homeRoot: string;
  devResourceRoot: string;
  devSettingsPath: string;
  devBottleRegistryPath: string;
  devLogRoot: string;
  legacySettingsDir: string;
  legacySettingsPath: string;
  legacyAppDataRoot: string;
  legacyBottlePrefixRoot: string;
  legacyWineRoot: string;
  legacyDxmtRoot: string;
}

type EnvironmentSnapshot = Record<string, string | undefined>;

const MANAGER_ENV_KEYS = [
  "BDIH_IS_PACKAGED",
  "BDIH_DEV_RESOURCE_ROOT",
  "BDIH_SETTINGS_DIR",
  "BDIH_APP_DATA_ROOT",
  "BDIH_LEGACY_APP_DATA_ROOT",
  "HOME",
] as const;

export function capture_manager_environment(): EnvironmentSnapshot {
  return MANAGER_ENV_KEYS.reduce<EnvironmentSnapshot>((snapshot, key) => {
    snapshot[key] = process.env[key];
    return snapshot;
  }, {});
}

export function restore_manager_environment(snapshot: EnvironmentSnapshot): void {
  for (const key of MANAGER_ENV_KEYS) {
    const value = snapshot[key];

    if (value === undefined) {
      delete process.env[key];
      continue;
    }

    process.env[key] = value;
  }
}

export async function create_manager_fixture_environment(): Promise<ManagerFixtureEnvironment> {
  const root = await mkdtemp(path.join(os.tmpdir(), "bdih-manager-"));
  const homeRoot = path.join(root, "home");
  const devResourceRoot = path.join(root, "dev-resource");
  const legacySettingsDir = path.join(root, "legacy-settings");
  const legacyAppDataRoot = path.join(root, "legacy-app-data");
  const environment: ManagerFixtureEnvironment = {
    root,
    homeRoot,
    devResourceRoot,
    devSettingsPath: path.join(devResourceRoot, "settings.json"),
    devBottleRegistryPath: path.join(devResourceRoot, "bottles.json"),
    devLogRoot: path.join(devResourceRoot, "logs"),
    legacySettingsDir,
    legacySettingsPath: path.join(legacySettingsDir, "settings.json"),
    legacyAppDataRoot,
    legacyBottlePrefixRoot: path.join(legacyAppDataRoot, "Bottles"),
    legacyWineRoot: path.join(legacyAppDataRoot, "Wine"),
    legacyDxmtRoot: path.join(legacyAppDataRoot, "DXMT"),
  };

  await mkdir(environment.homeRoot, { recursive: true });
  await mkdir(environment.devResourceRoot, { recursive: true });
  await mkdir(environment.legacyBottlePrefixRoot, { recursive: true });
  await mkdir(environment.legacyWineRoot, { recursive: true });
  await mkdir(environment.legacyDxmtRoot, { recursive: true });

  process.env.BDIH_IS_PACKAGED = "false";
  process.env.BDIH_DEV_RESOURCE_ROOT = environment.devResourceRoot;
  process.env.BDIH_SETTINGS_DIR = environment.legacySettingsDir;
  process.env.BDIH_APP_DATA_ROOT = environment.legacyAppDataRoot;
  process.env.BDIH_LEGACY_APP_DATA_ROOT = environment.legacyAppDataRoot;
  process.env.HOME = environment.homeRoot;

  return environment;
}

export async function remove_manager_fixture_environment(environment: ManagerFixtureEnvironment): Promise<void> {
  await rm(environment.root, { recursive: true, force: true });
}

export async function write_legacy_preference(
  environment: ManagerFixtureEnvironment,
  patch: Record<string, unknown> = {},
): Promise<void> {
  await write_json(environment.legacySettingsPath, {
    language: "ko",
    wineInstallPath: environment.legacyWineRoot,
    bottlePrefixPath: environment.legacyBottlePrefixRoot,
    dxmtCachePath: environment.legacyDxmtRoot,
    gameInstallPath: "",
    autoCheckUpdates: true,
    closeToTray: false,
    themeMode: "system",
    appLoggingLevel: "off",
    debugFlagMode: "preset",
    loggingLevel: "off",
    wineDebugArgs: "",
    shortcuts: {
      launch: "Command + Return",
      logs: "Command + L",
      preferences: "Command + ,",
    },
    ...patch,
  });
}

export async function write_json(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

export async function read_json<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

export async function create_bottle_fixture(
  prefixRoot: string,
  name: string,
  patch: Record<string, unknown> = {},
): Promise<string> {
  const bottlePath = path.join(prefixRoot, name);
  const createdAt = "2026-06-17T00:00:00.000Z";

  await mkdir(path.join(bottlePath, "drive_c"), { recursive: true });
  await write_json(path.join(bottlePath, "bdih-bottle.json"), {
    schemaVersion: 1,
    id: `fixture:${name}`,
    bottleId: `fixture:${name}`,
    name,
    bottleName: name,
    description: `${name} fixture`,
    path: bottlePath,
    prefixPath: prefixRoot,
    wineVersionId: "wine-fixture",
    status: "ready",
    apps: [],
    createdAt,
    updatedAt: createdAt,
    ...patch,
  });

  return bottlePath;
}

export async function create_steam_fixture(
  bottlePath: string,
  appId = "123456",
  appName = "Fixture Steam Game",
): Promise<void> {
  const steamRoot = path.join(bottlePath, "drive_c", "Program Files (x86)", "Steam");
  const steamAppsRoot = path.join(steamRoot, "steamapps");

  await mkdir(steamAppsRoot, { recursive: true });
  await writeFile(path.join(steamRoot, "steam.exe"), "", "utf8");
  await writeFile(
    path.join(steamAppsRoot, `appmanifest_${appId}.acf`),
    `"AppState"\n{\n  "appid" "${appId}"\n  "name" "${appName}"\n}\n`,
    "utf8",
  );
}
