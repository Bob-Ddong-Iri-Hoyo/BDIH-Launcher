export const LOCALE_STORAGE_KEY = "bdih.locale";
export const FALLBACK_LOCALE = "ko";

export const LOCALE_OPTIONS = [
  {
    value: "ko",
    fallbackNativeName: "한국어",
  },
  {
    value: "en",
    fallbackNativeName: "English",
  },
  {
    value: "ja",
    fallbackNativeName: "日本語",
  },
  {
    value: "zh",
    fallbackNativeName: "简体中文",
  },
] as const;

export type SupportedLocale = (typeof LOCALE_OPTIONS)[number]["value"];

export const SUPPORTED_LOCALES = LOCALE_OPTIONS.map((locale) => locale.value) as SupportedLocale[];

export function is_supported_locale(locale: string): locale is SupportedLocale {
  return SUPPORTED_LOCALES.includes(locale as SupportedLocale);
}

export function normalize_locale(locale?: string): SupportedLocale {
  const language = locale?.split("-")[0]?.toLowerCase();

  if (language && is_supported_locale(language)) {
    return language;
  }

  return FALLBACK_LOCALE;
}
