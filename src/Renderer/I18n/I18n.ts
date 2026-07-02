import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { IPC_CHANNELS, LocaleResourcesPayload } from "../../Common/Types/IPC";
import { FALLBACK_LOCALE, is_supported_locale, LOCALE_OPTIONS, LOCALE_STORAGE_KEY, normalize_locale, SUPPORTED_LOCALES } from "./Locale";
import type { SupportedLocale } from "./Locale";
import { I18N_RESOURCES } from "./Resources";

export { FALLBACK_LOCALE, is_supported_locale, LOCALE_OPTIONS, LOCALE_STORAGE_KEY, normalize_locale, SUPPORTED_LOCALES };
export type { SupportedLocale } from "./Locale";

export function resolve_initial_locale(): SupportedLocale {
  if (typeof window !== "undefined") {
    const savedLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY);

    if (savedLocale && is_supported_locale(savedLocale)) {
      return savedLocale;
    }

    return normalize_locale(window.navigator.language);
  }

  return FALLBACK_LOCALE;
}

export async function change_renderer_locale(locale: SupportedLocale): Promise<void> {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  }

  await i18n.changeLanguage(locale);
}

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources: I18N_RESOURCES,
    lng: resolve_initial_locale(),
    fallbackLng: FALLBACK_LOCALE,
    interpolation: {
      escapeValue: false,
    },
    returnNull: false,
  }).then(load_packaged_locale_resources);
}

async function load_packaged_locale_resources(): Promise<void> {
  if (typeof window === "undefined" || !window.BTIH_API) {
    return;
  }

  try {
    const resources = await window.BTIH_API.invoke(
      IPC_CHANNELS.APP.GET_LOCALE_RESOURCES.channelName,
      undefined as never,
    ) as LocaleResourcesPayload | undefined;

    for (const [locale, resource] of Object.entries(resources ?? {})) {
      if (!resource.translation || typeof resource.translation !== "object") {
        continue;
      }

      i18n.addResourceBundle(locale, "translation", resource.translation, true, true);
    }

    await i18n.changeLanguage(i18n.language);
  } catch {
    // Bundled JSON imports remain the fallback when packaged locale files are
    // unavailable or malformed.
  }
}

export default i18n;
