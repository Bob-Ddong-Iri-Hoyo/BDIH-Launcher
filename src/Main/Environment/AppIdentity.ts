import { app } from "electron";

export const DEFAULT_APP_NAME = "BDIH Launcher";
export const KOREAN_APP_NAME = "밥똥이리호요 런처";

export function localized_app_name(language?: string, nightly = false, staging = false): string {
  const baseName = is_korean_locale(language || app.getLocale())
    ? KOREAN_APP_NAME
    : DEFAULT_APP_NAME;

  if (nightly) {
    return `${baseName} Nightly`;
  }

  return staging ? `${baseName} Staging` : baseName;
}

export function apply_localized_app_name(language?: string, nightly = false, staging = false): void {
  app.setName(localized_app_name(language, nightly, staging));
}

function is_korean_locale(language?: string): boolean {
  const normalized = language?.trim().toLowerCase().replace("_", "-") ?? "";

  return normalized === "ko" || normalized.startsWith("ko-");
}
