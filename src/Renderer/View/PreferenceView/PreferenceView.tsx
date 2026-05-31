import React, { useMemo, useState } from "react";
import { Code2, ExternalLink, FolderOpen, Globe2, Keyboard, MonitorCog, Radio, RotateCcw, Save, TvMinimalPlay, Wine } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppUpdateStatusPayload } from "../../../Common/Types/IPC";
import { AppUpdatePanel } from "../../Component/AppUpdatePanel";
import { SelectMenu } from "../../Component/SelectMenu";
import { StatusBadge } from "../../Component/StatusBadge";
import { is_supported_locale, SUPPORTED_LOCALES, SupportedLocale } from "../../I18n";
import { ACCENT_COLOR_ITEMS, AccentColor, is_accent_color } from "../../Theme";

type PreferenceCategory = "general" | "wine" | "shortcut";

export interface PreferenceViewProps {
  installPath?: string;
  locale?: SupportedLocale;
  accentColor?: AccentColor;
  autoUpdateEnabled?: boolean;
  appUpdateStatus?: AppUpdateStatusPayload;
  developerSiteUrl?: string;
  developerGitHubUrl?: string;
  developerYouTubeUrl?: string;
  isDeveloperOnAir?: boolean;
  initialCategory?: PreferenceCategory;
  initialHasChanges?: boolean;
  onInstallPathChange?: (installPath: string) => void;
  onLocaleChange?: (locale: SupportedLocale) => void;
  onAccentColorChange?: (accentColor: AccentColor) => void;
  onAutoUpdateEnabledChange?: (enabled: boolean) => void;
  onCheckForUpdates?: () => void;
  onReset?: () => void;
  onSave?: () => void;
}

function SettingField({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-sm font-semibold text-slate-100">{title}</p>
      <p className="mt-1 min-h-10 text-xs leading-5 text-slate-500">{description}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function PreferenceSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
      <div className="mb-5">
        <h3 className="text-base font-semibold text-white">{title}</h3>
        <p className="mt-1 text-sm text-slate-400">{description}</p>
      </div>
      {children}
    </section>
  );
}

export function DeveloperYouTubeLink({ url, isOnAir }: { url: string; isOnAir: boolean }) {
  const { t } = useTranslation();

  function openDeveloperYouTube() {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <button
      type="button"
      className={`relative isolate ml-auto flex max-w-full items-center gap-3 overflow-visible rounded-lg border px-3 py-2 text-left transition ${
        isOnAir
          ? "border-red-300/45 bg-red-500/10 text-red-100 shadow-[0_0_28px_rgba(248,113,113,0.32)] hover:bg-red-500/15"
          : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06] hover:text-white"
      }`}
      onClick={openDeveloperYouTube}
    >
      {isOnAir ? (
        <span className="pointer-events-none absolute -inset-1 -z-10 rounded-xl bg-red-500/25 blur-xl animate-pulse" />
      ) : null}

      <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-md bg-white/5">
        <TvMinimalPlay size={19} className={isOnAir ? "text-red-300" : "text-slate-400"} />
        {isOnAir ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-red-400" />
          </span>
        ) : null}
      </span>

      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase text-slate-500">
          <Radio size={12} />
          {isOnAir ? t("preferences.developerYouTube.onAir") : t("preferences.developerYouTube.offAir")}
        </span>
        <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-sm font-semibold">
          <span className="truncate">{t("preferences.developerYouTube.open")}</span>
          <ExternalLink size={13} className="shrink-0 text-slate-500" />
        </span>
      </span>
    </button>
  );
}

function DeveloperExternalLink({ url, label, icon: Icon }: { url: string; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }) {
  function open_link() {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <button
      type="button"
      className="flex max-w-full items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
      onClick={open_link}
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-white/5">
        <Icon size={18} className="text-slate-400" />
      </span>
      <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
        <span className="truncate">{label}</span>
        <ExternalLink size={13} className="shrink-0 text-slate-500" />
      </span>
    </button>
  );
}

function DeveloperLinkGroup({
  siteUrl,
  githubUrl,
  youtubeUrl,
  isYouTubeOnAir,
}: {
  siteUrl: string;
  githubUrl: string;
  youtubeUrl: string;
  isYouTubeOnAir: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap justify-end gap-2">
      <DeveloperExternalLink url={siteUrl} label={t("preferences.developerLinks.site")} icon={Globe2} />
      <DeveloperExternalLink url={githubUrl} label={t("preferences.developerLinks.github")} icon={Code2} />
      <DeveloperYouTubeLink url={youtubeUrl} isOnAir={isYouTubeOnAir} />
    </div>
  );
}

export function PreferenceView({
  installPath = "~/Library/Application Support/BDIH/Wine",
  locale,
  accentColor = "rose",
  autoUpdateEnabled = true,
  appUpdateStatus,
  developerSiteUrl = "https://molera.dev",
  developerGitHubUrl = "https://github.com/molera1708",
  developerYouTubeUrl = "https://www.youtube.com/@fabyday",
  isDeveloperOnAir = false,
  initialCategory = "general",
  initialHasChanges = false,
  onInstallPathChange,
  onLocaleChange,
  onAccentColorChange,
  onAutoUpdateEnabledChange,
  onCheckForUpdates,
  onReset,
  onSave,
}: PreferenceViewProps) {
  const { t, i18n } = useTranslation();
  const [activeCategory, setActiveCategory] = useState<PreferenceCategory>(initialCategory);
  const [hasChanges, setHasChanges] = useState(initialHasChanges);
  const currentLanguage = i18n.language.split("-")[0];
  const selectedLocale = locale ?? (is_supported_locale(currentLanguage) ? currentLanguage : "ko");
  const localeOptions = SUPPORTED_LOCALES.map((supportedLocale) => ({
    value: supportedLocale,
    label: t(`locale.${supportedLocale}`),
  }));
  const accentColorOptions = ACCENT_COLOR_ITEMS.map((item) => ({
    value: item.id,
    label: t(`theme.accent.${item.id}`),
    swatchColor: item.swatch,
  }));
  const optionItems = [
    ["preferences.options.dxmtTitle", "preferences.options.dxmtDescription"],
    ["preferences.options.keepLogTitle", "preferences.options.keepLogDescription"],
    ["preferences.options.prefixTitle", "preferences.options.prefixDescription"],
    ["preferences.options.catalogTitle", "preferences.options.catalogDescription"],
  ] as const;
  const categories = useMemo(
    () => [
      {
        id: "general" as const,
        label: t("preferences.categories.general"),
        description: t("preferences.categories.generalDescription"),
        icon: MonitorCog,
      },
      {
        id: "wine" as const,
        label: t("preferences.categories.wine"),
        description: t("preferences.categories.wineDescription"),
        icon: Wine,
      },
      {
        id: "shortcut" as const,
        label: t("preferences.categories.shortcut"),
        description: t("preferences.categories.shortcutDescription"),
        icon: Keyboard,
      },
    ],
    [t],
  );
  const shortcutItems = [
    ["preferences.shortcuts.launchTitle", "preferences.shortcuts.launchDescription", "Command + Return"],
    ["preferences.shortcuts.logsTitle", "preferences.shortcuts.logsDescription", "Command + L"],
    ["preferences.shortcuts.preferencesTitle", "preferences.shortcuts.preferencesDescription", "Command + ,"],
  ] as const;

  function markChanged() {
    setHasChanges(true);
  }

  function handleSave() {
    onSave?.();
    setHasChanges(false);
  }

  return (
    <div className="relative min-h-full p-6 pb-24">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex justify-end">
          <DeveloperLinkGroup
            siteUrl={developerSiteUrl}
            githubUrl={developerGitHubUrl}
            youtubeUrl={developerYouTubeUrl}
            isYouTubeOnAir={isDeveloperOnAir}
          />
        </div>

        <div className="overflow-x-auto pb-2 [scrollbar-color:rgba(148,163,184,0.45)_rgba(15,23,42,0.65)] [scrollbar-width:thin]">
          <div className="flex min-w-max gap-2">
            {categories.map((category) => {
              const Icon = category.icon;
              const isActive = activeCategory === category.id;

              return (
                <button
                  key={category.id}
                  type="button"
                  className={`flex w-52 items-start gap-3 rounded-lg border p-3 text-left transition ${
                    isActive
                      ? "accent-border bg-white/[0.08] text-white"
                      : "border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/[0.06] hover:text-slate-100"
                  }`}
                  onClick={() => setActiveCategory(category.id)}
                >
                  <Icon size={18} className={isActive ? "accent-text mt-0.5 shrink-0" : "mt-0.5 shrink-0 text-slate-500"} />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{category.label}</span>
                    <span className="mt-1 block line-clamp-2 text-xs leading-4 text-slate-500">{category.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {activeCategory === "general" ? (
          <PreferenceSection title={t("preferences.generalTitle")} description={t("preferences.generalDescription")}>
            <div className="grid gap-5 md:grid-cols-2">
              <SettingField title={t("preferences.languageTitle")} description={t("preferences.languageDescription")}>
                <SelectMenu
                  value={selectedLocale}
                  label={t("preferences.languageTitle")}
                  options={localeOptions}
                  onChange={(value) => {
                    if (is_supported_locale(value)) {
                      onLocaleChange?.(value);
                      markChanged();
                    }
                  }}
                />
              </SettingField>

              <SettingField title={t("preferences.accentColorTitle")} description={t("preferences.accentColorDescription")}>
                <SelectMenu
                  value={accentColor}
                  label={t("preferences.accentColorTitle")}
                  options={accentColorOptions}
                  onChange={(value) => {
                    if (is_accent_color(value)) {
                      onAccentColorChange?.(value);
                      markChanged();
                    }
                  }}
                />
              </SettingField>
            </div>

            <div className="mt-5">
              <AppUpdatePanel
                autoUpdateEnabled={autoUpdateEnabled}
                status={appUpdateStatus}
                onAutoUpdateChange={(enabled) => {
                  onAutoUpdateEnabledChange?.(enabled);
                  markChanged();
                }}
                onCheckForUpdates={onCheckForUpdates}
              />
            </div>
          </PreferenceSection>
        ) : null}

        {activeCategory === "wine" ? (
          <div className="space-y-6">
            <PreferenceSection title={t("preferences.installPathTitle")} description={t("preferences.installPathDescription")}>
              <div className="mb-4 flex justify-end">
                <StatusBadge label={t("common.local")} tone="neutral" />
              </div>

              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="install-path">
                {t("preferences.installPathLabel")}
              </label>
              <div className="mt-2 flex gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-white/10 bg-[#0b1020] px-3">
                  <FolderOpen size={16} className="shrink-0 text-slate-500" />
                  <input
                    id="install-path"
                    value={installPath}
                    onChange={(event) => {
                      onInstallPathChange?.(event.target.value);
                      markChanged();
                    }}
                    className="h-11 min-w-0 flex-1 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-600"
                  />
                </div>
                <button
                  type="button"
                  className="inline-flex h-11 items-center gap-2 rounded-md border border-white/10 px-4 text-sm font-semibold text-slate-200 transition hover:bg-white/5"
                  onClick={() => {
                    onReset?.();
                    markChanged();
                  }}
                >
                  <RotateCcw size={16} />
                  {t("common.actions.reset")}
                </button>
              </div>
            </PreferenceSection>

            <PreferenceSection title={t("preferences.executionOptionsTitle")} description={t("preferences.executionOptionsDescription")}>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {optionItems.map(([titleKey, descriptionKey], index) => (
                  <label key={titleKey} className="flex gap-3 rounded-lg border border-white/10 bg-[#0b1020] p-4">
                    <input type="checkbox" defaultChecked={index < 2} className="accent-checkbox mt-1 h-4 w-4" onChange={markChanged} />
                    <span>
                      <span className="block text-sm font-semibold text-slate-100">{t(titleKey)}</span>
                      <span className="mt-1 block text-xs leading-5 text-slate-500">{t(descriptionKey)}</span>
                    </span>
                  </label>
                ))}
              </div>
            </PreferenceSection>
          </div>
        ) : null}

        {activeCategory === "shortcut" ? (
          <PreferenceSection title={t("preferences.shortcuts.title")} description={t("preferences.shortcuts.description")}>
            <div className="grid gap-3">
              {shortcutItems.map(([titleKey, descriptionKey, value]) => (
                <div
                  key={titleKey}
                  className="grid gap-3 rounded-lg border border-white/10 bg-[#0b1020] p-4 md:grid-cols-[minmax(0,1fr)_auto]"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-100">{t(titleKey)}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{t(descriptionKey)}</p>
                  </div>
                  <button
                    type="button"
                    className="inline-flex h-10 min-w-36 items-center justify-center rounded-md border border-white/10 bg-white/[0.03] px-3 font-mono text-xs text-slate-200 transition hover:bg-white/[0.07]"
                    onClick={markChanged}
                  >
                    {value}
                  </button>
                </div>
              ))}
            </div>
          </PreferenceSection>
        ) : null}
      </div>

      <div
        className={`fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-[#080d19]/95 px-6 py-4 shadow-2xl shadow-black/30 backdrop-blur transition duration-200 ${
          hasChanges ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-full opacity-0"
        }`}
      >
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-100">{t("preferences.unsavedTitle")}</p>
            <p className="mt-0.5 truncate text-xs text-slate-500">{t("preferences.unsavedDescription")}</p>
          </div>
          <button
            type="button"
            className="accent-primary inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-semibold transition"
            onClick={handleSave}
          >
            <Save size={16} />
            {t("common.actions.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
