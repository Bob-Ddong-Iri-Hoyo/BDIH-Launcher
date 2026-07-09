import React, { useMemo, useState } from "react";
import { FolderOpen, Keyboard, MonitorCog, RotateCcw, Save, Trash2, Wine } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BDIH_DISCORD_URL, BDIH_GITHUB_URL, BDIH_SITE_URL, BDIH_YOUTUBE_URL } from "../../../Common/Constant/RuntimeSources";
import { AppUpdateStatusPayload, DebugFlagMode, DeleteLauncherDataResultPayload, IPC_CHANNELS, LAUNCHER_LOG_LEVELS, LauncherDataDeleteTarget, LauncherLogLevel, LauncherShortcutAction, LauncherShortcutMap, RENDERER_THEME_MODES, RendererThemeMode } from "../../../Common/Types/IPC";
import { I18N_RESOURCES } from "../../I18n/Resources";
import { AppUpdatePanel } from "../../Component/AppUpdatePanel";
import { DeveloperLinkGroup } from "../../Component/DeveloperLinks";
import { Dialog } from "../../Component/Dialog";
import { ProgressBar } from "../../Component/ProgressBar";
import { PathAutocompleteInput } from "../../Component/PathAutocompleteInput";
import { SelectMenu } from "../../Component/SelectMenu";
import { StatusBadge } from "../../Component/StatusBadge";
import { Box, Button, FieldLabel, InlineText, Input, Text } from "../../Component/Primitives";
import { is_supported_locale, LOCALE_OPTIONS, SupportedLocale } from "../../I18n";
import { ACCENT_COLOR_ITEMS, AccentColor, is_accent_color } from "../../Theme";

type PreferenceCategory = "general" | "wine" | "shortcut";
export type PreferencePathKey = "dataRootPath" | "bottlePrefixPath";

const DEFAULT_SHORTCUTS: LauncherShortcutMap = {
  launch: "Command + Return",
  logs: "Command + L",
  preferences: "Command + ,",
};

export interface PreferenceViewProps {
  dataRootPath?: string;
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
  closeToTray?: boolean;
  appUpdateStatus?: AppUpdateStatusPayload;
  developerSiteUrl?: string;
  developerGitHubUrl?: string;
  developerDiscordUrl?: string;
  developerYouTubeUrl?: string;
  isDeveloperOnAir?: boolean;
  initialCategory?: PreferenceCategory;
  initialHasChanges?: boolean;
  onDataRootPathChange?: (dataRootPath: string) => void;
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
  onCloseToTrayChange?: (enabled: boolean) => void;
  onCheckForUpdates?: () => void;
  onBrowsePath?: (pathKey: PreferencePathKey) => void;
  onResetPath?: (pathKey: PreferencePathKey) => void;
  onDeleteLauncherData?: (targets: LauncherDataDeleteTarget[]) => Promise<DeleteLauncherDataResultPayload | undefined> | DeleteLauncherDataResultPayload | undefined;
  onSave?: () => void;
}

function SettingField({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <Box className="min-w-0">
      <Text className="text-sm font-semibold text-slate-100">{title}</Text>
      <Text className="mt-1 min-h-10 text-xs leading-5 text-slate-500">{description}</Text>
      <Box className="mt-3">{children}</Box>
    </Box>
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
    <Box as="section" className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
      <Box className="mb-5">
        <Text as="h3" className="text-base font-semibold text-white">{title}</Text>
        <Text className="mt-1 text-sm text-slate-400">{description}</Text>
      </Box>
      {children}
    </Box>
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
    <Box>
      <FieldLabel className="block text-sm font-semibold text-slate-100" htmlFor={id}>
        {title}
      </FieldLabel>
      <Text className="mt-1 text-xs leading-5 text-slate-500">{description}</Text>
      <Box className="mt-3 flex gap-2">
        <Box className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-white/10 bg-[#0b1020] px-3">
          <FolderOpen size={16} className="shrink-0 text-slate-500" />
          <PathAutocompleteInput
            id={id}
            value={value}
            defaultPath={value}
            onChange={(nextValue) => onChange?.(nextValue)}
            className="h-11 min-w-0 flex-1 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-600"
          />
        </Box>
        <Button
          type="button"
          className="inline-flex h-11 shrink-0 items-center gap-2 rounded-md border border-white/10 px-4 text-sm font-semibold text-slate-200 transition hover:bg-white/5"
          onClick={onBrowse}
        >
          <FolderOpen size={16} />
          {t("common.actions.browse")}
        </Button>
        <Button
          type="button"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-white/10 text-slate-300 transition hover:bg-white/5 hover:text-white"
          aria-label={t("common.actions.reset")}
          title={t("common.actions.reset")}
          onClick={onReset}
        >
          <RotateCcw size={16} />
        </Button>
      </Box>
    </Box>
  );
}

function create_data_root_child_path(dataRootPath: string, childName: string): string {
  const trimmedRoot = dataRootPath.trim().replace(/\/+$/, "") || "~/Library/Application Support/BDIH Launcher";

  return `${trimmedRoot}/${childName}`;
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
    <Box className="flex w-56 min-w-0 flex-col items-end">
    <Button
      type="button"
      className={`inline-flex h-10 w-full items-center justify-center rounded-full border px-4 font-mono text-xs transition ${
        errorMessage
          ? "border-red-400/45 bg-red-500/10 text-red-100"
          :
        isCapturing
          ? "accent-selection shadow-[0_0_24px_rgb(var(--accent-rgb)/0.18)]"
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
    </Button>
      <Text className="mt-1 min-h-4 max-w-full truncate text-right text-xs text-red-300">{errorMessage}</Text>
    </Box>
  );
}

export function PreferenceView({
  dataRootPath = "~/Library/Application Support/BDIH Launcher",
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
  closeToTray = false,
  appUpdateStatus,
  developerSiteUrl = BDIH_SITE_URL,
  developerGitHubUrl = BDIH_GITHUB_URL,
  developerDiscordUrl = BDIH_DISCORD_URL,
  developerYouTubeUrl = BDIH_YOUTUBE_URL,
  isDeveloperOnAir = false,
  initialCategory = "general",
  initialHasChanges = false,
  onDataRootPathChange,
  onBottlePrefixPathChange,
  onLocaleChange,
  onAccentColorChange,
  onThemeModeChange,
  onAppLoggingLevelChange,
  onDebugFlagModeChange,
  onLoggingLevelChange,
  onWineDebugArgsChange,
  onShortcutChange,
  onAutoUpdateEnabledChange,
  onCloseToTrayChange,
  onCheckForUpdates,
  onBrowsePath,
  onResetPath,
  onDeleteLauncherData,
  onSave,
}: PreferenceViewProps) {
  const { t, i18n } = useTranslation();
  const [activeCategory, setActiveCategory] = useState<PreferenceCategory>(initialCategory);
  const [localHasChanges, setLocalHasChanges] = useState(false);
  const hasChanges = initialHasChanges || localHasChanges;
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleteWorking, setIsDeleteWorking] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState(0);
  const [deleteResult, setDeleteResult] = useState<DeleteLauncherDataResultPayload | undefined>();
  const [deleteTargets, setDeleteTargets] = useState<LauncherDataDeleteTarget[]>(["all"]);
  const [shortcutValidationErrors, setShortcutValidationErrors] = useState<Partial<Record<LauncherShortcutAction, boolean>>>({});
  const [shortcutDuplicateConflictActions, setShortcutDuplicateConflictActions] = useState<LauncherShortcutAction[]>([]);
  const defaultBottlePrefixPath = useMemo(() => create_data_root_child_path(dataRootPath, "Bottles"), [dataRootPath]);
  const [isAdvancedStorageOpen, setIsAdvancedStorageOpen] = useState(() =>
    bottlePrefixPath.trim().replace(/\/+$/, "") !== defaultBottlePrefixPath.trim().replace(/\/+$/, ""),
  );

  React.useEffect(() => {
    if (bottlePrefixPath.trim().replace(/\/+$/, "") !== defaultBottlePrefixPath.trim().replace(/\/+$/, "")) {
      setIsAdvancedStorageOpen(true);
    }
  }, [bottlePrefixPath, defaultBottlePrefixPath]);

  React.useEffect(() => {
    if (!initialHasChanges) {
      setLocalHasChanges(false);
    }
  }, [initialHasChanges]);
  const currentLanguage = i18n.language.split("-")[0];
  const selectedLocale = locale ?? (is_supported_locale(currentLanguage) ? currentLanguage : "ko");
  const localeOptions = LOCALE_OPTIONS.map((supportedLocale) => ({
    value: supportedLocale.value,
    label: I18N_RESOURCES[supportedLocale.value]?.translation.localeMeta?.nativeName
      ?? supportedLocale.fallbackNativeName,
  }));
  const themeModeOptions = RENDERER_THEME_MODES.map((mode) => ({
    value: mode,
    label: t(`theme.mode.${mode}`),
  }));
  const accentColorOptions = ACCENT_COLOR_ITEMS.map((item) => ({
    value: item.id,
    label: t(`theme.accent.${item.id}`),
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
    setLocalHasChanges(true);
  }

  function handleSave() {
    if (Object.values(shortcutValidationErrors).some(Boolean)) {
      return;
    }

    onSave?.();
    setLocalHasChanges(false);
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

  async function handleDeleteLauncherData() {
    setIsDeleteDialogOpen(false);
    setDeleteProgress(8);
    setIsDeleteWorking(true);

    const progressStep = Math.max(3, Math.floor(70 / Math.max(1, launcherDataPaths.length)));
    const progressTimer = window.setInterval(() => {
      setDeleteProgress((currentProgress) => Math.min(92, currentProgress + progressStep));
    }, 220);

    try {
      const result = await onDeleteLauncherData?.(deleteTargets);
      setDeleteResult(result ?? {
        deletedPaths: [],
        skippedPaths: [],
        failedPaths: [],
      });
    } catch (error) {
      setDeleteResult({
        deletedPaths: [],
        skippedPaths: [],
        failedPaths: [
          {
            path: deleteTargets.join(", "),
            error: error instanceof Error ? error.message : String(error),
          },
        ],
      });
    } finally {
      window.clearInterval(progressTimer);
      setDeleteProgress(100);
      window.setTimeout(() => {
        setIsDeleteWorking(false);
        setDeleteProgress(0);
      }, 260);
    }
  }

  function openDeleteDialog(targets: LauncherDataDeleteTarget[]) {
    setDeleteTargets(targets);
    setDeleteProgress(0);
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
    <Box className="flex h-full min-h-0 flex-col p-6">
      <Box className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col gap-4">
        <Box className="shrink-0 space-y-3">
          <Box className="flex justify-end">
            <DeveloperLinkGroup
              siteUrl={developerSiteUrl}
              githubUrl={developerGitHubUrl}
              discordUrl={developerDiscordUrl}
              youtubeUrl={developerYouTubeUrl}
              isYouTubeOnAir={isDeveloperOnAir}
            />
          </Box>

          <Box className="overflow-x-auto rounded-xl border border-white/10 bg-[#080d19]/95 px-2 py-2 shadow-xl shadow-black/20 backdrop-blur">
            <Box className="flex min-w-max gap-2">
              {categories.map((category) => {
                const Icon = category.icon;
                const isActive = activeCategory === category.id;

                return (
                  <Button
                    key={category.id}
                    type="button"
                    className={`flex w-52 items-start gap-3 rounded-lg border p-3 text-left transition ${
                      isActive
                        ? "accent-selection"
                        : "border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/[0.06] hover:text-slate-100"
                    }`}
                    onClick={() => setActiveCategory(category.id)}
                  >
                    <Icon size={18} className={isActive ? "accent-text mt-0.5 shrink-0" : "mt-0.5 shrink-0 text-slate-500"} />
                    <InlineText className="min-w-0">
                      <InlineText className="block text-sm font-semibold">{category.label}</InlineText>
                      <InlineText className="mt-1 block line-clamp-2 text-xs leading-4 text-slate-500">{category.description}</InlineText>
                    </InlineText>
                  </Button>
                );
              })}
            </Box>
          </Box>
        </Box>

        <Box className="min-h-0 flex-1 overflow-y-auto pb-28 pr-1">

        {activeCategory === "general" ? (
          <PreferenceSection title={t("preferences.generalTitle")} description={t("preferences.generalDescription")}>
            <Box className="grid gap-5 md:grid-cols-2">
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
            </Box>

            <Box className="mt-5">
              <SettingField title={t("preferences.closeBehavior.title")} description={t("preferences.closeBehavior.description")}>
                <Box className="grid gap-3 md:grid-cols-2">
                  <FieldLabel
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition ${
                      !closeToTray ? "accent-selection" : "border-white/10 bg-[#0b1020] hover:bg-white/[0.04]"
                    }`}
                  >
                    <Input
                      type="radio"
                      name="close-behavior"
                      checked={!closeToTray}
                      className="accent-checkbox mt-1 h-4 w-4"
                      onChange={() => {
                        onCloseToTrayChange?.(false);
                        markChanged();
                      }}
                    />
                    <InlineText className="min-w-0">
                      <InlineText className="block text-sm font-semibold text-slate-100">
                        {t("preferences.closeBehavior.quitTitle")}
                      </InlineText>
                      <InlineText className="mt-1 block text-xs leading-5 text-slate-500">
                        {t("preferences.closeBehavior.quitDescription")}
                      </InlineText>
                    </InlineText>
                  </FieldLabel>
                  <FieldLabel
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition ${
                      closeToTray ? "accent-selection" : "border-white/10 bg-[#0b1020] hover:bg-white/[0.04]"
                    }`}
                  >
                    <Input
                      type="radio"
                      name="close-behavior"
                      checked={closeToTray}
                      className="accent-checkbox mt-1 h-4 w-4"
                      onChange={() => {
                        onCloseToTrayChange?.(true);
                        markChanged();
                      }}
                    />
                    <InlineText className="min-w-0">
                      <InlineText className="block text-sm font-semibold text-slate-100">
                        {t("preferences.closeBehavior.trayTitle")}
                      </InlineText>
                      <InlineText className="mt-1 block text-xs leading-5 text-slate-500">
                        {t("preferences.closeBehavior.trayDescription")}
                      </InlineText>
                    </InlineText>
                  </FieldLabel>
                </Box>
              </SettingField>
            </Box>

            <Box className="mt-5">
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
            </Box>

            <Box className="mt-5">
              <AppUpdatePanel
                autoUpdateEnabled={autoUpdateEnabled}
                status={appUpdateStatus}
                onAutoUpdateChange={(enabled) => {
                  onAutoUpdateEnabledChange?.(enabled);
                  markChanged();
                }}
                onCheckForUpdates={onCheckForUpdates}
              />
            </Box>

            <Box className="mt-5 rounded-lg border border-red-400/20 bg-red-500/[0.06] p-4">
              <Box className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <Box className="min-w-0">
                  <Text className="text-sm font-semibold text-red-100">{t("preferences.dangerZone.title")}</Text>
                  <Text className="mt-1 text-xs leading-5 text-red-100/65">{t("preferences.dangerZone.description")}</Text>
                </Box>
                <Button
                  type="button"
                  className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md border border-red-400/25 bg-red-500/15 px-4 text-sm font-semibold text-red-100 transition hover:bg-red-500/25"
                  onClick={() => openDeleteDialog(["all"])}
                >
                  <Trash2 size={16} />
                  {t("preferences.dangerZone.deleteAction")}
                </Button>
              </Box>
              <Box className="mt-4 grid gap-3 md:grid-cols-2">
                {deleteTargetOptions.map((option) => (
                  <Box key={option.id} className="rounded-lg border border-white/10 bg-[#0b1020]/70 p-3">
                    <Box className="flex items-start justify-between gap-3">
                      <Box className="min-w-0">
                        <Text className="text-sm font-semibold text-slate-100">{option.title}</Text>
                        <Text className="mt-1 text-xs leading-5 text-slate-500">{option.description}</Text>
                      </Box>
                      <Button
                        type="button"
                        className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-red-400/20 px-3 text-xs font-semibold text-red-100 transition hover:bg-red-500/15"
                        onClick={() => openDeleteDialog([option.id])}
                      >
                        <Trash2 size={14} />
                        {t("common.actions.delete")}
                      </Button>
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>
          </PreferenceSection>
        ) : null}

        {activeCategory === "wine" ? (
          <Box className="space-y-6">
            <PreferenceSection title={t("preferences.storagePaths.title")} description={t("preferences.storagePaths.description")}>
              <Box className="grid gap-5">
                <PathSettingRow
                  id="data-root-path"
                  title={t("preferences.storagePaths.dataRootTitle")}
                  description={t("preferences.storagePaths.dataRootDescription")}
                  value={dataRootPath}
                  onChange={(value) => {
                    onDataRootPathChange?.(value);
                    if (isAdvancedStorageOpen) {
                      onBottlePrefixPathChange?.(bottlePrefixPath);
                    }
                    markChanged();
                  }}
                  onBrowse={() => {
                    onBrowsePath?.("dataRootPath");
                    markChanged();
                  }}
                  onReset={() => {
                    onResetPath?.("dataRootPath");
                    markChanged();
                  }}
                />
                <FieldLabel className="flex cursor-pointer items-start gap-3 rounded-lg border border-white/10 bg-[#0b1020] p-4 transition hover:bg-white/[0.04]">
                  <Input
                    type="checkbox"
                    className="mt-1 h-4 w-4 accent-[rgb(var(--accent-rgb))]"
                    checked={isAdvancedStorageOpen}
                    onChange={(event) => {
                      const checked = event.target.checked;

                      setIsAdvancedStorageOpen(checked);
                      if (!checked) {
                        onBottlePrefixPathChange?.(defaultBottlePrefixPath);
                      }
                      markChanged();
                    }}
                  />
                  <InlineText className="min-w-0">
                    <InlineText className="block text-sm font-semibold text-slate-100">
                      {t("preferences.storagePaths.advancedBottleRoot")}
                    </InlineText>
                    <InlineText className="mt-1 block text-xs leading-5 text-slate-500">
                      {t("preferences.storagePaths.advancedBottleRootDescription")}
                    </InlineText>
                  </InlineText>
                </FieldLabel>
                {isAdvancedStorageOpen ? (
                  <PathSettingRow
                    id="bottle-prefix-path"
                    title={t("preferences.storagePaths.bottleRootTitle")}
                    description={t("preferences.storagePaths.bottleRootDescription")}
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
                      onBottlePrefixPathChange?.(defaultBottlePrefixPath);
                      markChanged();
                    }}
                  />
                ) : null}
              </Box>
            </PreferenceSection>

            <PreferenceSection title={t("preferences.logging.title")} description={t("preferences.logging.description")}>
              <Box className="grid gap-3">
                <FieldLabel
                  className={`grid gap-3 rounded-lg border p-4 transition md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] ${
                    debugFlagMode === "preset" ? "accent-selection" : "border-white/10 bg-[#0b1020] hover:bg-white/[0.04]"
                  }`}
                >
                  <InlineText className="flex min-w-0 gap-3">
                    <Input
                      type="radio"
                      name="debug-flag-mode"
                      checked={debugFlagMode === "preset"}
                      className="accent-checkbox mt-1 h-4 w-4"
                      onChange={() => {
                        onDebugFlagModeChange?.("preset");
                        markChanged();
                      }}
                    />
                    <InlineText className="min-w-0">
                      <InlineText className="block text-sm font-semibold text-slate-100">{t("preferences.logging.modePresetTitle")}</InlineText>
                      <InlineText className="mt-1 block text-xs leading-5 text-slate-500">{t("preferences.logging.modePresetDescription")}</InlineText>
                    </InlineText>
                  </InlineText>
                  <InlineText className={debugFlagMode === "preset" ? "min-w-0" : "pointer-events-none min-w-0 opacity-45"}>
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
                  </InlineText>
                </FieldLabel>
                <FieldLabel
                  className={`grid gap-3 rounded-lg border p-4 transition md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] ${
                    debugFlagMode === "wineDebug" ? "accent-selection" : "border-white/10 bg-[#0b1020] hover:bg-white/[0.04]"
                  }`}
                >
                  <InlineText className="flex min-w-0 gap-3">
                    <Input
                      type="radio"
                      name="debug-flag-mode"
                      checked={debugFlagMode === "wineDebug"}
                      className="accent-checkbox mt-1 h-4 w-4"
                      onChange={() => {
                        onDebugFlagModeChange?.("wineDebug");
                        markChanged();
                      }}
                    />
                    <InlineText className="min-w-0">
                      <InlineText className="block text-sm font-semibold text-slate-100">{t("preferences.logging.modeWineDebugTitle")}</InlineText>
                      <InlineText className="mt-1 block text-xs leading-5 text-slate-500">{t("preferences.logging.modeWineDebugDescription")}</InlineText>
                    </InlineText>
                  </InlineText>
                  <InlineText className={debugFlagMode === "wineDebug" ? "min-w-0 rounded-lg border border-white/10 bg-[#0b1020] px-3" : "pointer-events-none min-w-0 rounded-lg border border-white/10 bg-[#0b1020] px-3 opacity-45"}>
                    <Input
                      value={wineDebugArgs}
                      placeholder={t("preferences.logging.wineDebugPlaceholder")}
                      spellCheck={false}
                      className="h-11 w-full bg-transparent font-mono text-sm text-slate-100 outline-none placeholder:text-slate-600"
                      onChange={(event) => {
                        onWineDebugArgsChange?.(event.target.value);
                        markChanged();
                      }}
                    />
                  </InlineText>
                </FieldLabel>
              </Box>
            </PreferenceSection>
          </Box>
        ) : null}

        {activeCategory === "shortcut" ? (
          <PreferenceSection title={t("preferences.shortcuts.title")} description={t("preferences.shortcuts.description")}>
            <Box className="grid gap-3">
              {shortcutItems.map(([action, titleKey, descriptionKey]) => {
                const isShortcutConflict = shortcutDuplicateConflictActions.includes(action);

                return (
                  <Box
                    key={action}
                    className={`grid gap-3 rounded-lg border p-4 transition md:grid-cols-[minmax(0,1fr)_14rem] ${
                      isShortcutConflict
                        ? "border-red-400/45 bg-red-500/10"
                        : "border-white/10 bg-[#0b1020]"
                    }`}
                  >
                    <Box className="min-w-0">
                      <Text className={isShortcutConflict ? "text-sm font-semibold text-red-100" : "text-sm font-semibold text-slate-100"}>{t(titleKey)}</Text>
                      <Text className={isShortcutConflict ? "mt-1 text-xs leading-5 text-red-100/65" : "mt-1 text-xs leading-5 text-slate-500"}>{t(descriptionKey)}</Text>
                    </Box>
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
                  </Box>
                );
              })}
            </Box>
          </PreferenceSection>
        ) : null}
      </Box>
      </Box>

      <Box
        className={`fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-[#080d19]/95 px-6 py-4 shadow-2xl shadow-black/30 backdrop-blur transition duration-200 ${
          hasChanges ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-full opacity-0"
        }`}
      >
        <Box className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <Box className="min-w-0">
            <Text className="text-sm font-semibold text-slate-100">{t("preferences.unsavedTitle")}</Text>
            <Text className={`mt-0.5 truncate text-xs ${hasInvalidShortcuts ? "text-red-300" : "text-slate-500"}`}>
              {hasInvalidShortcuts ? t("preferences.shortcuts.saveBlocked") : t("preferences.unsavedDescription")}
            </Text>
          </Box>
          <Button
            type="button"
            disabled={hasInvalidShortcuts}
            className="accent-primary inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-500"
            onClick={handleSave}
          >
            <Save size={16} />
            {t("common.actions.save")}
          </Button>
        </Box>
      </Box>

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
            onClick: () => void handleDeleteLauncherData(),
          },
        ]}
      >
        <Box className="rounded-lg border border-red-400/15 bg-black/20 p-3">
          <Text className="text-xs font-semibold uppercase tracking-wide text-red-100/70">
            {t("preferences.dangerZone.pathsTitle")}
          </Text>
          <Box as="ul" className="mt-3 space-y-2">
            {launcherDataPaths.map((dataPath) => (
              <Box as="li" key={dataPath} className="break-all rounded-md bg-white/[0.04] px-3 py-2 font-mono text-xs text-slate-300">
                {dataPath}
              </Box>
            ))}
          </Box>
        </Box>
      </Dialog>
      <Dialog
        open={isDeleteWorking}
        title={t("preferences.dangerZone.deleteWorkingTitle", "Deleting data")}
        description={t("preferences.dangerZone.deleteWorkingDescription", "Please wait until the launcher finishes deleting the selected data.")}
        tone="danger"
        icon={Trash2}
        placement="center"
        widthClassName="max-w-lg"
        onClose={() => undefined}
        closeOnBackdrop={false}
        showCloseButton={false}
        actions={[]}
      >
        <Box className="grid gap-3 rounded-lg border border-red-400/15 bg-black/20 p-4 text-sm text-slate-300">
          <Box>
            {t("preferences.dangerZone.deleteWorkingBody", "Deletion is in progress. Keep this window open for a moment.")}
          </Box>
          <ProgressBar
            progressValue={deleteProgress}
            showValue
            size="sm"
            tone="blue"
            animated={deleteProgress < 100}
          />
        </Box>
      </Dialog>
      <Dialog
        open={Boolean(deleteResult) && !isDeleteWorking}
        title={t("preferences.dangerZone.deleteCompleteTitle", "Delete complete")}
        description={t("preferences.dangerZone.deleteCompleteDescription", "The selected launcher data deletion request has finished.")}
        tone={deleteResult?.failedPaths.length ? "danger" : undefined}
        icon={Trash2}
        placement="center"
        widthClassName="max-w-2xl"
        onClose={() => undefined}
        closeOnBackdrop={false}
        showCloseButton={false}
        actions={[
          {
            label: t("common.actions.close"),
            onClick: () => setDeleteResult(undefined),
          },
        ]}
      >
        <Box className="grid gap-3 text-sm text-slate-300">
          <Box className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
            {t("preferences.dangerZone.deleteCompleteCounts", {
              defaultValue: "Deleted {{deleted}} / skipped {{skipped}} / failed {{failed}}",
              deleted: deleteResult?.deletedPaths.length ?? 0,
              skipped: deleteResult?.skippedPaths.length ?? 0,
              failed: deleteResult?.failedPaths.length ?? 0,
            })}
          </Box>
          {deleteResult?.failedPaths.length ? (
            <Box as="ul" className="space-y-2">
              {deleteResult.failedPaths.map((failedPath) => (
                <Box as="li" key={`${failedPath.path}-${failedPath.error}`} className="break-all rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-100">
                  {failedPath.path}: {failedPath.error}
                </Box>
              ))}
            </Box>
          ) : null}
        </Box>
      </Dialog>
    </Box>
  );
}
