import React, { useMemo, useState } from "react";
import { ExternalLink, FolderOpen, Globe2, Keyboard, MonitorCog, Radio, RotateCcw, Save, Trash2, Wine } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BDIH_GITHUB_URL, BDIH_SITE_URL, BDIH_YOUTUBE_URL } from "../../../Common/Constant/RuntimeSources";
import { AppUpdateStatusPayload, DebugFlagMode, IPC_CHANNELS, LAUNCHER_LOG_LEVELS, LauncherDataDeleteTarget, LauncherLogLevel, LauncherShortcutAction, LauncherShortcutMap, RENDERER_THEME_MODES, RendererThemeMode } from "../../../Common/Types/IPC";
import { AppUpdatePanel } from "../../Component/AppUpdatePanel";
import { Dialog } from "../../Component/Dialog";
import { SelectMenu } from "../../Component/SelectMenu";
import { StatusBadge } from "../../Component/StatusBadge";
import { is_supported_locale, LOCALE_OPTIONS, SupportedLocale } from "../../I18n";
import { AccentColor } from "../../Theme";

type PreferenceCategory = "general" | "wine" | "shortcut";
export type PreferencePathKey = "wineInstallPath" | "bottlePrefixPath" | "dxmtCachePath";

const DEFAULT_SHORTCUTS: LauncherShortcutMap = {
  launch: "Command + Return",
  logs: "Command + L",
  preferences: "Command + ,",
};

export interface PreferenceViewProps {
  installPath?: string;
  bottlePrefixPath?: string;
  dxmtCachePath?: string;
  locale?: SupportedLocale;
  accentColor?: AccentColor;
  themeMode?: RendererThemeMode;
  appLoggingLevel?: LauncherLogLevel;
  debugFlagMode?: DebugFlagMode;
  loggingLevel?: LauncherLogLevel;
  wineDebugArgs?: string;
  shortcuts?: LauncherShortcutMap;
  autoUpdateEnabled?: boolean;
  appUpdateStatus?: AppUpdateStatusPayload;
  developerSiteUrl?: string;
  developerGitHubUrl?: string;
  developerYouTubeUrl?: string;
  isDeveloperOnAir?: boolean;
  initialCategory?: PreferenceCategory;
  initialHasChanges?: boolean;
  onInstallPathChange?: (installPath: string) => void;
  onBottlePrefixPathChange?: (bottlePrefixPath: string) => void;
  onDxmtCachePathChange?: (dxmtCachePath: string) => void;
  onLocaleChange?: (locale: SupportedLocale) => void;
  onAccentColorChange?: (accentColor: AccentColor) => void;
  onThemeModeChange?: (themeMode: RendererThemeMode) => void;
  onAppLoggingLevelChange?: (appLoggingLevel: LauncherLogLevel) => void;
  onDebugFlagModeChange?: (debugFlagMode: DebugFlagMode) => void;
  onLoggingLevelChange?: (loggingLevel: LauncherLogLevel) => void;
  onWineDebugArgsChange?: (wineDebugArgs: string) => void;
  onShortcutChange?: (action: LauncherShortcutAction, shortcut: string) => void;
  onAutoUpdateEnabledChange?: (enabled: boolean) => void;
  onCheckForUpdates?: () => void;
  onBrowsePath?: (pathKey: PreferencePathKey) => void;
  onResetPath?: (pathKey: PreferencePathKey) => void;
  onDeleteLauncherData?: (targets: LauncherDataDeleteTarget[]) => void;
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

function PathSettingRow({
  id,
  title,
  description,
  value,
  onChange,
  onBrowse,
  onReset,
}: {
  id: string;
  title: string;
  description: string;
  value: string;
  onChange?: (value: string) => void;
  onBrowse?: () => void;
  onReset?: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div>
      <label className="block text-sm font-semibold text-slate-100" htmlFor={id}>
        {title}
      </label>
      <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
      <div className="mt-3 flex gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-white/10 bg-[#0b1020] px-3">
          <FolderOpen size={16} className="shrink-0 text-slate-500" />
          <input
            id={id}
            value={value}
            onChange={(event) => onChange?.(event.target.value)}
            className="h-11 min-w-0 flex-1 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-600"
          />
        </div>
        <button
          type="button"
          className="inline-flex h-11 shrink-0 items-center gap-2 rounded-md border border-white/10 px-4 text-sm font-semibold text-slate-200 transition hover:bg-white/5"
          onClick={onBrowse}
        >
          <FolderOpen size={16} />
          {t("common.actions.browse")}
        </button>
        <button
          type="button"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-white/10 text-slate-300 transition hover:bg-white/5 hover:text-white"
          aria-label={t("common.actions.reset")}
          title={t("common.actions.reset")}
          onClick={onReset}
        >
          <RotateCcw size={16} />
        </button>
      </div>
    </div>
  );
}

function GitHubMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.09 3.29 9.4 7.86 10.93.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.23-1.28-5.23-5.68 0-1.25.45-2.28 1.18-3.08-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.16 1.18.92-.26 1.9-.38 2.88-.39.98.01 1.96.13 2.88.39 2.19-1.49 3.15-1.18 3.15-1.18.63 1.58.24 2.75.12 3.04.74.8 1.18 1.83 1.18 3.08 0 4.42-2.69 5.38-5.25 5.67.41.36.78 1.06.78 2.13 0 1.54-.01 2.78-.01 3.16 0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

function YouTubeMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <rect x="2" y="5" width="20" height="14" rx="4" fill="currentColor" />
      <path d="M10 9.1v5.8l5.2-2.9L10 9.1Z" fill="#fff" />
    </svg>
  );
}

export function DeveloperYouTubeLink({ url, isOnAir }: { url: string; isOnAir: boolean }) {
  const { t } = useTranslation();

  function openDeveloperYouTube() {
    open_external_url(url);
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
        <YouTubeMark className={isOnAir ? "h-6 w-6 text-red-400" : "h-6 w-6 text-red-500"} />
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

function DeveloperExternalLink({ url, label, icon }: { url: string; label: string; icon: React.ReactNode }) {
  function open_link() {
    open_external_url(url);
  }

  return (
    <button
      type="button"
      className="flex max-w-full items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
      onClick={open_link}
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-white/5">
        {icon}
      </span>
      <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
        <span className="truncate">{label}</span>
        <ExternalLink size={13} className="shrink-0 text-slate-500" />
      </span>
    </button>
  );
}

function open_external_url(url: string) {
  if (!window.BTIH_API) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }

  void window.BTIH_API?.invoke(IPC_CHANNELS.APP.OPEN_EXTERNAL_URL.channelName, { url });
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
      <DeveloperExternalLink url={siteUrl} label={t("preferences.developerLinks.site")} icon={<Globe2 className="h-5 w-5 text-sky-200" />} />
      <DeveloperExternalLink url={githubUrl} label={t("preferences.developerLinks.github")} icon={<GitHubMark className="h-5 w-5 text-slate-200" />} />
      <DeveloperYouTubeLink url={youtubeUrl} isOnAir={isYouTubeOnAir} />
    </div>
  );
}

function shortcut_key_label_from_code(code: string): string {
  if (code.startsWith("Key")) {
    return code.slice(3);
  }

  if (code.startsWith("Digit")) {
    return code.slice(5);
  }

  const codeLabelMap: Record<string, string> = {
    Backquote: "`",
    Backslash: "\\",
    BracketLeft: "[",
    BracketRight: "]",
    Comma: ",",
    Enter: "Return",
    Equal: "=",
    Minus: "-",
    Period: ".",
    Quote: "'",
    Semicolon: ";",
    Slash: "/",
    Space: "Space",
    Tab: "Tab",
  };

  return codeLabelMap[code] ?? code.replace(/^Numpad/, "Numpad ");
}

function shortcut_label_from_event(event: React.KeyboardEvent<HTMLButtonElement>): {
  label: string;
  isComplete: boolean;
  isCancel: boolean;
  isClear: boolean;
  isInvalid: boolean;
} {
  if (event.key === "Escape") {
    return { label: "", isComplete: false, isCancel: true, isClear: false, isInvalid: false };
  }

  if (event.key === "Backspace" || event.key === "Delete") {
    return { label: "", isComplete: true, isCancel: false, isClear: true, isInvalid: false };
  }

  const parts: string[] = [];
  const hasRequiredModifier = event.metaKey || event.ctrlKey || event.altKey;
  const isModifierOnly = ["Meta", "Control", "Alt", "Shift"].includes(event.key);

  if (event.metaKey) {
    parts.push("Command");
  }

  if (event.ctrlKey) {
    parts.push("Ctrl");
  }

  if (event.altKey) {
    parts.push("Option");
  }

  if (event.shiftKey) {
    parts.push("Shift");
  }

  if (!isModifierOnly) {
    parts.push(shortcut_key_label_from_code(event.code));
  }

  return {
    label: parts.join(" + "),
    isComplete: hasRequiredModifier && !isModifierOnly,
    isCancel: false,
    isClear: false,
    isInvalid: !hasRequiredModifier && !isModifierOnly,
  };
}

function ShortcutCaptureButton({
  value,
  isConflict = false,
  findDuplicateAction,
  duplicateActionLabel,
  onResolveDuplicate,
  onDuplicateConflictChange,
  onChange,
  onInvalidChange,
}: {
  value: string;
  isConflict?: boolean;
  findDuplicateAction: (shortcut: string) => LauncherShortcutAction | undefined;
  duplicateActionLabel: (action: LauncherShortcutAction) => string;
  onResolveDuplicate: (action: LauncherShortcutAction) => void;
  onDuplicateConflictChange: (action?: LauncherShortcutAction) => void;
  onChange: (value: string) => void;
  onInvalidChange: (isInvalid: boolean) => void;
}) {
  const { t } = useTranslation();
  const [isCapturing, setIsCapturing] = useState(false);
  const [draftValue, setDraftValue] = useState(value);
  const [errorMessage, setErrorMessage] = useState("");

  React.useEffect(() => {
    if (!isCapturing) {
      setDraftValue(value);
    }
  }, [isCapturing, value]);

  return (
    <div className="flex w-56 min-w-0 flex-col items-end">
    <button
      type="button"
      className={`inline-flex h-10 w-full items-center justify-center rounded-full border px-4 font-mono text-xs transition ${
        errorMessage
          ? "border-red-400/45 bg-red-500/10 text-red-100"
          :
        isCapturing
          ? "accent-border bg-white/[0.08] text-white shadow-[0_0_24px_rgb(var(--accent-rgb)/0.18)]"
          : isConflict
            ? "border-red-400/45 bg-red-500/10 text-red-100"
            : "border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/[0.07]"
      }`}
      onClick={(event) => {
        setDraftValue(value);
        setErrorMessage("");
        onDuplicateConflictChange(undefined);
        onInvalidChange(false);
        setIsCapturing(true);
        event.currentTarget.focus();
      }}
      onBlur={() => {
        setDraftValue(value);
        if (!errorMessage) {
          onDuplicateConflictChange(undefined);
        }
        setIsCapturing(false);
      }}
      onKeyDown={(event) => {
        if (!isCapturing) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        const nextShortcut = shortcut_label_from_event(event);

        if (nextShortcut.isCancel) {
          setDraftValue(value);
          setErrorMessage("");
          onDuplicateConflictChange(undefined);
          onInvalidChange(false);
          setIsCapturing(false);
          event.currentTarget.blur();
          return;
        }

        setDraftValue(nextShortcut.label);

        if (nextShortcut.isInvalid) {
          setErrorMessage(t("preferences.shortcuts.modifierRequired"));
          onDuplicateConflictChange(undefined);
          onInvalidChange(true);
          return;
        }

        if (!nextShortcut.isComplete) {
          return;
        }

        const duplicateAction = !nextShortcut.isClear ? findDuplicateAction(nextShortcut.label) : undefined;

        if (duplicateAction) {
          setErrorMessage(t("preferences.shortcuts.duplicate"));
          onDuplicateConflictChange(duplicateAction);
          onInvalidChange(true);

          if (!window.confirm(t("preferences.shortcuts.duplicateResolveConfirm", {
            shortcut: nextShortcut.label,
            action: duplicateActionLabel(duplicateAction),
          }))) {
            return;
          }

          onResolveDuplicate(duplicateAction);
          onDuplicateConflictChange(undefined);
          onInvalidChange(false);
          onChange(nextShortcut.label);
          setErrorMessage("");
          setIsCapturing(false);
          event.currentTarget.blur();
          return;
        }

        setErrorMessage("");
        onDuplicateConflictChange(undefined);
        onInvalidChange(false);
        onChange(nextShortcut.isClear ? "" : nextShortcut.label);
        setIsCapturing(false);
        event.currentTarget.blur();
      }}
    >
      {isCapturing
        ? draftValue || t("preferences.shortcuts.recording")
        : value || t("preferences.shortcuts.unassigned")}
    </button>
      <p className="mt-1 min-h-4 max-w-full truncate text-right text-xs text-red-300">{errorMessage}</p>
    </div>
  );
}

export function PreferenceView({
  installPath = "~/Library/Application Support/BDIH Launcher/Wine",
  bottlePrefixPath = "~/Library/Application Support/BDIH Launcher/Bottles",
  dxmtCachePath = "~/Library/Application Support/BDIH Launcher/DXMT",
  locale,
  accentColor = "rose",
  themeMode = "system",
  appLoggingLevel = "off",
  debugFlagMode = "preset",
  loggingLevel = "off",
  wineDebugArgs = "",
  shortcuts = DEFAULT_SHORTCUTS,
  autoUpdateEnabled = true,
  appUpdateStatus,
  developerSiteUrl = BDIH_SITE_URL,
  developerGitHubUrl = BDIH_GITHUB_URL,
  developerYouTubeUrl = BDIH_YOUTUBE_URL,
  isDeveloperOnAir = false,
  initialCategory = "general",
  initialHasChanges = false,
  onInstallPathChange,
  onBottlePrefixPathChange,
  onDxmtCachePathChange,
  onLocaleChange,
  onAccentColorChange,
  onThemeModeChange,
  onAppLoggingLevelChange,
  onDebugFlagModeChange,
  onLoggingLevelChange,
  onWineDebugArgsChange,
  onShortcutChange,
  onAutoUpdateEnabledChange,
  onCheckForUpdates,
  onBrowsePath,
  onResetPath,
  onDeleteLauncherData,
  onReset,
  onSave,
}: PreferenceViewProps) {
  const { t, i18n } = useTranslation();
  const [activeCategory, setActiveCategory] = useState<PreferenceCategory>(initialCategory);
  const [hasChanges, setHasChanges] = useState(initialHasChanges);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteTargets, setDeleteTargets] = useState<LauncherDataDeleteTarget[]>(["all"]);
  const [shortcutValidationErrors, setShortcutValidationErrors] = useState<Partial<Record<LauncherShortcutAction, boolean>>>({});
  const [shortcutDuplicateConflictActions, setShortcutDuplicateConflictActions] = useState<LauncherShortcutAction[]>([]);
  const currentLanguage = i18n.language.split("-")[0];
  const selectedLocale = locale ?? (is_supported_locale(currentLanguage) ? currentLanguage : "ko");
  const localeOptions = LOCALE_OPTIONS.map((supportedLocale) => ({
    value: supportedLocale.value,
    label: supportedLocale.nativeLabel,
  }));
  const themeModeOptions = RENDERER_THEME_MODES.map((mode) => ({
    value: mode,
    label: t(`theme.mode.${mode}`),
  }));
  const loggingLevelOptions = LAUNCHER_LOG_LEVELS.map((level) => ({
    value: level,
    label: t(`preferences.logging.levels.${level}.label`),
    description: t(`preferences.logging.levels.${level}.description`),
  }));
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
  const shortcutItems: Array<[LauncherShortcutAction, string, string]> = [
    ["launch", "preferences.shortcuts.launchTitle", "preferences.shortcuts.launchDescription"],
    ["logs", "preferences.shortcuts.logsTitle", "preferences.shortcuts.logsDescription"],
    ["preferences", "preferences.shortcuts.preferencesTitle", "preferences.shortcuts.preferencesDescription"],
  ] as const;

  function markChanged() {
    setHasChanges(true);
  }

  function handleSave() {
    if (Object.values(shortcutValidationErrors).some(Boolean)) {
      return;
    }

    onSave?.();
    setHasChanges(false);
  }

  function handleShortcutInvalidChange(action: LauncherShortcutAction, isInvalid: boolean) {
    setShortcutValidationErrors((currentErrors) => ({
      ...currentErrors,
      [action]: isInvalid,
    }));
  }

  function shortcutTitle(action: LauncherShortcutAction) {
    return t(shortcutItems.find(([candidateAction]) => candidateAction === action)?.[1] ?? action);
  }

  function findShortcutDuplicateAction(action: LauncherShortcutAction, shortcut: string): LauncherShortcutAction | undefined {
    return Object.entries(shortcuts).find(([candidateAction, candidateShortcut]) =>
      candidateAction !== action && candidateShortcut === shortcut,
    )?.[0] as LauncherShortcutAction | undefined;
  }

  function handleShortcutDuplicateConflictChange(
    action: LauncherShortcutAction,
    duplicateAction?: LauncherShortcutAction,
  ) {
    setShortcutDuplicateConflictActions(duplicateAction ? [action, duplicateAction] : []);
  }

  function handleDeleteLauncherData() {
    onDeleteLauncherData?.(deleteTargets);
    setIsDeleteDialogOpen(false);
    setHasChanges(false);
  }

  function openDeleteDialog(targets: LauncherDataDeleteTarget[]) {
    setDeleteTargets(targets);
    setIsDeleteDialogOpen(true);
  }

  const deleteTargetOptions: Array<{
    id: LauncherDataDeleteTarget;
    title: string;
    description: string;
    paths: string[];
  }> = [
    {
      id: "wineRuntime",
      title: t("preferences.dangerZone.targets.wineRuntime.title"),
      description: t("preferences.dangerZone.targets.wineRuntime.description"),
      paths: [installPath],
    },
    {
      id: "bottlePrefixes",
      title: t("preferences.dangerZone.targets.bottlePrefixes.title"),
      description: t("preferences.dangerZone.targets.bottlePrefixes.description"),
      paths: [bottlePrefixPath],
    },
    {
      id: "dxmtCache",
      title: t("preferences.dangerZone.targets.dxmtCache.title"),
      description: t("preferences.dangerZone.targets.dxmtCache.description"),
      paths: [dxmtCachePath],
    },
    {
      id: "settings",
      title: t("preferences.dangerZone.targets.settings.title"),
      description: t("preferences.dangerZone.targets.settings.description"),
      paths: ["~/.bdih-launcher/settings.json"],
    },
    {
      id: "logs",
      title: t("preferences.dangerZone.targets.logs.title"),
      description: t("preferences.dangerZone.targets.logs.description"),
      paths: ["~/Library/Application Support/BDIH Launcher/logs"],
    },
  ];
  const launcherDataPaths = deleteTargets.includes("all")
    ? [...new Set(deleteTargetOptions.flatMap((option) => option.paths))]
    : [...new Set(deleteTargetOptions.filter((option) => deleteTargets.includes(option.id)).flatMap((option) => option.paths))];
  const hasInvalidShortcuts = Object.values(shortcutValidationErrors).some(Boolean);

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

        <div className="overflow-x-auto pb-2">
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

              <SettingField title={t("preferences.themeModeTitle")} description={t("preferences.themeModeDescription")}>
                <SelectMenu
                  value={themeMode}
                  label={t("preferences.themeModeTitle")}
                  options={themeModeOptions}
                  onChange={(value) => {
                    if (RENDERER_THEME_MODES.includes(value as RendererThemeMode)) {
                      onThemeModeChange?.(value as RendererThemeMode);
                      markChanged();
                    }
                  }}
                />
              </SettingField>
            </div>

            <div className="mt-5">
              <SettingField title={t("preferences.appLoggingTitle")} description={t("preferences.appLoggingDescription")}>
                <SelectMenu
                  value={appLoggingLevel}
                  label={t("preferences.appLoggingTitle")}
                  options={loggingLevelOptions}
                  onChange={(value) => {
                    if (LAUNCHER_LOG_LEVELS.includes(value as LauncherLogLevel)) {
                      onAppLoggingLevelChange?.(value as LauncherLogLevel);
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

            <div className="mt-5 rounded-lg border border-red-400/20 bg-red-500/[0.06] p-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-red-100">{t("preferences.dangerZone.title")}</p>
                  <p className="mt-1 text-xs leading-5 text-red-100/65">{t("preferences.dangerZone.description")}</p>
                </div>
                <button
                  type="button"
                  className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md border border-red-400/25 bg-red-500/15 px-4 text-sm font-semibold text-red-100 transition hover:bg-red-500/25"
                  onClick={() => openDeleteDialog(["all"])}
                >
                  <Trash2 size={16} />
                  {t("preferences.dangerZone.deleteAction")}
                </button>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {deleteTargetOptions.map((option) => (
                  <div key={option.id} className="rounded-lg border border-white/10 bg-[#0b1020]/70 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-100">{option.title}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">{option.description}</p>
                      </div>
                      <button
                        type="button"
                        className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-red-400/20 px-3 text-xs font-semibold text-red-100 transition hover:bg-red-500/15"
                        onClick={() => openDeleteDialog([option.id])}
                      >
                        <Trash2 size={14} />
                        {t("common.actions.delete")}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </PreferenceSection>
        ) : null}

        {activeCategory === "wine" ? (
          <div className="space-y-6">
            <PreferenceSection title={t("preferences.storagePaths.title")} description={t("preferences.storagePaths.description")}>
              <div className="mb-4 flex justify-end">
                <StatusBadge label={t("common.local")} tone="neutral" />
              </div>
              <div className="grid gap-5">
                <PathSettingRow
                  id="install-path"
                  title={t("preferences.storagePaths.wineInstallTitle")}
                  description={t("preferences.storagePaths.wineInstallDescription")}
                  value={installPath}
                  onChange={(value) => {
                    onInstallPathChange?.(value);
                    markChanged();
                  }}
                  onBrowse={() => {
                    onBrowsePath?.("wineInstallPath");
                    markChanged();
                  }}
                  onReset={() => {
                    onResetPath?.("wineInstallPath");
                    markChanged();
                  }}
                />
                <PathSettingRow
                  id="bottle-prefix-path"
                  title={t("preferences.storagePaths.bottlePrefixTitle")}
                  description={t("preferences.storagePaths.bottlePrefixDescription")}
                  value={bottlePrefixPath}
                  onChange={(value) => {
                    onBottlePrefixPathChange?.(value);
                    markChanged();
                  }}
                  onBrowse={() => {
                    onBrowsePath?.("bottlePrefixPath");
                    markChanged();
                  }}
                  onReset={() => {
                    onResetPath?.("bottlePrefixPath");
                    markChanged();
                  }}
                />
                <PathSettingRow
                  id="dxmt-cache-path"
                  title={t("preferences.storagePaths.dxmtCacheTitle")}
                  description={t("preferences.storagePaths.dxmtCacheDescription")}
                  value={dxmtCachePath}
                  onChange={(value) => {
                    onDxmtCachePathChange?.(value);
                    markChanged();
                  }}
                  onBrowse={() => {
                    onBrowsePath?.("dxmtCachePath");
                    markChanged();
                  }}
                  onReset={() => {
                    onResetPath?.("dxmtCachePath");
                    markChanged();
                  }}
                />
                <div>
                  <button
                    type="button"
                    className="inline-flex h-10 items-center gap-2 rounded-md border border-white/10 px-4 text-sm font-semibold text-slate-200 transition hover:bg-white/5"
                    onClick={() => {
                      onReset?.();
                      markChanged();
                    }}
                  >
                    <RotateCcw size={16} />
                    {t("preferences.storagePaths.resetAll")}
                  </button>
                </div>
              </div>
            </PreferenceSection>

            <PreferenceSection title={t("preferences.logging.title")} description={t("preferences.logging.description")}>
              <div className="grid gap-3">
                <label
                  className={`grid gap-3 rounded-lg border p-4 transition md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] ${
                    debugFlagMode === "preset" ? "accent-border bg-white/[0.08]" : "border-white/10 bg-[#0b1020] hover:bg-white/[0.04]"
                  }`}
                >
                  <span className="flex min-w-0 gap-3">
                    <input
                      type="radio"
                      name="debug-flag-mode"
                      checked={debugFlagMode === "preset"}
                      className="accent-checkbox mt-1 h-4 w-4"
                      onChange={() => {
                        onDebugFlagModeChange?.("preset");
                        markChanged();
                      }}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-slate-100">{t("preferences.logging.modePresetTitle")}</span>
                      <span className="mt-1 block text-xs leading-5 text-slate-500">{t("preferences.logging.modePresetDescription")}</span>
                    </span>
                  </span>
                  <span className={debugFlagMode === "preset" ? "min-w-0" : "pointer-events-none min-w-0 opacity-45"}>
                    <SelectMenu
                      value={loggingLevel}
                      label={t("preferences.logging.modePresetTitle")}
                      options={loggingLevelOptions}
                      onChange={(value) => {
                        if (LAUNCHER_LOG_LEVELS.includes(value as LauncherLogLevel)) {
                          onLoggingLevelChange?.(value as LauncherLogLevel);
                          markChanged();
                        }
                      }}
                    />
                  </span>
                </label>
                <label
                  className={`grid gap-3 rounded-lg border p-4 transition md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] ${
                    debugFlagMode === "wineDebug" ? "accent-border bg-white/[0.08]" : "border-white/10 bg-[#0b1020] hover:bg-white/[0.04]"
                  }`}
                >
                  <span className="flex min-w-0 gap-3">
                    <input
                      type="radio"
                      name="debug-flag-mode"
                      checked={debugFlagMode === "wineDebug"}
                      className="accent-checkbox mt-1 h-4 w-4"
                      onChange={() => {
                        onDebugFlagModeChange?.("wineDebug");
                        markChanged();
                      }}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-slate-100">{t("preferences.logging.modeWineDebugTitle")}</span>
                      <span className="mt-1 block text-xs leading-5 text-slate-500">{t("preferences.logging.modeWineDebugDescription")}</span>
                    </span>
                  </span>
                  <span className={debugFlagMode === "wineDebug" ? "min-w-0 rounded-lg border border-white/10 bg-[#0b1020] px-3" : "pointer-events-none min-w-0 rounded-lg border border-white/10 bg-[#0b1020] px-3 opacity-45"}>
                    <input
                      value={wineDebugArgs}
                      placeholder={t("preferences.logging.wineDebugPlaceholder")}
                      spellCheck={false}
                      className="h-11 w-full bg-transparent font-mono text-sm text-slate-100 outline-none placeholder:text-slate-600"
                      onChange={(event) => {
                        onWineDebugArgsChange?.(event.target.value);
                        markChanged();
                      }}
                    />
                  </span>
                </label>
              </div>
            </PreferenceSection>
          </div>
        ) : null}

        {activeCategory === "shortcut" ? (
          <PreferenceSection title={t("preferences.shortcuts.title")} description={t("preferences.shortcuts.description")}>
            <div className="grid gap-3">
              {shortcutItems.map(([action, titleKey, descriptionKey]) => {
                const isShortcutConflict = shortcutDuplicateConflictActions.includes(action);

                return (
                  <div
                    key={action}
                    className={`grid gap-3 rounded-lg border p-4 transition md:grid-cols-[minmax(0,1fr)_14rem] ${
                      isShortcutConflict
                        ? "border-red-400/45 bg-red-500/10"
                        : "border-white/10 bg-[#0b1020]"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className={isShortcutConflict ? "text-sm font-semibold text-red-100" : "text-sm font-semibold text-slate-100"}>{t(titleKey)}</p>
                      <p className={isShortcutConflict ? "mt-1 text-xs leading-5 text-red-100/65" : "mt-1 text-xs leading-5 text-slate-500"}>{t(descriptionKey)}</p>
                    </div>
                    <ShortcutCaptureButton
                      value={shortcuts[action] ?? ""}
                      isConflict={isShortcutConflict}
                      findDuplicateAction={(shortcut) => findShortcutDuplicateAction(action, shortcut)}
                      duplicateActionLabel={shortcutTitle}
                      onResolveDuplicate={(duplicateAction) => {
                        onShortcutChange?.(duplicateAction, "");
                        handleShortcutInvalidChange(duplicateAction, false);
                        markChanged();
                      }}
                      onDuplicateConflictChange={(duplicateAction) => handleShortcutDuplicateConflictChange(action, duplicateAction)}
                      onChange={(shortcut) => {
                        onShortcutChange?.(action, shortcut);
                        handleShortcutDuplicateConflictChange(action);
                        markChanged();
                      }}
                      onInvalidChange={(isInvalid) => handleShortcutInvalidChange(action, isInvalid)}
                    />
                  </div>
                );
              })}
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
            <p className={`mt-0.5 truncate text-xs ${hasInvalidShortcuts ? "text-red-300" : "text-slate-500"}`}>
              {hasInvalidShortcuts ? t("preferences.shortcuts.saveBlocked") : t("preferences.unsavedDescription")}
            </p>
          </div>
          <button
            type="button"
            disabled={hasInvalidShortcuts}
            className="accent-primary inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-500"
            onClick={handleSave}
          >
            <Save size={16} />
            {t("common.actions.save")}
          </button>
        </div>
      </div>

      <Dialog
        open={isDeleteDialogOpen}
        title={t("preferences.dangerZone.confirmTitle")}
        description={t("preferences.dangerZone.confirmDescription")}
        tone="danger"
        icon={Trash2}
        placement="center"
        widthClassName="max-w-2xl"
        onClose={() => setIsDeleteDialogOpen(false)}
        actions={[
          {
            label: t("common.actions.cancel"),
            onClick: () => setIsDeleteDialogOpen(false),
          },
          {
            label: t("preferences.dangerZone.confirmAction"),
            icon: Trash2,
            variant: "danger",
            onClick: handleDeleteLauncherData,
          },
        ]}
      >
        <div className="rounded-lg border border-red-400/15 bg-black/20 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-red-100/70">
            {t("preferences.dangerZone.pathsTitle")}
          </p>
          <ul className="mt-3 space-y-2">
            {launcherDataPaths.map((dataPath) => (
              <li key={dataPath} className="break-all rounded-md bg-white/[0.04] px-3 py-2 font-mono text-xs text-slate-300">
                {dataPath}
              </li>
            ))}
          </ul>
        </div>
      </Dialog>
    </div>
  );
}
