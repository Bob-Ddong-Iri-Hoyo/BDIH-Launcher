import {
  FALLBACK_LOCALE,
  is_supported_locale,
  normalize_locale,
  SUPPORTED_LOCALES,
} from "../../Common/Util/Locale";
import type { SupportedLocale } from "../../Common/Util/Locale";

export const LOCALE_STORAGE_KEY = "bdih.locale";

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

export {
  FALLBACK_LOCALE,
  is_supported_locale,
  normalize_locale,
  SUPPORTED_LOCALES,
};
export type { SupportedLocale };
