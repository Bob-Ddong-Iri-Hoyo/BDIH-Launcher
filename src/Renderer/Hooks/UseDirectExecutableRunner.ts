import React from "react";
import { useTranslation } from "react-i18next";
import {
  app_name_from_executable_path,
  manual_app_id_from_executable_path,
  split_executable_args,
  to_wine_z_path,
} from "../../Common/Util/ExecutablePath";
import {
  bottle_name_to_slug,
  create_bottle_app_prefix_path,
  create_default_wine_prefix_path,
  create_hoyo_game_prefix_path,
  create_launcher_prefix_path,
  executable_path_for_wine_prefix,
} from "../../Common/Util/BottlePath";
import { IPC_CHANNELS } from "../../Common/Types/IPC";
import type { BottleLaunchOptionsPayload, BottlePrefixMetadataPayload, PathSuggestionItemPayload } from "../../Common/Types/IPC";
import type { WineLauncherOptionsManifest } from "../../Common/Types/Wine";
import type { Bottle } from "../Types/Bottle";
import {
  is_executable_path_target,
  resolve_direct_executable_autocomplete_action,
} from "../Logic/DirectExecutableAutocomplete";

export interface DirectExecutableRunnerController {
  bottle?: Bottle;
  launcherOptionsManifest?: WineLauncherOptionsManifest;
  launchOptions?: BottleLaunchOptionsPayload;
  isInstallerMode: boolean;
  executablePath: string;
  executableArgs: string;
  statusMessage: string;
  canRun: boolean;
  prefixOptions: DirectExecutablePrefixOption[];
  selectedPrefixId: string;
  selectedPrefixPath: string;
  pathSuggestions: PathSuggestionItemPayload[];
  isPathSuggestionOpen: boolean;
  selectedSuggestionIndex: number;
  isPathSuggesting: boolean;
  pathInputRef: React.RefObject<HTMLInputElement | null>;
  argsInputRef: React.RefObject<HTMLInputElement | null>;
  setExecutablePathFromInput: (value: string) => void;
  setExecutableArgs: (value: string) => void;
  setLaunchOptions?: (value: BottleLaunchOptionsPayload) => void;
  setInstallerMode: (value: boolean) => void;
  setSelectedPrefixId: (value: string) => void;
  suggestedCustomPrefixName: string;
  isCustomPrefixNameAvailable: (name: string) => boolean;
  addCustomPrefix: (name?: string) => boolean;
  deletePrefix: (prefix: DirectExecutablePrefixOption) => Promise<void>;
  selectPathSuggestion?: (index: number) => void;
  closePathSuggestions: () => void;
  applyPathSuggestion: (suggestion: PathSuggestionItemPayload) => void;
  registerExecutable: () => boolean;
  browseExecutable: () => Promise<void>;
  runExecutable: () => Promise<void>;
  handlePathKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => Promise<void>;
  handleArgsKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => Promise<void>;
}

export interface DirectExecutablePrefixOption extends BottlePrefixMetadataPayload {
  canDelete: boolean;
  canReset: boolean;
}

export function useDirectExecutableRunner({
  bottle,
  wineRuntimePath,
  dxmtPackagePath,
  launcherOptionsManifest,
  onRegisterBottleExecutable,
  onUpdateBottlePrefixes,
  onDeleteBottlePrefix,
  onStarted,
}: {
  bottle: Bottle;
  wineRuntimePath?: string;
  dxmtPackagePath?: string;
  launcherOptionsManifest?: WineLauncherOptionsManifest;
  onRegisterBottleExecutable?: (bottleId: string, executablePath: string, prefixPath: string, launchOptions?: BottleLaunchOptionsPayload) => void;
  onUpdateBottlePrefixes?: (bottleId: string, prefixes: BottlePrefixMetadataPayload[]) => void;
  onDeleteBottlePrefix?: (bottleId: string, prefix: BottlePrefixMetadataPayload) => Promise<void> | void;
  onStarted?: () => void;
}): DirectExecutableRunnerController {
  const { t } = useTranslation();
  const [executablePath, setExecutablePath] = React.useState("");
  const [executableArgs, setExecutableArgs] = React.useState("");
  const [launchOptions, setLaunchOptions] = React.useState<BottleLaunchOptionsPayload>({ presetId: "auto" });
  const [isInstallerMode, setInstallerMode] = React.useState(false);
  const [statusMessage, setStatusMessage] = React.useState("");
  const [pathSuggestions, setPathSuggestions] = React.useState<PathSuggestionItemPayload[]>([]);
  const [isPathSuggestionOpen, setIsPathSuggestionOpen] = React.useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = React.useState(0);
  const [isPathSuggesting, setIsPathSuggesting] = React.useState(false);
  const [isAutocompleteActive, setIsAutocompleteActive] = React.useState(false);
  const [selectedPrefixId, setSelectedPrefixId] = React.useState("preset:default");
  const suggestionRequestIdRef = React.useRef(0);
  const pathInputRef = React.useRef<HTMLInputElement>(null);
  const argsInputRef = React.useRef<HTMLInputElement>(null);
  const canRun = executablePath.trim().length > 0;
  const prefixOptions = React.useMemo(() => create_direct_executable_prefix_options(bottle, t), [bottle, t]);
  const fallbackPrefix = prefixOptions[0] ?? {
    id: "preset:default",
    name: "Default",
    path: create_default_wine_prefix_path(bottle.path),
    kind: "preset" as const,
    presetId: "default" as const,
    canDelete: false,
    canReset: true,
  };
  const selectedPrefix = prefixOptions.find((option) => option.id === selectedPrefixId) ?? fallbackPrefix;
  const manualPrefixPath = selectedPrefix.path;
  const suggestedCustomPrefixName = React.useMemo(
    () => create_next_custom_prefix_name(prefixOptions, "new-prefix"),
    [prefixOptions],
  );

  React.useEffect(() => {
    if (!selectedPrefixId.startsWith("custom:") && !prefixOptions.some((option) => option.id === selectedPrefixId)) {
      setSelectedPrefixId("preset:default");
    }
  }, [prefixOptions, selectedPrefixId]);

  function closePathSuggestions() {
    setIsPathSuggestionOpen(false);
    setIsAutocompleteActive(false);
    setSelectedSuggestionIndex(0);
  }

  function hidePathSuggestionsButKeepSession() {
    setIsPathSuggestionOpen(false);
    setSelectedSuggestionIndex(0);
  }

  async function requestPathSuggestions(value = executablePath): Promise<PathSuggestionItemPayload[]> {
    const requestId = suggestionRequestIdRef.current + 1;

    suggestionRequestIdRef.current = requestId;
    setIsPathSuggesting(true);
    setIsAutocompleteActive(true);

    try {
      const result = (await window.BTIH_API?.invoke(
        IPC_CHANNELS.APP.SUGGEST_PATHS.channelName,
        {
          value,
          defaultPath: manualPrefixPath,
          winePrefixPath: manualPrefixPath,
        },
      )) as { suggestions?: PathSuggestionItemPayload[] } | undefined;
      const suggestions = result?.suggestions ?? [];

      if (requestId !== suggestionRequestIdRef.current) {
        return suggestions;
      }

      setPathSuggestions(suggestions);
      setSelectedSuggestionIndex(0);
      setIsPathSuggestionOpen(suggestions.length > 0 && !is_executable_path_target(value));

      return suggestions;
    } catch (error) {
      if (requestId === suggestionRequestIdRef.current) {
        setStatusMessage(error instanceof Error ? error.message : String(error));
        setPathSuggestions([]);
        hidePathSuggestionsButKeepSession();
      }

      return [];
    } finally {
      if (requestId === suggestionRequestIdRef.current) {
        setIsPathSuggesting(false);
      }
    }
  }

  function setExecutablePathFromInput(value: string) {
    setExecutablePath(value);
    setStatusMessage("");

    if (is_executable_path_target(value)) {
      hidePathSuggestionsButKeepSession();
      return;
    }

    if (isAutocompleteActive) {
      void requestPathSuggestions(value);
    }
  }

  function applyPathSuggestion(suggestion: PathSuggestionItemPayload) {
    setExecutablePath(suggestion.path);
    setStatusMessage("");
    hidePathSuggestionsButKeepSession();

    if (is_executable_path_target(suggestion.path, suggestion.isDirectory)) {
      requestAnimationFrame(() => pathInputRef.current?.focus());
      return;
    }

    requestAnimationFrame(() => pathInputRef.current?.focus());
  }

  function selectPathSuggestion(index: number) {
    setSelectedSuggestionIndex(index);
  }

  async function runExecutable() {
    if (!canRun) {
      setStatusMessage(t("main.runner.pathRequired"));
      return;
    }

    setStatusMessage(t("main.runner.starting"));
    const runExecutablePath = executable_path_for_wine_prefix(executablePath.trim(), manualPrefixPath);
    const appId = isInstallerMode
      ? undefined
      : manual_app_id_from_executable_path(manualPrefixPath, runExecutablePath);
    const result = await (
      window.BTIH_API?.invoke(
        IPC_CHANNELS.BOTTLE.RUN_EXECUTABLE.channelName,
        {
          bottleId: bottle.id,
          bottleName: bottle.name,
          bottlePath: manualPrefixPath,
          wineVersionId: bottle.wineVersionId,
          wineRuntimePath,
          dxmtVersionId: bottle.dxmtVersionId,
          dxmtPackagePath,
          launcherOptionsManifest,
          appId,
          appName: app_name_from_executable_path(runExecutablePath),
          executablePath: runExecutablePath,
          launchOptions,
          executionMode: isInstallerMode ? "installer" : "app",
        },
      ) ?? Promise.resolve(undefined)
    ).catch((error) => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));

    if (result?.ok) {
      setStatusMessage(t(isInstallerMode ? "main.runner.installerStarted" : "main.runner.started"));
      if (!isInstallerMode) {
        onRegisterBottleExecutable?.(bottle.id, executablePath.trim(), manualPrefixPath, launchOptions);
      }
      onStarted?.();
      return;
    }

    setStatusMessage(result?.error || t("main.runner.failed"));
  }

  function registerExecutable() {
    if (!canRun) {
      setStatusMessage(t("main.runner.pathRequired"));
      return false;
    }

    if (!onRegisterBottleExecutable) {
      setStatusMessage(t("main.runner.failed"));
      return false;
    }

    onRegisterBottleExecutable?.(
      bottle.id,
      executable_path_for_wine_prefix(executablePath.trim(), manualPrefixPath),
      manualPrefixPath,
      launchOptions,
    );
    setStatusMessage(t("main.runner.registered"));
    return true;
  }

  function isCustomPrefixNameAvailable(name: string): boolean {
    const normalizedName = name.trim().toLowerCase();

    return normalizedName.length > 0
      && !prefixOptions.some((prefix) => prefix.name.trim().toLowerCase() === normalizedName);
  }

  function addCustomPrefix(requestedName?: string): boolean {
    if (!onUpdateBottlePrefixes) {
      setStatusMessage(t("main.runner.prefixUpdateUnavailable"));
      return false;
    }

    const existingPrefixes = bottle.prefixes ?? [];
    const name = requestedName?.trim() || suggestedCustomPrefixName;

    if (!isCustomPrefixNameAvailable(name)) {
      setStatusMessage(t("main.runner.prefixNameDuplicate", { name }));
      return false;
    }

    const slug = create_unique_custom_prefix_slug(name, existingPrefixes);
    const now = new Date().toISOString();
    const existingIds = new Set(existingPrefixes.map((prefix) => prefix.id));
    const id = existingIds.has(`custom:${slug}`) ? `custom:${slug}-${Date.now().toString(36)}` : `custom:${slug}`;
    const prefix: BottlePrefixMetadataPayload = {
      id,
      name,
      path: `${bottle.path.trim().replace(/\/+$/, "")}/custom-prefixes/${slug}`,
      kind: "custom",
      createdAt: now,
      updatedAt: now,
    };

    onUpdateBottlePrefixes(bottle.id, [...existingPrefixes, prefix]);
    setSelectedPrefixId(prefix.id);
    setStatusMessage(t("main.runner.prefixAdded", { name: prefix.name }));
    return true;
  }

  async function deletePrefix(prefix: DirectExecutablePrefixOption) {
    if (!onDeleteBottlePrefix) {
      setStatusMessage(t("main.runner.prefixUpdateUnavailable"));
      return;
    }

    const confirmMessage = prefix.kind === "custom"
      ? t("main.runner.prefixDeleteConfirm", { name: prefix.name })
      : t("main.runner.prefixResetConfirm", { name: prefix.name });
    const affectedAppsMessage = format_prefix_affected_apps_message(
      bottle.apps
        .filter((app) => prefix_paths_equal(create_bottle_app_prefix_path(bottle.path, app), prefix.path))
        .map((app) => app.name),
      t,
    );

    if (!window.confirm(affectedAppsMessage ? `${confirmMessage}\n\n${affectedAppsMessage}` : confirmMessage)) {
      return;
    }

    await onDeleteBottlePrefix(bottle.id, prefix);

    if (selectedPrefixId === prefix.id) {
      setSelectedPrefixId("preset:default");
    }

    setStatusMessage(prefix.kind === "custom"
      ? t("main.runner.prefixDeleted")
      : t("main.runner.prefixReset"));
  }

  async function handlePathKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape" && (isPathSuggestionOpen || isAutocompleteActive)) {
      event.preventDefault();
      event.stopPropagation();
      closePathSuggestions();
      return;
    }

    const action = resolve_direct_executable_autocomplete_action({
      key: event.key,
      shiftKey: event.shiftKey,
      executablePath,
      pathSuggestions,
      selectedSuggestionIndex,
      isPathSuggestionOpen,
    });

    if (action.kind === "none") {
      return;
    }

    if (action.kind === "focus-arguments") {
      hidePathSuggestionsButKeepSession();
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (action.kind === "apply-suggestion") {
      applyPathSuggestion(action.suggestion);
      return;
    }

    if (action.kind === "request-suggestions") {
      await requestPathSuggestions(executablePath);
      return;
    }

    if (action.kind === "move-selection") {
      setSelectedSuggestionIndex((currentIndex) => {
        if (action.direction === "next") {
          return (currentIndex + 1) % pathSuggestions.length;
        }

        return (currentIndex - 1 + pathSuggestions.length) % pathSuggestions.length;
      });
      return;
    }

    if (action.kind === "run") {
      await runExecutable();
      return;
    }

    if (action.kind === "close") {
      closePathSuggestions();
    }
  }

  async function handleArgsKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    await runExecutable();
  }

  async function browseExecutable() {
    const result = await window.BTIH_API?.invoke(
      IPC_CHANNELS.APP.SELECT_FILE.channelName,
      {
        title: t("main.runner.selectFileTitle"),
        defaultPath: manualPrefixPath,
        filters: [
          { name: "Windows executables", extensions: ["exe", "msi", "bat", "cmd"] },
          { name: "All files", extensions: ["*"] },
        ],
      },
    );

    if (!result?.canceled && result?.path) {
      setExecutablePath(to_wine_z_path(result.path));
      setStatusMessage("");
      hidePathSuggestionsButKeepSession();
    }
  }

  return {
    bottle,
    launcherOptionsManifest,
    launchOptions,
    isInstallerMode,
    executablePath,
    executableArgs,
    statusMessage,
    canRun,
    prefixOptions,
    selectedPrefixId: selectedPrefix.id,
    selectedPrefixPath: selectedPrefix.path,
    pathSuggestions,
    isPathSuggestionOpen,
    selectedSuggestionIndex,
    isPathSuggesting,
    pathInputRef,
    argsInputRef,
    setExecutablePathFromInput,
    setExecutableArgs,
    setLaunchOptions,
    setInstallerMode,
    setSelectedPrefixId,
    suggestedCustomPrefixName,
    isCustomPrefixNameAvailable,
    addCustomPrefix,
    deletePrefix,
    selectPathSuggestion,
    closePathSuggestions,
    applyPathSuggestion,
    registerExecutable,
    browseExecutable,
    runExecutable,
    handlePathKeyDown,
    handleArgsKeyDown,
  };
}

function create_next_custom_prefix_name(
  prefixes: BottlePrefixMetadataPayload[],
  baseName: string,
): string {
  const trimmedBaseName = baseName.trim() || "new-prefix";
  const usedNames = new Set(prefixes.map((prefix) => prefix.name.trim().toLowerCase()));

  for (let index = 1; index < 1000; index += 1) {
    const candidateName = `${trimmedBaseName}${index}`;

    if (!usedNames.has(candidateName.toLowerCase())) {
      return candidateName;
    }
  }

  return `${trimmedBaseName}${Date.now().toString(36)}`;
}

function create_unique_custom_prefix_slug(
  name: string,
  prefixes: BottlePrefixMetadataPayload[],
): string {
  const baseSlug = bottle_name_to_slug(name);
  const usedSlugs = new Set(prefixes
    .filter((prefix) => prefix.kind === "custom")
    .flatMap((prefix) => [
      prefix.id.replace(/^custom:/, ""),
      prefix.path.split("/").filter(Boolean).pop() ?? "",
    ])
    .filter(Boolean));

  if (!usedSlugs.has(baseSlug)) {
    return baseSlug;
  }

  for (let index = 2; index < 1000; index += 1) {
    const candidateSlug = `${baseSlug}-${index}`;

    if (!usedSlugs.has(candidateSlug)) {
      return candidateSlug;
    }
  }

  return `${baseSlug}-${Date.now().toString(36)}`;
}

function format_prefix_affected_apps_message(
  appNames: string[],
  translate: (key: string, options?: Record<string, unknown>) => unknown,
): string {
  if (appNames.length === 0) {
    return "";
  }

  const listedApps = appNames.slice(0, 5).map((appName) => `- ${appName}`).join("\n");
  const remainingCount = appNames.length - 5;

  return [
    String(translate("main.runner.prefixAffectedApps", { count: appNames.length })),
    listedApps,
    remainingCount > 0 ? String(translate("main.runner.prefixAffectedAppsMore", { count: remainingCount })) : "",
  ].filter(Boolean).join("\n");
}

function prefix_paths_equal(leftPath: string, rightPath: string): boolean {
  return normalize_prefix_path_for_compare(leftPath) === normalize_prefix_path_for_compare(rightPath);
}

function normalize_prefix_path_for_compare(prefixPath: string): string {
  return prefixPath.trim().replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

function create_direct_executable_prefix_options(
  bottle: Bottle,
  translate: (key: string) => string,
): DirectExecutablePrefixOption[] {
  const presetOptions: DirectExecutablePrefixOption[] = [
    {
      id: "preset:default",
      name: translate("main.runner.prefixDefault"),
      path: create_default_wine_prefix_path(bottle.path),
      kind: "preset",
      presetId: "default",
      canDelete: false,
      canReset: true,
    },
    {
      id: "preset:steam",
      name: translate("main.runner.prefixSteam"),
      path: create_launcher_prefix_path(bottle.path, "steam"),
      kind: "preset",
      presetId: "steam",
      canDelete: false,
      canReset: true,
    },
    {
      id: "preset:hoyoplay",
      name: translate("main.runner.prefixHoyoplay"),
      path: create_launcher_prefix_path(bottle.path, "hoyoplay"),
      kind: "preset",
      presetId: "hoyoplay",
      canDelete: false,
      canReset: true,
    },
    {
      id: "preset:zzz",
      name: translate("main.runner.prefixZenless"),
      path: create_hoyo_game_prefix_path(bottle.path, "zzz"),
      kind: "preset",
      presetId: "zzz",
      canDelete: false,
      canReset: true,
    },
    {
      id: "preset:hsr",
      name: translate("main.runner.prefixStarRail"),
      path: create_hoyo_game_prefix_path(bottle.path, "hsr"),
      kind: "preset",
      presetId: "hsr",
      canDelete: false,
      canReset: true,
    },
    {
      id: "preset:genshin",
      name: translate("main.runner.prefixGenshin"),
      path: create_hoyo_game_prefix_path(bottle.path, "genshin"),
      kind: "preset",
      presetId: "genshin",
      canDelete: false,
      canReset: true,
    },
  ];
  const customOptions: DirectExecutablePrefixOption[] = (bottle.prefixes ?? [])
    .filter((prefix) => prefix.kind === "custom")
    .map((prefix) => ({
      ...prefix,
      canDelete: true,
      canReset: false,
    }));

  return [...presetOptions, ...customOptions];
}
