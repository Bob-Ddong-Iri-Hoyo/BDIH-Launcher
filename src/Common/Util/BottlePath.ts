import type { BottleLauncherKind, InstalledBottleAppPayload } from "../Types/IPC";

type BottleAppPrefixInput = Pick<InstalledBottleAppPayload, "id" | "source" | "executablePath" | "name"> & {
  prefixPath?: string;
};

const DEFAULT_BOTTLE_PREFIX_ROOT = "~/Library/Application Support/BDIH Launcher/Bottles";
const DEFAULT_WINE_PREFIX_DIR_NAME = "wine-prefix";
const LAUNCHER_PREFIX_DIR_NAMES: Record<BottleLauncherKind, string> = {
  steam: "steam-prefix",
  hoyoplay: "hoyo-prefix",
};
const HOYO_GAME_PREFIX_DIR_NAMES = {
  zzz: "zzz-prefix",
  hsr: "hsr-prefix",
  genshin: "genshin-prefix",
} as const;
const INTERNAL_PREFIX_DIR_NAMES = [
  DEFAULT_WINE_PREFIX_DIR_NAME,
  ...Object.values(LAUNCHER_PREFIX_DIR_NAMES),
  ...Object.values(HOYO_GAME_PREFIX_DIR_NAMES),
  "manual-prefix",
];

export type HoyoGameKind = keyof typeof HOYO_GAME_PREFIX_DIR_NAMES;

export function bottle_name_to_slug(name: string): string {
  return name
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/(^-|-$)/g, "") || "bottle";
}

export function create_bottle_path_from_name(rootPath: string, name: string): string {
  const slug = bottle_name_to_slug(name);
  const trimmedRoot = rootPath.trim().replace(/\/+$/, "") || DEFAULT_BOTTLE_PREFIX_ROOT;
  const root = trimmedRoot.split("/").pop()?.toLowerCase() === slug
    ? trimmedRoot.split("/").slice(0, -1).join("/") || trimmedRoot
    : trimmedRoot;

  return `${root}/${slug}`;
}

export function normalize_bottle_prefix_root(rootPath: string, name: string): string {
  const slug = bottle_name_to_slug(name);
  const trimmedRoot = rootPath.trim().replace(/\/+$/, "") || DEFAULT_BOTTLE_PREFIX_ROOT;

  if (trimmedRoot.split("/").pop()?.toLowerCase() === slug) {
    return trimmedRoot.split("/").slice(0, -1).join("/") || trimmedRoot;
  }

  return trimmedRoot;
}

export function create_launcher_prefix_path(bottlePath: string, launcher: BottleLauncherKind): string {
  return `${bottlePath.trim().replace(/\/+$/, "")}/${LAUNCHER_PREFIX_DIR_NAMES[launcher]}`;
}

export function create_default_wine_prefix_path(bottlePath: string): string {
  return `${bottlePath.trim().replace(/\/+$/, "")}/${DEFAULT_WINE_PREFIX_DIR_NAME}`;
}

export function create_hoyo_game_prefix_path(bottlePath: string, game: HoyoGameKind): string {
  return `${bottlePath.trim().replace(/\/+$/, "")}/${HOYO_GAME_PREFIX_DIR_NAMES[game]}`;
}

export function host_path_from_possible_z_path(targetPath: string): string {
  const normalizedPath = targetPath.trim().replace(/\\/g, "/");
  if (/^[Zz]:\//.test(normalizedPath)) {
    return `/${normalizedPath.replace(/^[Zz]:\/?/, "")}`;
  }
  return targetPath.trim();
}

export function infer_wine_prefix_from_executable_path(executablePath: string): string | undefined {
  const hostPath = host_path_from_possible_z_path(executablePath).replace(/\\/g, "/");
  const marker = "/drive_c/";
  const markerIndex = hostPath.toLowerCase().lastIndexOf(marker);

  if (markerIndex <= 0) {
    return undefined;
  }

  return hostPath.slice(0, markerIndex).replace(/\/+$/, "");
}

export function executable_path_for_wine_prefix(executablePath: string, prefixPath?: string): string {
  if (!prefixPath?.trim()) {
    return executablePath.trim();
  }

  const hostPath = host_path_from_possible_z_path(executablePath).replace(/\\/g, "/");
  const normalizedPrefixPath = prefixPath.replace(/\\/g, "/").replace(/\/+$/, "");
  const driveCPath = `${normalizedPrefixPath}/drive_c/`;

  if (!hostPath.toLowerCase().startsWith(driveCPath.toLowerCase())) {
    return executablePath.trim();
  }

  return `C:\\${hostPath.slice(driveCPath.length).replace(/\//g, "\\")}`;
}

export function is_internal_bottle_prefix_dir_name(name: string): boolean {
  const normalizedName = name.toLowerCase();

  return INTERNAL_PREFIX_DIR_NAMES.includes(normalizedName);
}

export function hoyo_game_from_bottle_app(
  app: Pick<InstalledBottleAppPayload, "id" | "source" | "executablePath" | "name">,
): HoyoGameKind | undefined {
  const searchable = [
    app.id,
    app.name,
    app.source,
    app.executablePath,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase()
    .replace(/\\/g, "/");

  if (searchable.includes("zenless") || searchable.includes("zzz")) {
    return "zzz";
  }

  if (searchable.includes("starrail") || searchable.includes("star rail") || searchable.includes("hsr")) {
    return "hsr";
  }

  if (searchable.includes("genshin") || searchable.includes("yuanshen")) {
    return "genshin";
  }

  return undefined;
}

export function launcher_from_bottle_app(app: Pick<InstalledBottleAppPayload, "id" | "source" | "executablePath">): BottleLauncherKind | undefined {
  if (app.id === "steam" || app.source === "steam") {
    return "steam";
  }

  if (app.id === "hoyoplay" || app.id.startsWith("hoyo:") || app.source === "game") {
    return "hoyoplay";
  }

  const executablePath = app.executablePath?.toLowerCase().replace(/\\/g, "/") ?? "";

  if (executablePath.includes("/steam/") || executablePath.includes("steam.exe")) {
    return "steam";
  }

  if (executablePath.includes("/hoyoplay/") || executablePath.includes("hoyoplay.exe")) {
    return "hoyoplay";
  }

  return undefined;
}

export function create_bottle_app_prefix_path(
  bottlePath: string,
  app: BottleAppPrefixInput,
): string {
  if (app.prefixPath?.trim()) {
    return app.prefixPath.trim().replace(/\/+$/, "");
  }

  const hoyoGame = hoyo_game_from_bottle_app(app);

  if (hoyoGame) {
    return create_hoyo_game_prefix_path(bottlePath, hoyoGame);
  }

  const launcher = launcher_from_bottle_app(app);

  return launcher ? create_launcher_prefix_path(bottlePath, launcher) : create_default_wine_prefix_path(bottlePath);
}
