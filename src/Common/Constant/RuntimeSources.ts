export const BDIH_SITE_URL = "https://bdih.faby.day/";
export const BDIH_SITE_FAVICON_URL = "https://bdih.faby.day/favicon.ico";
export const BDIH_DISCORD_URL = "https://discord.faby.day/";
export const BDIH_YOUTUBE_HANDLE = "@molera1708";
export const BDIH_YOUTUBE_URL = "https://www.youtube.com/@molera1708/live";
export const BDIH_GITHUB_URL = "https://github.com/Bob-Ddong-Iri-Hoyo/BDIH-Launcher";
export const STEAM_WINDOWS_INSTALLER_URL = "https://cdn.cloudflare.steamstatic.com/client/installer/SteamSetup.exe";
export const STEAM_ICON_URL = "https://store.steampowered.com/favicon.ico";
export const STEAM_GAME_LAUNCH_ARGUMENT = "-applaunch";
export const STEAM_WEBHELPER_ARGUMENTS = ` ${[
  "--no-sandbox",
  "--in-process-gpu",
  "--disable-gpu",
].join(" ")}`;
export const HOYOPLAY_WINDOWS_INSTALLER_URL =
  "https://sg-public-api.hoyoverse.com/event/download_porter/trace/hyp_global/hyphoyoverse/default?url=https%3A%2F%2Fhoyoplay.hoyoverse.com%2F";
export const HOYOPLAY_ICON_URL = "https://hoyoplay.hoyoverse.com/favicon.ico";

export const JADEITE_DEFAULT_VERSION = "v5.0.1";
export const JADEITE_DOWNLOAD_URL =
  "https://codeberg.org/mkrsym1/jadeite/releases/download/v5.0.1/v5.0.1.zip";

export const BDIH_WINE_REPOSITORY = {
  owner: "Bob-Ddong-Iri-Hoyo",
  repo: "fullbodied-anca-wine-house",
  url: "https://github.com/Bob-Ddong-Iri-Hoyo/fullbodied-anca-wine-house",
  releasesApiUrl: "https://api.github.com/repos/Bob-Ddong-Iri-Hoyo/fullbodied-anca-wine-house/releases",
} as const;

export const BDIH_DXMT_REPOSITORY = {
  owner: "Bob-Ddong-Iri-Hoyo",
  repo: "anka-snack-house",
  url: "https://github.com/Bob-Ddong-Iri-Hoyo/anka-snack-house",
  releasesApiUrl: "https://api.github.com/repos/Bob-Ddong-Iri-Hoyo/anka-snack-house/releases",
} as const;
