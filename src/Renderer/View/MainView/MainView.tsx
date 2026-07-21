import React from "react";
import { Copy, FileText, FolderOpen, Pencil, Settings, Square, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AppUpdateStatusPayload, BottleExecutionStatePayload, BottleLaunchOptionsPayload, BottleLauncherKind, BottlePrefixMetadataPayload, DebugFlagMode, DeleteLauncherDataResultPayload, LauncherDataDeleteTarget, LauncherLogLevel, LauncherShortcutAction, LauncherShortcutMap, LauncherWindowStartupSizeMode, RendererThemeMode } from "../../../Common/Types/IPC";
import { IPC_CHANNELS } from "../../../Common/Types/IPC";
import type { DxmtVersion, JadeiteVersion, WineVersion } from "../../../Common/Types/Wine";
import { BottleDetailPanel, CreateBottleDialog, DashboardBreadcrumb, DashboardHomePanel, is_bottle_running } from "../../Component/BottleDashboard";
import { ContextMenu, ContextMenuItem, ContextMenuPosition } from "../../Component/ContextMenu";
import { Dialog, DialogTone } from "../../Component/Dialog";
import { LaunchOptionsDialog } from "../../Component/LaunchOptionsDialog";
import { LogEntry, log_session_file_path, log_session_reveal_path, LogSession, LogSourceOption, LogViewer } from "../../Component/LogViewer";
import { MacTitleBar } from "../../Component/MacTitleBar";
import { MainFrame, RendererViewKey } from "../../Component/MainFrame";
import { Box, Input, InlineText, Textarea } from "../../Component/Primitives";
import { ViewSurface } from "../../Component/ViewSurface";
import { SupportedLocale } from "../../I18n";
import { AccentColor } from "../../Theme";
import type { Bottle, CreateBottleInput } from "../../Types/Bottle";
import { PreferenceView } from "../PreferenceView/PreferenceView";
import type { PreferencePathKey } from "../PreferenceView/PreferenceView";
import LogoSquare from "../../../../resouces/app/icon/icon.png";

export type { Bottle, CreateBottleInput, InstalledApp } from "../../Types/Bottle";

export interface DashboardViewProps {
  wineVersions: WineVersion[];
  dxmtVersions?: DxmtVersion[];
  jadeiteVersions?: JadeiteVersion[];
  selectedWineVersion?: WineVersion;
  selectedWineVersionId: string;
  selectedDxmtVersionId?: string;
  selectedJadeiteVersionId?: string;
  installPath: string;
  bottlePrefixPath?: string;
  isLoadingWineVersions: boolean;
  isLoadingDxmtVersions?: boolean;
  isLoadingJadeiteVersions?: boolean;
  bottles?: Bottle[];
  selectedBottleId?: string;
  onSelectBottle?: (bottleId: string) => void;
  onBottleHome?: () => void;
  onCreateBottle?: (input: CreateBottleInput) => void;
  onReorderBottles?: (orderedBottleIds: string[]) => Promise<void> | void;
  onRenameBottle?: (bottleId: string, name: string) => void;
  onChangeBottleDescription?: (bottleId: string, description: string) => void;
  onRevealBottle?: (path: string) => void;
  onStopBottle?: (bottleId: string) => Promise<void> | void;
  onDeleteBottle?: (bottleId: string) => Promise<void> | void;
  onClearBottleDxmtShaderCaches?: (bottleId: string, prefixPaths?: string[]) => Promise<DeleteLauncherDataResultPayload | undefined>;
  onSelectBottlePrefixPath?: (currentPath: string) => Promise<string | undefined>;
  onDownloadBottleLauncherInstaller?: (bottleId: string, launcher: BottleLauncherKind) => void;
  onInstallBottleLauncher?: (bottleId: string, launcher: BottleLauncherKind) => void;
  onInstallBottleLauncherExecutable?: (bottleId: string, launcher: BottleLauncherKind) => void;
  onLaunchBottleApp?: (bottleId: string, appId: string) => void;
  onStopBottleApp?: (bottleId: string, appId: string) => void;
  onDeleteBottleApp?: (bottleId: string, appId: string) => void;
  onDeleteBottleAppFiles?: (bottleId: string, appId: string) => void;
  onReorderBottleApps?: (bottleId: string, orderedAppIds: string[]) => Promise<void> | void;
  onRegisterBottleExecutable?: (bottleId: string, executablePath: string, prefixPath: string, launchOptions?: BottleLaunchOptionsPayload) => void;
  onUpdateBottlePrefixes?: (bottleId: string, prefixes: BottlePrefixMetadataPayload[]) => void;
  onDeleteBottlePrefix?: (bottleId: string, prefix: BottlePrefixMetadataPayload) => Promise<void> | void;
  onChangeBottleAppLaunchOptions?: (bottleId: string, appId: string, launchOptions: BottleLaunchOptionsPayload) => void;
  onChangeBottleRecipe?: (bottleId: string, patch: Partial<Pick<Bottle, "wineVersionId" | "dxmtVersionId" | "jadeiteVersionId">>) => void;
  onApplyBottleRecipe?: (
    bottleId: string,
    patch: Partial<Pick<Bottle, "wineVersionId" | "dxmtVersionId" | "jadeiteVersionId">>,
    reportProgress: (update: { progress: number; message: string }) => void,
  ) => Promise<void> | void;
  onSelectWineVersion: (versionId: string) => void;
  onInstallWineVersion: (versionId: string) => void;
  onDeleteWineVersion?: (versionId: string) => void;
  onSelectDxmtVersion?: (versionId: string) => void;
  onInstallDxmtVersion?: (versionId: string) => void;
  onDeleteDxmtVersion?: (versionId: string) => void;
  onSelectJadeiteVersion?: (versionId: string) => void;
  onInstallJadeiteVersion?: (versionId: string) => void;
  onDeleteJadeiteVersion?: (versionId: string) => void;
}

export interface LauncherViewProps extends DashboardViewProps {
  activeView: RendererViewKey;
  onViewChange: (viewKey: RendererViewKey) => void;
  onQuit: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  isMac?: boolean;
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
  hasUnsavedPreferenceChanges?: boolean;
  windowStartupSizeMode?: LauncherWindowStartupSizeMode;
  windowStartupCustomWidth?: number;
  windowStartupCustomHeight?: number;
  appUpdateStatus?: AppUpdateStatusPayload;
  dataRootPath?: string;
  bottlePrefixPath?: string;
  dxmtCachePath?: string;
  gameInstallPath?: string;
  isDeveloperOnAir?: boolean;
  logEntries?: LogEntry[];
  logSessions?: LogSession[];
  logSources?: LogSourceOption[];
  onOpenLogFolder?: () => void;
  onOpenLogFile?: (path?: string) => void;
  onRevealLogFile?: (path?: string) => void;
  onDataRootPathChange?: (dataRootPath: string) => void;
  onInstallPathChange: (installPath: string) => void;
  onBottlePrefixPathChange?: (bottlePrefixPath: string) => void;
  onDxmtCachePathChange?: (dxmtCachePath: string) => void;
  onGameInstallPathChange?: (gameInstallPath: string) => void;
  onLocaleChange: (locale: SupportedLocale) => void;
  onAccentColorChange: (accentColor: AccentColor) => void;
  onThemeModeChange?: (themeMode: RendererThemeMode) => void;
  onAppLoggingLevelChange?: (appLoggingLevel: LauncherLogLevel) => void;
  onDebugFlagModeChange?: (debugFlagMode: DebugFlagMode) => void;
  onLoggingLevelChange?: (loggingLevel: LauncherLogLevel) => void;
  onWineDebugArgsChange?: (wineDebugArgs: string) => void;
  onShortcutChange?: (action: LauncherShortcutAction, shortcut: string) => void;
  onAutoUpdateEnabledChange?: (enabled: boolean) => void;
  onCloseToTrayChange?: (enabled: boolean) => void;
  onWindowStartupSizeModeChange?: (mode: LauncherWindowStartupSizeMode) => void;
  onWindowStartupCustomWidthChange?: (width: number) => void;
  onWindowStartupCustomHeightChange?: (height: number) => void;
  onCheckForUpdates?: () => void;
  onInstallUpdate?: () => void;
  onBrowsePath?: (pathKey: PreferencePathKey) => void;
  onResetPath?: (pathKey: PreferencePathKey) => void;
  onDeleteLauncherData?: (targets: LauncherDataDeleteTarget[]) => Promise<DeleteLauncherDataResultPayload | undefined> | DeleteLauncherDataResultPayload | undefined;
  onSavePreference?: () => void;
}

function get_view_title(viewKey: RendererViewKey, translate: (key: string) => string) {
  return translate(`navigation.${viewKey}.label`);
}

function get_view_subtitle(viewKey: RendererViewKey, translate: (key: string) => string) {
  return translate(`navigation.${viewKey}.subtitle`);
}

export function DashboardView({
  wineVersions,
  dxmtVersions = [],
  jadeiteVersions = [],
  selectedWineVersion,
  selectedWineVersionId,
  selectedDxmtVersionId = "",
  selectedJadeiteVersionId = "",
  installPath,
  bottlePrefixPath = "",
  isLoadingWineVersions,
  isLoadingDxmtVersions = false,
  isLoadingJadeiteVersions = false,
  bottles = [],
  selectedBottleId,
  onSelectBottle,
  onBottleHome,
  onCreateBottle,
  onReorderBottles,
  onRenameBottle,
  onChangeBottleDescription,
  onRevealBottle,
  onStopBottle,
  onDeleteBottle,
  onClearBottleDxmtShaderCaches,
  onSelectBottlePrefixPath,
  onDownloadBottleLauncherInstaller,
  onInstallBottleLauncher,
  onInstallBottleLauncherExecutable,
  onLaunchBottleApp,
  onStopBottleApp,
  onDeleteBottleApp,
  onDeleteBottleAppFiles,
  onReorderBottleApps,
  onRegisterBottleExecutable,
  onUpdateBottlePrefixes,
  onDeleteBottlePrefix,
  onChangeBottleAppLaunchOptions,
  onChangeBottleRecipe,
  onApplyBottleRecipe,
  onSelectWineVersion,
  onInstallWineVersion,
  onDeleteWineVersion,
  onSelectDxmtVersion,
  onInstallDxmtVersion,
  onDeleteDxmtVersion,
  onSelectJadeiteVersion,
  onInstallJadeiteVersion,
  onDeleteJadeiteVersion,
}: DashboardViewProps) {
  const { t } = useTranslation();
  const [isInstalledWineOpen, setIsInstalledWineOpen] = React.useState(false);
  const [isCreateBottleOpen, setIsCreateBottleOpen] = React.useState(false);
  const [contextMenuState, setContextMenuState] = React.useState<{
    position: ContextMenuPosition;
    bottleId: string;
  } | null>(null);
  const [renameDraft, setRenameDraft] = React.useState<{
    bottleId: string;
    name: string;
  } | null>(null);
  const [descriptionDraft, setDescriptionDraft] = React.useState<{
    bottleId: string;
    description: string;
  } | null>(null);
  const [deleteBottleId, setDeleteBottleId] = React.useState<string | null>(null);
  const [deleteBottleWasRunning, setDeleteBottleWasRunning] = React.useState(false);
  const [stopBottleId, setStopBottleId] = React.useState<string | null>(null);
  const [isStoppingBottle, setIsStoppingBottle] = React.useState(false);
  const [launchOptionsBottleId, setLaunchOptionsBottleId] = React.useState<string | null>(null);
  const [noticeDialog, setNoticeDialog] = React.useState<{
    title: string;
    description: string;
    tone: DialogTone;
  } | null>(null);
  const selectedBottle = React.useMemo(
    () => bottles.find((bottle) => bottle.id === selectedBottleId),
    [bottles, selectedBottleId],
  );
  const contextBottle = React.useMemo(
    () => bottles.find((bottle) => bottle.id === contextMenuState?.bottleId),
    [bottles, contextMenuState?.bottleId],
  );
  const launchOptionsBottle = React.useMemo(
    () => bottles.find((bottle) => bottle.id === launchOptionsBottleId),
    [bottles, launchOptionsBottleId],
  );
  const launchOptionsManifest = React.useMemo(
    () => wineVersions.find((version) => version.id === launchOptionsBottle?.wineVersionId)?.launcherOptionsManifest,
    [launchOptionsBottle?.wineVersionId, wineVersions],
  );

  React.useEffect(() => {
    if (launchOptionsBottleId && !launchOptionsBottle) {
      setLaunchOptionsBottleId(null);
    }
  }, [launchOptionsBottle, launchOptionsBottleId]);

  const bottleContextMenuItems = React.useMemo<ContextMenuItem[]>(() => {
    if (!contextBottle) {
      return [];
    }

    return [
      {
        id: "open",
        label: t("main.contextMenu.openBottle"),
        icon: FolderOpen,
        iconTone: "success",
        onSelect: () => onSelectBottle?.(contextBottle.id),
      },
      {
        id: "launch-options",
        label: t("main.contextMenu.launchOptions"),
        icon: Settings,
        iconTone: "violet",
        onSelect: () => setLaunchOptionsBottleId(contextBottle.id),
      },
      ...(is_bottle_running(contextBottle)
        ? [
            {
              id: "stop-bottle",
              label: t("main.contextMenu.stopBottle"),
              icon: Square,
              trailingIcon: Square,
              iconTone: "danger",
              iconFill: true,
              danger: true,
              disabled: !onStopBottle,
              onSelect: () => setStopBottleId(contextBottle.id),
            } satisfies ContextMenuItem,
          ]
        : []),
      {
        id: "edit-bottle-info",
        label: t("main.contextMenu.editBottleInfo"),
        icon: Pencil,
        iconTone: "info",
        children: [
          {
            id: "rename",
            label: t("main.contextMenu.rename"),
            icon: Pencil,
            iconTone: "info",
            onSelect: () => open_rename_bottle(contextBottle),
          },
          {
            id: "edit-description",
            label: t("main.contextMenu.editDescription"),
            icon: FileText,
            iconTone: "default",
            onSelect: () => open_edit_bottle_description(contextBottle),
          },
        ],
      },
      {
        id: "copy-path",
        label: t("main.contextMenu.copyPath"),
        icon: Copy,
        iconTone: "default",
        onSelect: () => void navigator.clipboard?.writeText(contextBottle.path),
      },
      {
        id: "reveal",
        label: t("main.contextMenu.revealFolder"),
        icon: FolderOpen,
        iconTone: "info",
        onSelect: () => onRevealBottle?.(contextBottle.path),
      },
      {
        id: "delete",
        label: t("main.contextMenu.deleteBottle"),
        icon: Trash2,
        danger: true,
        separatorBefore: true,
        onSelect: () => void open_delete_bottle_dialog(contextBottle),
      },
      {
        id: "clear-dxmt-shader-cache",
        label: t("main.advancedSettings.clearAllAction"),
        icon: Trash2,
        danger: true,
        onSelect: () => {
          if (is_bottle_running(contextBottle)) {
            window.alert(t("main.advancedSettings.runningWarning"));
            return;
          }
          if (!window.confirm(t("main.advancedSettings.clearAllConfirm", { name: contextBottle.name }))) return;

          const clearRequest = onClearBottleDxmtShaderCaches?.(contextBottle.id);
          if (clearRequest) {
            void clearRequest.then((result) => {
              window.alert(t(result && result.failedPaths.length === 0 ? "main.advancedSettings.clearComplete" : "main.advancedSettings.clearFailed"));
            });
          }
        },
      },
    ];
  }, [contextBottle, onClearBottleDxmtShaderCaches, onDeleteBottle, onRevealBottle, onSelectBottle, onStopBottle, t]);

  const renameBottle = React.useMemo(
    () => bottles.find((bottle) => bottle.id === renameDraft?.bottleId),
    [bottles, renameDraft?.bottleId],
  );
  const normalizedRenameDraft = renameDraft?.name.trim() ?? "";
  const canSubmitRename = Boolean(renameDraft && normalizedRenameDraft.length > 0);
  const descriptionBottle = React.useMemo(
    () => bottles.find((bottle) => bottle.id === descriptionDraft?.bottleId),
    [bottles, descriptionDraft?.bottleId],
  );
  const deleteBottle = React.useMemo(
    () => bottles.find((bottle) => bottle.id === deleteBottleId),
    [bottles, deleteBottleId],
  );
  const stopBottle = React.useMemo(
    () => bottles.find((bottle) => bottle.id === stopBottleId),
    [bottles, stopBottleId],
  );
  const isDeleteBottleRunning = deleteBottleWasRunning || Boolean(deleteBottle && is_bottle_running(deleteBottle));
  const normalizedDescriptionDraft = descriptionDraft?.description.trim() ?? "";
  const canSubmitDescription = Boolean(
    descriptionDraft
    && descriptionBottle
    && normalizedDescriptionDraft !== (descriptionBottle.description ?? "").trim(),
  );

  function show_running_rename_notice(bottle: { name: string }) {
    setNoticeDialog({
      title: t("main.renameBottle.runningTitle"),
      description: t("main.renameBottle.runningDescription", { name: bottle.name }),
      tone: "warning",
    });
  }

  function open_rename_bottle(bottle: Bottle) {
    if (is_bottle_running(bottle)) {
      show_running_rename_notice(bottle);
      return;
    }

    setRenameDraft({
      bottleId: bottle.id,
      name: bottle.name,
    });
  }

  function submit_rename_bottle() {
    if (!renameDraft || !renameBottle || !canSubmitRename) {
      return;
    }

    if (is_bottle_running(renameBottle)) {
      setRenameDraft(null);
      show_running_rename_notice(renameBottle);
      return;
    }

    const normalizedNextName = normalizedRenameDraft.toLowerCase();
    const duplicateBottle = bottles.find((bottle) =>
      bottle.id !== renameDraft.bottleId &&
      bottle.name.trim().toLowerCase() === normalizedNextName,
    );

    if (duplicateBottle) {
      setNoticeDialog({
        title: t("main.renameBottle.duplicateTitle"),
        description: t("main.renameBottle.duplicateDescription", { name: normalizedRenameDraft }),
        tone: "warning",
      });
      return;
    }

    if (renameBottle.name.trim() !== normalizedRenameDraft) {
      onRenameBottle?.(renameDraft.bottleId, normalizedRenameDraft);
    }

    setRenameDraft(null);
    setNoticeDialog({
      title: t("main.renameBottle.successTitle"),
      description: t("main.renameBottle.successDescription", { name: normalizedRenameDraft }),
      tone: "success",
    });
  }

  function open_edit_bottle_description(bottle: Bottle) {
    setDescriptionDraft({
      bottleId: bottle.id,
      description: bottle.description ?? "",
    });
  }

  function submit_bottle_description() {
    if (!descriptionDraft || !descriptionBottle || !canSubmitDescription) {
      return;
    }

    onChangeBottleDescription?.(descriptionDraft.bottleId, normalizedDescriptionDraft);
    setDescriptionDraft(null);
    setNoticeDialog({
      title: t("main.editBottleDescription.successTitle"),
      description: t("main.editBottleDescription.successDescription", { name: descriptionBottle.name }),
      tone: "success",
    });
  }

  function confirm_delete_bottle() {
    if (!deleteBottle) {
      setDeleteBottleId(null);
      return;
    }

    const bottleId = deleteBottle.id;
    setDeleteBottleId(null);
    void onDeleteBottle?.(bottleId);
  }

  async function open_delete_bottle_dialog(bottle: Bottle) {
    let isRunning = is_bottle_running(bottle);

    try {
      const executionState = await window.BTIH_API?.invoke(
        IPC_CHANNELS.BOTTLE.GET_EXECUTION_STATE.channelName,
        { bottleId: bottle.id },
      ) as BottleExecutionStatePayload | undefined;
      isRunning ||= Boolean(executionState?.isRunning);
    } catch (error) {
      console.warn("Failed to check Bottle execution state before deletion:", error);
    }

    setDeleteBottleWasRunning(isRunning);
    setDeleteBottleId(bottle.id);
  }

  async function confirm_stop_bottle() {
    if (!stopBottle || !onStopBottle || isStoppingBottle) {
      return;
    }

    setIsStoppingBottle(true);

    try {
      await onStopBottle(stopBottle.id);
      setStopBottleId(null);
      setNoticeDialog({
        title: t("main.stopBottle.successTitle"),
        description: t("main.stopBottle.successDescription", { name: stopBottle.name }),
        tone: "success",
      });
    } catch (error) {
      setNoticeDialog({
        title: t("main.stopBottle.errorTitle"),
        description: t("main.stopBottle.errorDescription", {
          error: error instanceof Error ? error.message : String(error),
        }),
        tone: "danger",
      });
      setStopBottleId(null);
    } finally {
      setIsStoppingBottle(false);
    }
  }

  function handle_bottle_context_menu(event: React.MouseEvent<HTMLButtonElement>, bottle: Bottle) {
    event.preventDefault();
    setContextMenuState({
      bottleId: bottle.id,
      position: { x: event.clientX, y: event.clientY },
    });
  }

  function open_create_bottle_dialog() {
    setIsCreateBottleOpen(true);
  }

  if (selectedBottle) {
    const selectedBottleWineRuntimePath = wineVersions.find((version) => version.id === selectedBottle.wineVersionId)?.path;

    return (
      <BottleDetailPanel
        bottle={selectedBottle}
        selectedWineVersionId={selectedBottle.wineVersionId}
        wineVersions={wineVersions}
        dxmtVersions={dxmtVersions}
        jadeiteVersions={jadeiteVersions}
        wineRuntimePath={selectedBottleWineRuntimePath}
        appLogoSrc={LogoSquare}
        onRevealBottle={onRevealBottle}
        onDownloadBottleLauncherInstaller={onDownloadBottleLauncherInstaller}
        onInstallBottleLauncher={onInstallBottleLauncher}
        onInstallBottleLauncherExecutable={onInstallBottleLauncherExecutable}
        onLaunchBottleApp={onLaunchBottleApp}
        onStopBottleApp={onStopBottleApp}
        onDeleteBottleApp={onDeleteBottleApp}
        onDeleteBottleAppFiles={onDeleteBottleAppFiles}
        onReorderBottleApps={onReorderBottleApps}
        onRegisterBottleExecutable={onRegisterBottleExecutable}
        onUpdateBottlePrefixes={onUpdateBottlePrefixes}
        onDeleteBottlePrefix={onDeleteBottlePrefix}
        onClearBottleDxmtShaderCaches={onClearBottleDxmtShaderCaches}
        onChangeBottleAppLaunchOptions={onChangeBottleAppLaunchOptions}
        onChangeBottleRecipe={onChangeBottleRecipe}
        onApplyBottleRecipe={onApplyBottleRecipe}
        onInstallWineVersion={onInstallWineVersion}
        onInstallDxmtVersion={onInstallDxmtVersion}
        onInstallJadeiteVersion={onInstallJadeiteVersion}
      />
    );
  }

  return (
    <>
      <DashboardHomePanel
        wineVersions={wineVersions}
        dxmtVersions={dxmtVersions}
        jadeiteVersions={jadeiteVersions}
        selectedWineVersionId={selectedWineVersionId}
        selectedDxmtVersionId={selectedDxmtVersionId}
        selectedJadeiteVersionId={selectedJadeiteVersionId}
        installPath={installPath}
        isLoadingWineVersions={isLoadingWineVersions}
        isLoadingDxmtVersions={isLoadingDxmtVersions}
        isLoadingJadeiteVersions={isLoadingJadeiteVersions}
        bottles={bottles}
        isInstalledWineOpen={isInstalledWineOpen}
        onToggleInstalledWine={() => setIsInstalledWineOpen((isOpen) => !isOpen)}
        onSelectWineVersion={onSelectWineVersion}
        onInstallWineVersion={onInstallWineVersion}
        onDeleteWineVersion={onDeleteWineVersion}
        onSelectDxmtVersion={onSelectDxmtVersion}
        onInstallDxmtVersion={onInstallDxmtVersion}
        onDeleteDxmtVersion={onDeleteDxmtVersion}
        onSelectJadeiteVersion={onSelectJadeiteVersion}
        onInstallJadeiteVersion={onInstallJadeiteVersion}
        onDeleteJadeiteVersion={onDeleteJadeiteVersion}
        onSelectBottle={onSelectBottle}
        onBottleContextMenu={handle_bottle_context_menu}
        onReorderBottles={onReorderBottles}
        onCreateBottle={open_create_bottle_dialog}
      />
      <ContextMenu
        open={Boolean(contextMenuState && contextBottle)}
        position={contextMenuState?.position}
        items={bottleContextMenuItems}
        onClose={() => setContextMenuState(null)}
      />
      <LaunchOptionsDialog
        open={Boolean(launchOptionsBottleId)}
        bottle={launchOptionsBottle}
        launcherOptionsManifest={launchOptionsManifest}
        onClose={() => setLaunchOptionsBottleId(null)}
        onSave={onChangeBottleAppLaunchOptions}
      />
      <Dialog
        open={Boolean(stopBottleId && stopBottle)}
        title={t("main.stopBottle.title", { name: stopBottle?.name ?? "" })}
        description={t("main.stopBottle.description")}
        tone="warning"
        icon={Square}
        placement="center"
        onClose={() => {
          if (!isStoppingBottle) {
            setStopBottleId(null);
          }
        }}
        actions={[
          {
            label: t("common.actions.cancel"),
            variant: "secondary",
            disabled: isStoppingBottle,
            onClick: () => setStopBottleId(null),
          },
          {
            label: t(isStoppingBottle ? "main.stopBottle.stopping" : "main.stopBottle.confirm"),
            variant: "danger",
            disabled: isStoppingBottle,
            onClick: () => void confirm_stop_bottle(),
          },
        ]}
      />
      <Dialog
        open={Boolean(deleteBottleId && deleteBottle)}
        title={t(isDeleteBottleRunning
          ? "main.contextMenu.deleteRunningBottleTitle"
          : "main.contextMenu.deleteBottleTitle", { name: deleteBottle?.name ?? "" })}
        description={t(isDeleteBottleRunning
          ? "main.contextMenu.deleteRunningBottleDescription"
          : "main.contextMenu.deleteBottleDescription", { name: deleteBottle?.name ?? "" })}
        tone="danger"
        icon={Trash2}
        placement="center"
        onClose={() => setDeleteBottleId(null)}
        actions={[
          {
            label: t("common.actions.cancel"),
            variant: "secondary",
            onClick: () => setDeleteBottleId(null),
          },
          {
            label: t(isDeleteBottleRunning
              ? "main.contextMenu.stopAndDeleteBottle"
              : "main.contextMenu.deleteBottleAction"),
            variant: "danger",
            onClick: confirm_delete_bottle,
          },
        ]}
      />
      <Dialog
        open={Boolean(renameDraft && renameBottle)}
        title={t("main.renameBottle.title")}
        description={t("main.renameBottle.description", { name: renameBottle?.name ?? "" })}
        tone="info"
        icon={Pencil}
        placement="center"
        onClose={() => setRenameDraft(null)}
        actions={[
          {
            label: t("common.actions.cancel"),
            variant: "secondary",
            onClick: () => setRenameDraft(null),
          },
          {
            label: t("common.actions.apply"),
            variant: "primary",
            disabled: !canSubmitRename,
            onClick: submit_rename_bottle,
          },
        ]}
      >
        <Box as="label" className="grid gap-2">
          <InlineText className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t("main.renameBottle.nameLabel")}
          </InlineText>
          <Input
            value={renameDraft?.name ?? ""}
            onChange={(event) => setRenameDraft((currentDraft) =>
              currentDraft ? { ...currentDraft, name: event.target.value } : currentDraft,
            )}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submit_rename_bottle();
              }
            }}
            placeholder={renameBottle?.name}
            autoFocus
          />
        </Box>
      </Dialog>
      <Dialog
        open={Boolean(descriptionDraft && descriptionBottle)}
        title={t("main.editBottleDescription.title")}
        description={t("main.editBottleDescription.description", { name: descriptionBottle?.name ?? "" })}
        tone="info"
        icon={Pencil}
        placement="center"
        onClose={() => setDescriptionDraft(null)}
        actions={[
          {
            label: t("common.actions.cancel"),
            variant: "secondary",
            onClick: () => setDescriptionDraft(null),
          },
          {
            label: t("common.actions.apply"),
            variant: "primary",
            disabled: !canSubmitDescription,
            onClick: submit_bottle_description,
          },
        ]}
      >
        <Box as="label" className="grid gap-2">
          <InlineText className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t("main.editBottleDescription.descriptionLabel")}
          </InlineText>
          <Textarea
            value={descriptionDraft?.description ?? ""}
            onChange={(event) => setDescriptionDraft((currentDraft) =>
              currentDraft ? { ...currentDraft, description: event.target.value } : currentDraft,
            )}
            placeholder={t("main.editBottleDescription.placeholder")}
            maxLength={500}
            rows={4}
            autoFocus
            className="min-h-28 w-full resize-y rounded-lg border border-white/10 bg-[#0b1020] px-3 py-2 text-sm leading-6 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-[rgb(var(--accent-rgb)/0.55)]"
          />
        </Box>
      </Dialog>
      <Dialog
        open={Boolean(noticeDialog)}
        title={noticeDialog?.title ?? ""}
        description={noticeDialog?.description}
        tone={noticeDialog?.tone ?? "info"}
        placement="center"
        onClose={() => setNoticeDialog(null)}
        actions={[
          {
            label: t("common.actions.close"),
            variant: "primary",
            autoFocus: true,
            onClick: () => setNoticeDialog(null),
          },
        ]}
      />
      <CreateBottleDialog
        open={isCreateBottleOpen}
        wineVersions={wineVersions}
        dxmtVersions={dxmtVersions}
        jadeiteVersions={jadeiteVersions}
        selectedWineVersionId={selectedWineVersionId}
        selectedDxmtVersionId={selectedDxmtVersionId}
        selectedJadeiteVersionId={selectedJadeiteVersionId}
        bottlePrefixPath={bottlePrefixPath}
        existingBottleNames={bottles.map((bottle) => bottle.name)}
        onSelectBottlePrefixPath={onSelectBottlePrefixPath}
        onClose={() => setIsCreateBottleOpen(false)}
        onCreateBottle={onCreateBottle}
        onInstallWineVersion={onInstallWineVersion}
        onInstallDxmtVersion={onInstallDxmtVersion}
        onInstallJadeiteVersion={onInstallJadeiteVersion}
      />
    </>
  );
}

export function LauncherView({
  activeView,
  wineVersions,
  dxmtVersions,
  jadeiteVersions,
  selectedWineVersion,
  selectedWineVersionId,
  selectedDxmtVersionId,
  selectedJadeiteVersionId,
  installPath,
  isLoadingWineVersions,
  isLoadingDxmtVersions,
  isLoadingJadeiteVersions,
  bottles,
  onViewChange,
  onQuit,
  onMinimize,
  onMaximize,
  isMac = false,
  locale,
  accentColor,
  themeMode,
  appLoggingLevel,
  debugFlagMode,
  loggingLevel,
  wineDebugArgs,
  shortcuts,
  autoUpdateEnabled,
  closeToTray,
  hasUnsavedPreferenceChanges = false,
  windowStartupSizeMode,
  windowStartupCustomWidth,
  windowStartupCustomHeight,
  appUpdateStatus,
  dataRootPath,
  bottlePrefixPath,
  dxmtCachePath,
  gameInstallPath,
  isDeveloperOnAir,
  logEntries = [],
  logSessions = [],
  logSources = [],
  onOpenLogFolder,
  onOpenLogFile,
  onRevealLogFile,
  onCreateBottle,
  onReorderBottles,
  onRenameBottle,
  onChangeBottleDescription,
  onRevealBottle,
  onStopBottle,
  onDeleteBottle,
  onClearBottleDxmtShaderCaches,
  onSelectBottlePrefixPath,
  onDownloadBottleLauncherInstaller,
  onInstallBottleLauncher,
  onInstallBottleLauncherExecutable,
  onLaunchBottleApp,
  onStopBottleApp,
  onDeleteBottleApp,
  onDeleteBottleAppFiles,
  onReorderBottleApps,
  onRegisterBottleExecutable,
  onUpdateBottlePrefixes,
  onDeleteBottlePrefix,
  onChangeBottleAppLaunchOptions,
  onChangeBottleRecipe,
  onApplyBottleRecipe,
  onSelectWineVersion,
  onInstallWineVersion,
  onDeleteWineVersion,
  onSelectDxmtVersion,
  onInstallDxmtVersion,
  onDeleteDxmtVersion,
  onSelectJadeiteVersion,
  onInstallJadeiteVersion,
  onDeleteJadeiteVersion,
  onDataRootPathChange,
  onInstallPathChange,
  onBottlePrefixPathChange,
  onDxmtCachePathChange,
  onGameInstallPathChange,
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
  onWindowStartupSizeModeChange,
  onWindowStartupCustomWidthChange,
  onWindowStartupCustomHeightChange,
  onCheckForUpdates,
  onInstallUpdate,
  onBrowsePath,
  onResetPath,
  onDeleteLauncherData,
  onSavePreference,
}: LauncherViewProps) {
  const { t } = useTranslation();
  const [selectedBottleId, setSelectedBottleId] = React.useState<string | undefined>();
  const activeBottles = bottles ?? [];
  const selectedBottle = activeBottles.find((bottle) => bottle.id === selectedBottleId);
  const title =
    activeView === "dashboard" ? (
      <DashboardBreadcrumb
        bottleName={selectedBottle?.name}
        onBottleHome={() => setSelectedBottleId(undefined)}
        onBottleClick={() => selectedBottle && setSelectedBottleId(selectedBottle.id)}
      />
    ) : (
      get_view_title(activeView, t)
    );
  const subtitle =
    activeView === "dashboard" && selectedBottle
      ? undefined
      : get_view_subtitle(activeView, t);

  function handle_view_change(viewKey: RendererViewKey) {
    if (viewKey === "dashboard" && activeView === "dashboard" && selectedBottle) {
      setSelectedBottleId(undefined);
      return;
    }

    onViewChange(viewKey);
  }

  return (
    <MainFrame
      title={title}
      subtitle={subtitle}
      logoSrc={LogoSquare}
      activeView={activeView}
      titleBar={
        isMac ? (
          <MacTitleBar title={t("common.appName")} onQuit={onQuit} onMinimize={onMinimize} onMaximize={onMaximize} />
        ) : undefined
      }
      onViewChange={handle_view_change}
    >
      {activeView === "dashboard" && (
        <DashboardView
          wineVersions={wineVersions}
          dxmtVersions={dxmtVersions}
          jadeiteVersions={jadeiteVersions}
          selectedWineVersion={selectedWineVersion}
          selectedWineVersionId={selectedWineVersionId}
          selectedDxmtVersionId={selectedDxmtVersionId}
          selectedJadeiteVersionId={selectedJadeiteVersionId}
          installPath={installPath}
          bottlePrefixPath={bottlePrefixPath}
          isLoadingWineVersions={isLoadingWineVersions}
          isLoadingDxmtVersions={isLoadingDxmtVersions}
          isLoadingJadeiteVersions={isLoadingJadeiteVersions}
          bottles={activeBottles}
          selectedBottleId={selectedBottleId}
          onSelectBottle={setSelectedBottleId}
          onBottleHome={() => setSelectedBottleId(undefined)}
          onCreateBottle={onCreateBottle}
          onReorderBottles={onReorderBottles}
          onRenameBottle={onRenameBottle}
          onChangeBottleDescription={onChangeBottleDescription}
          onRevealBottle={onRevealBottle}
          onStopBottle={onStopBottle}
          onDeleteBottle={(bottleId) => {
            if (selectedBottleId === bottleId) {
              setSelectedBottleId(undefined);
            }

            return onDeleteBottle?.(bottleId);
          }}
          onClearBottleDxmtShaderCaches={onClearBottleDxmtShaderCaches}
          onSelectBottlePrefixPath={onSelectBottlePrefixPath}
          onDownloadBottleLauncherInstaller={onDownloadBottleLauncherInstaller}
          onInstallBottleLauncher={onInstallBottleLauncher}
          onInstallBottleLauncherExecutable={onInstallBottleLauncherExecutable}
          onLaunchBottleApp={onLaunchBottleApp}
          onStopBottleApp={onStopBottleApp}
          onDeleteBottleApp={onDeleteBottleApp}
          onDeleteBottleAppFiles={onDeleteBottleAppFiles}
          onReorderBottleApps={onReorderBottleApps}
          onRegisterBottleExecutable={onRegisterBottleExecutable}
          onUpdateBottlePrefixes={onUpdateBottlePrefixes}
          onDeleteBottlePrefix={onDeleteBottlePrefix}
          onChangeBottleAppLaunchOptions={onChangeBottleAppLaunchOptions}
          onChangeBottleRecipe={onChangeBottleRecipe}
          onApplyBottleRecipe={onApplyBottleRecipe}
          onSelectWineVersion={onSelectWineVersion}
          onInstallWineVersion={onInstallWineVersion}
          onDeleteWineVersion={onDeleteWineVersion}
          onSelectDxmtVersion={onSelectDxmtVersion}
          onInstallDxmtVersion={onInstallDxmtVersion}
          onDeleteDxmtVersion={onDeleteDxmtVersion}
          onSelectJadeiteVersion={onSelectJadeiteVersion}
          onInstallJadeiteVersion={onInstallJadeiteVersion}
          onDeleteJadeiteVersion={onDeleteJadeiteVersion}
        />
      )}
      {activeView === "logs" && (
        <ViewSurface>
          <LogViewer
            entries={logEntries}
            sessions={logSessions}
            sources={logSources}
            shortcuts={shortcuts}
            className="h-full"
            onOpenLogFolder={onOpenLogFolder}
            onOpenLogFile={(session) => onOpenLogFile?.(log_session_file_path(session))}
            onRevealLogFile={(session) => onRevealLogFile?.(log_session_reveal_path(session))}
          />
        </ViewSurface>
      )}
      {activeView === "preferences" && (
        <PreferenceView
          dataRootPath={dataRootPath}
          installPath={installPath}
          bottlePrefixPath={bottlePrefixPath}
          dxmtCachePath={dxmtCachePath}
          gameInstallPath={gameInstallPath}
          locale={locale}
          accentColor={accentColor}
          themeMode={themeMode}
          appLoggingLevel={appLoggingLevel}
          debugFlagMode={debugFlagMode}
          loggingLevel={loggingLevel}
          wineDebugArgs={wineDebugArgs}
          shortcuts={shortcuts}
          autoUpdateEnabled={autoUpdateEnabled}
          closeToTray={closeToTray}
          initialHasChanges={hasUnsavedPreferenceChanges}
          windowStartupSizeMode={windowStartupSizeMode}
          windowStartupCustomWidth={windowStartupCustomWidth}
          windowStartupCustomHeight={windowStartupCustomHeight}
          appUpdateStatus={appUpdateStatus}
          isDeveloperOnAir={isDeveloperOnAir}
          onDataRootPathChange={onDataRootPathChange}
          onInstallPathChange={onInstallPathChange}
          onBottlePrefixPathChange={onBottlePrefixPathChange}
          onDxmtCachePathChange={onDxmtCachePathChange}
          onGameInstallPathChange={onGameInstallPathChange}
          onLocaleChange={onLocaleChange}
          onAccentColorChange={onAccentColorChange}
          onThemeModeChange={onThemeModeChange}
          onAppLoggingLevelChange={onAppLoggingLevelChange}
          onDebugFlagModeChange={onDebugFlagModeChange}
          onLoggingLevelChange={onLoggingLevelChange}
          onWineDebugArgsChange={onWineDebugArgsChange}
          onShortcutChange={onShortcutChange}
          onAutoUpdateEnabledChange={onAutoUpdateEnabledChange}
          onCloseToTrayChange={onCloseToTrayChange}
          onWindowStartupSizeModeChange={onWindowStartupSizeModeChange}
          onWindowStartupCustomWidthChange={onWindowStartupCustomWidthChange}
          onWindowStartupCustomHeightChange={onWindowStartupCustomHeightChange}
          onCheckForUpdates={onCheckForUpdates}
          onInstallUpdate={onInstallUpdate}
          onBrowsePath={onBrowsePath}
          onResetPath={onResetPath}
          onDeleteLauncherData={onDeleteLauncherData}
          onSave={onSavePreference}
        />
      )}
    </MainFrame>
  );
}
