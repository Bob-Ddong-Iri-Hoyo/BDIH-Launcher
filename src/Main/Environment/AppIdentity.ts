import { app } from "electron";

export const DEFAULT_APP_NAME = "BDIH Launcher";
export const KOREAN_APP_NAME = "밥똥이리호요 런처";

export function localized_app_name(language?: string): string {
  return is_korean_locale(language || app.getLocale())
    ? KOREAN_APP_NAME
    : DEFAULT_APP_NAME;
}

export function apply_localized_app_name(language?: string): void {
  app.setName(localized_app_name(language));
}

function is_korean_locale(language?: string): boolean {
  const normalized = language?.trim().toLowerCase().replace("_", "-") ?? "";

  return normalized === "ko" || normalized.startsWith("ko-");
}
