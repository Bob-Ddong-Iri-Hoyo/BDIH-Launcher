export const FALLBACK_LOCALE = "en";

export const SUPPORTED_LOCALES = ["ko", "en", "ja", "zh"] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export function is_supported_locale(locale: string): locale is SupportedLocale {
  return SUPPORTED_LOCALES.includes(locale as SupportedLocale);
}

export function normalize_locale(locale?: string): SupportedLocale {
  const language = locale
    ?.trim()
    .toLowerCase()
    .replace("_", "-")
    .split("-")[0];

  return language && is_supported_locale(language)
    ? language
    : FALLBACK_LOCALE;
}
