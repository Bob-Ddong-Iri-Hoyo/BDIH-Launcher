import React from "react";
import { useTranslation } from "react-i18next";
import {
  app_name_from_executable_path,
  split_executable_args,
  to_wine_z_path,
} from "../../Common/Util/ExecutablePath";
import { create_bottle_app_prefix_path } from "../../Common/Util/BottlePath";
import { IPC_CHANNELS } from "../../Common/Types/IPC";
import type { PathSuggestionItemPayload } from "../../Common/Types/IPC";
import type { Bottle } from "../Types/Bottle";
import {
  is_executable_path_target,
  resolve_direct_executable_autocomplete_action,
} from "../Logic/DirectExecutableAutocomplete";

export interface DirectExecutableRunnerController {
  executablePath: string;
  executableArgs: string;
  statusMessage: string;
  canRun: boolean;
  pathSuggestions: PathSuggestionItemPayload[];
  isPathSuggestionOpen: boolean;
  selectedSuggestionIndex: number;
  isPathSuggesting: boolean;
  pathInputRef: React.RefObject<HTMLInputElement | null>;
  argsInputRef: React.RefObject<HTMLInputElement | null>;
  setExecutablePathFromInput: (value: string) => void;
  setExecutableArgs: (value: string) => void;
  selectPathSuggestion?: (index: number) => void;
  closePathSuggestions: () => void;
  applyPathSuggestion: (suggestion: PathSuggestionItemPayload) => void;
  registerExecutable: () => boolean;
  browseExecutable: () => Promise<void>;
  runExecutable: () => Promise<void>;
  handlePathKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => Promise<void>;
  handleArgsKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => Promise<void>;
}

export function useDirectExecutableRunner({
  bottle,
  wineRuntimePath,
  dxmtPackagePath,
  onRegisterBottleExecutable,
  onStarted,
}: {
  bottle: Bottle;
  wineRuntimePath?: string;
  dxmtPackagePath?: string;
  onRegisterBottleExecutable?: (bottleId: string, executablePath: string) => void;
  onStarted?: () => void;
}): DirectExecutableRunnerController {
  const { t } = useTranslation();
  const [executablePath, setExecutablePath] = React.useState("");
  const [executableArgs, setExecutableArgs] = React.useState("");
  const [statusMessage, setStatusMessage] = React.useState("");
  const [pathSuggestions, setPathSuggestions] = React.useState<PathSuggestionItemPayload[]>([]);
  const [isPathSuggestionOpen, setIsPathSuggestionOpen] = React.useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = React.useState(0);
  const [isPathSuggesting, setIsPathSuggesting] = React.useState(false);
  const [isAutocompleteActive, setIsAutocompleteActive] = React.useState(false);
  const suggestionRequestIdRef = React.useRef(0);
  const pathInputRef = React.useRef<HTMLInputElement>(null);
  const argsInputRef = React.useRef<HTMLInputElement>(null);
  const canRun = executablePath.trim().length > 0;
  const manualPrefixPath = create_bottle_app_prefix_path(bottle.path, {
    id: "manual",
    name: "Manual executable",
    source: "manual",
    executablePath,
  });

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

    if (!wineRuntimePath) {
      setStatusMessage(t("main.runner.wineRuntimeMissing", { versionId: bottle.wineVersionId }));
      return;
    }

    setStatusMessage(t("main.runner.starting"));
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
          appName: app_name_from_executable_path(executablePath.trim()),
          executablePath: executablePath.trim(),
          executableArgs: split_executable_args(executableArgs),
        },
      ) ?? Promise.resolve(undefined)
    ).catch((error) => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));

    if (result?.ok) {
      setStatusMessage(t("main.runner.started"));
      onRegisterBottleExecutable?.(bottle.id, executablePath.trim());
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

    onRegisterBottleExecutable?.(bottle.id, executablePath.trim());
    setStatusMessage(t("main.runner.registered"));
    return true;
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

    event.preventDefault();
    event.stopPropagation();

    if (action.kind === "focus-arguments") {
      hidePathSuggestionsButKeepSession();
      argsInputRef.current?.focus();
      return;
    }

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
    executablePath,
    executableArgs,
    statusMessage,
    canRun,
    pathSuggestions,
    isPathSuggestionOpen,
    selectedSuggestionIndex,
    isPathSuggesting,
    pathInputRef,
    argsInputRef,
    setExecutablePathFromInput,
    setExecutableArgs,
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
