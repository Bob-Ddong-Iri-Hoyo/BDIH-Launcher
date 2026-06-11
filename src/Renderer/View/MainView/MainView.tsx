import React from "react";
import { Copy, FolderOpen, Pencil, Play, Settings, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AppUpdateStatusPayload, BottleLauncherKind, DebugFlagMode, LauncherDataDeleteTarget, LauncherLogLevel, LauncherShortcutAction, LauncherShortcutMap, RendererThemeMode } from "../../../Common/Types/IPC";
import type { DxmtVersion, WineVersion } from "../../../Common/Types/Wine";
import { BottleDetailPanel, CreateBottleDialog, DashboardBreadcrumb, DashboardHomePanel } from "../../Component/BottleDashboard";
import { ContextMenu, ContextMenuItem, ContextMenuPosition } from "../../Component/ContextMenu";
import { LogEntry, log_session_file_path, log_session_reveal_path, LogSession, LogSourceOption, LogViewer } from "../../Component/LogViewer";
import { MacTitleBar } from "../../Component/MacTitleBar";
import { MainFrame, RendererViewKey } from "../../Component/MainFrame";
import { ViewSurface } from "../../Component/ViewSurface";
import { SupportedLocale } from "../../I18n";
import { AccentColor } from "../../Theme";
import type { Bottle, CreateBottleInput } from "../../Types/Bottle";
import { PreferenceView } from "../PreferenceView/PreferenceView";
import type { PreferencePathKey } from "../PreferenceView/PreferenceView";
import LogoSquare from "../../../../resouces/bobtongirihoyo.png";

export type { Bottle, CreateBottleInput, InstalledApp } from "../../Types/Bottle";

export interface DashboardViewProps {
  wineVersions: WineVersion[];
  dxmtVersions?: DxmtVersion[];
  selectedWineVersion?: WineVersion;
  selectedWineVersionId: string;
  selectedDxmtVersionId?: string;
  installPath: string;
  bottlePrefixPath?: string;
  isLoadingWineVersions: boolean;
  isLoadingDxmtVersions?: boolean;
  bottles?: Bottle[];
  selectedBottleId?: string;
  onSelectBottle?: (bottleId: string) => void;
  onBottleHome?: () => void;
  onCreateBottle?: (input: CreateBottleInput) => void;
  onRenameBottle?: (bottleId: string, name: string) => void;
  onRevealBottle?: (path: string) => void;
  onDeleteBottle?: (bottleId: string) => void;
  onSelectBottlePrefixPath?: (currentPath: string) => Promise<string | undefined>;
  onInstallBottleLauncher?: (bottleId: string, launcher: BottleLauncherKind) => void;
  onLaunchBottleApp?: (bottleId: string, appId: string) => void;
  onLaunchBottleAppWithArgs?: (bottleId: string, appId: string, executableArgs: string[]) => void;
  onStopBottleApp?: (bottleId: string, appId: string) => void;
  onDeleteBottleApp?: (bottleId: string, appId: string) => void;
  onRegisterBottleExecutable?: (bottleId: string, executablePath: string) => void;
  onSelectWineVersion: (versionId: string) => void;
  onInstallWineVersion: (versionId: string) => void;
  onSelectDxmtVersion?: (versionId: string) => void;
  onInstallDxmtVersion?: (versionId: string) => void;
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
  appUpdateStatus?: AppUpdateStatusPayload;
  bottlePrefixPath?: string;
  dxmtCachePath?: string;
  isDeveloperOnAir?: boolean;
  logEntries?: LogEntry[];
  logSessions?: LogSession[];
  logSources?: LogSourceOption[];
  onOpenLogFolder?: () => void;
  onOpenLogFile?: (path?: string) => void;
  onRevealLogFile?: (path?: string) => void;
  onInstallPathChange: (installPath: string) => void;
  onBottlePrefixPathChange?: (bottlePrefixPath: string) => void;
  onDxmtCachePathChange?: (dxmtCachePath: string) => void;
  onLocaleChange: (locale: SupportedLocale) => void;
  onAccentColorChange: (accentColor: AccentColor) => void;
  onThemeModeChange?: (themeMode: RendererThemeMode) => void;
  onAppLoggingLevelChange?: (appLoggingLevel: LauncherLogLevel) => void;
  onDebugFlagModeChange?: (debugFlagMode: DebugFlagMode) => void;
  onLoggingLevelChange?: (loggingLevel: LauncherLogLevel) => void;
  onWineDebugArgsChange?: (wineDebugArgs: string) => void;
  onShortcutChange?: (action: LauncherShortcutAction, shortcut: string) => void;
  onAutoUpdateEnabledChange?: (enabled: boolean) => void;
  onCheckForUpdates?: () => void;
  onResetInstallPath: () => void;
  onBrowsePath?: (pathKey: PreferencePathKey) => void;
  onResetPath?: (pathKey: PreferencePathKey) => void;
  onDeleteLauncherData?: (targets: LauncherDataDeleteTarget[]) => void;
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
  selectedWineVersion,
  selectedWineVersionId,
  selectedDxmtVersionId = "",
  installPath,
  bottlePrefixPath = "",
  isLoadingWineVersions,
  isLoadingDxmtVersions = false,
  bottles = [],
  selectedBottleId,
  onSelectBottle,
  onBottleHome,
  onCreateBottle,
  onRenameBottle,
  onRevealBottle,
  onDeleteBottle,
  onSelectBottlePrefixPath,
  onInstallBottleLauncher,
  onLaunchBottleApp,
  onLaunchBottleAppWithArgs,
  onStopBottleApp,
  onDeleteBottleApp,
  onRegisterBottleExecutable,
  onSelectWineVersion,
  onInstallWineVersion,
  onSelectDxmtVersion,
  onInstallDxmtVersion,
}: DashboardViewProps) {
  const { t } = useTranslation();
  const [isInstalledWineOpen, setIsInstalledWineOpen] = React.useState(false);
  const [isCreateBottleOpen, setIsCreateBottleOpen] = React.useState(false);
  const [contextMenuState, setContextMenuState] = React.useState<{
    position: ContextMenuPosition;
    bottleId: string;
  } | null>(null);
  const selectedBottle = React.useMemo(
    () => bottles.find((bottle) => bottle.id === selectedBottleId),
    [bottles, selectedBottleId],
  );
  const contextBottle = React.useMemo(
    () => bottles.find((bottle) => bottle.id === contextMenuState?.bottleId),
    [bottles, contextMenuState?.bottleId],
  );
  const bottleContextMenuItems = React.useMemo<ContextMenuItem[]>(() => {
    if (!contextBottle) {
      return [];
    }

    return [
      {
        id: "open",
        label: t("main.contextMenu.openBottle"),
        icon: Play,
        onSelect: () => onSelectBottle?.(contextBottle.id),
      },
      {
        id: "launch-options",
        label: t("main.contextMenu.launchOptions"),
        icon: Settings,
        onSelect: () => onSelectBottle?.(contextBottle.id),
      },
      {
        id: "rename",
        label: t("main.contextMenu.rename"),
        icon: Pencil,
        onSelect: () => {
          const nextName = window.prompt(t("main.contextMenu.rename"), contextBottle.name);

          if (nextName?.trim()) {
            onRenameBottle?.(contextBottle.id, nextName.trim());
          }
        },
      },
      {
        id: "copy-path",
        label: t("main.contextMenu.copyPath"),
        icon: Copy,
        onSelect: () => void navigator.clipboard?.writeText(contextBottle.path),
      },
      {
        id: "reveal",
        label: t("main.contextMenu.revealFolder"),
        icon: FolderOpen,
        onSelect: () => onRevealBottle?.(contextBottle.path),
      },
      {
        id: "delete",
        label: t("main.contextMenu.deleteBottle"),
        icon: Trash2,
        danger: true,
        separatorBefore: true,
        onSelect: () => {
          if (window.confirm(t("main.contextMenu.deleteBottleConfirm", { name: contextBottle.name }))) {
            onDeleteBottle?.(contextBottle.id);
          }
        },
      },
    ];
  }, [contextBottle, onDeleteBottle, onRenameBottle, onRevealBottle, onSelectBottle, t]);

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
        selectedWineVersionId={selectedWineVersionId}
        wineRuntimePath={selectedBottleWineRuntimePath}
        appLogoSrc={LogoSquare}
        onRevealBottle={onRevealBottle}
        onInstallBottleLauncher={onInstallBottleLauncher}
        onLaunchBottleApp={onLaunchBottleApp}
        onLaunchBottleAppWithArgs={onLaunchBottleAppWithArgs}
        onStopBottleApp={onStopBottleApp}
        onDeleteBottleApp={onDeleteBottleApp}
        onRegisterBottleExecutable={onRegisterBottleExecutable}
      />
    );
  }

  return (
    <>
      <DashboardHomePanel
        wineVersions={wineVersions}
        dxmtVersions={dxmtVersions}
          selectedWineVersionId={selectedWineVersionId}
          selectedDxmtVersionId={selectedDxmtVersionId}
          installPath={installPath}
          isLoadingWineVersions={isLoadingWineVersions}
        isLoadingDxmtVersions={isLoadingDxmtVersions}
        bottles={bottles}
        isInstalledWineOpen={isInstalledWineOpen}
        onToggleInstalledWine={() => setIsInstalledWineOpen((isOpen) => !isOpen)}
        onSelectWineVersion={onSelectWineVersion}
        onInstallWineVersion={onInstallWineVersion}
        onSelectDxmtVersion={onSelectDxmtVersion}
        onInstallDxmtVersion={onInstallDxmtVersion}
        onSelectBottle={onSelectBottle}
        onBottleContextMenu={handle_bottle_context_menu}
        onCreateBottle={open_create_bottle_dialog}
      />
      <ContextMenu
        open={Boolean(contextMenuState && contextBottle)}
        position={contextMenuState?.position}
        items={bottleContextMenuItems}
        onClose={() => setContextMenuState(null)}
      />
      <CreateBottleDialog
        open={isCreateBottleOpen}
        wineVersions={wineVersions}
        dxmtVersions={dxmtVersions}
        selectedWineVersionId={selectedWineVersionId}
        selectedDxmtVersionId={selectedDxmtVersionId}
        bottlePrefixPath={bottlePrefixPath}
        onSelectBottlePrefixPath={onSelectBottlePrefixPath}
        onClose={() => setIsCreateBottleOpen(false)}
        onCreateBottle={onCreateBottle}
      />
    </>
  );
}

export function LauncherView({
  activeView,
  wineVersions,
  dxmtVersions,
  selectedWineVersion,
  selectedWineVersionId,
  selectedDxmtVersionId,
  installPath,
  isLoadingWineVersions,
  isLoadingDxmtVersions,
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
  appUpdateStatus,
  bottlePrefixPath,
  dxmtCachePath,
  isDeveloperOnAir,
  logEntries = [],
  logSessions = [],
  logSources = [],
  onOpenLogFolder,
  onOpenLogFile,
  onRevealLogFile,
  onCreateBottle,
  onRenameBottle,
  onRevealBottle,
  onDeleteBottle,
  onSelectBottlePrefixPath,
  onInstallBottleLauncher,
  onLaunchBottleApp,
  onLaunchBottleAppWithArgs,
  onStopBottleApp,
  onDeleteBottleApp,
  onRegisterBottleExecutable,
  onSelectWineVersion,
  onInstallWineVersion,
  onSelectDxmtVersion,
  onInstallDxmtVersion,
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
  onResetInstallPath,
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
      ? selectedBottle.description
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
          selectedWineVersion={selectedWineVersion}
          selectedWineVersionId={selectedWineVersionId}
          selectedDxmtVersionId={selectedDxmtVersionId}
          installPath={installPath}
          bottlePrefixPath={bottlePrefixPath}
          isLoadingWineVersions={isLoadingWineVersions}
          isLoadingDxmtVersions={isLoadingDxmtVersions}
          bottles={activeBottles}
          selectedBottleId={selectedBottleId}
          onSelectBottle={setSelectedBottleId}
          onBottleHome={() => setSelectedBottleId(undefined)}
          onCreateBottle={onCreateBottle}
          onRenameBottle={onRenameBottle}
          onRevealBottle={onRevealBottle}
          onDeleteBottle={(bottleId) => {
            if (selectedBottleId === bottleId) {
              setSelectedBottleId(undefined);
            }

            onDeleteBottle?.(bottleId);
          }}
          onSelectBottlePrefixPath={onSelectBottlePrefixPath}
          onInstallBottleLauncher={onInstallBottleLauncher}
          onLaunchBottleApp={onLaunchBottleApp}
          onLaunchBottleAppWithArgs={onLaunchBottleAppWithArgs}
          onStopBottleApp={onStopBottleApp}
          onDeleteBottleApp={onDeleteBottleApp}
          onRegisterBottleExecutable={onRegisterBottleExecutable}
          onSelectWineVersion={onSelectWineVersion}
          onInstallWineVersion={onInstallWineVersion}
          onSelectDxmtVersion={onSelectDxmtVersion}
          onInstallDxmtVersion={onInstallDxmtVersion}
        />
      )}
      {activeView === "logs" && (
        <ViewSurface>
          <LogViewer
            entries={logEntries}
            sessions={logSessions}
            sources={logSources}
            className="h-full"
            onOpenLogFolder={onOpenLogFolder}
            onOpenLogFile={(session) => onOpenLogFile?.(log_session_file_path(session))}
            onRevealLogFile={(session) => onRevealLogFile?.(log_session_reveal_path(session))}
          />
        </ViewSurface>
      )}
      {activeView === "preferences" && (
        <PreferenceView
          installPath={installPath}
          bottlePrefixPath={bottlePrefixPath}
          dxmtCachePath={dxmtCachePath}
          locale={locale}
          accentColor={accentColor}
          themeMode={themeMode}
          appLoggingLevel={appLoggingLevel}
          debugFlagMode={debugFlagMode}
          loggingLevel={loggingLevel}
          wineDebugArgs={wineDebugArgs}
          shortcuts={shortcuts}
          autoUpdateEnabled={autoUpdateEnabled}
          appUpdateStatus={appUpdateStatus}
          isDeveloperOnAir={isDeveloperOnAir}
          onInstallPathChange={onInstallPathChange}
          onBottlePrefixPathChange={onBottlePrefixPathChange}
          onDxmtCachePathChange={onDxmtCachePathChange}
          onLocaleChange={onLocaleChange}
          onAccentColorChange={onAccentColorChange}
          onThemeModeChange={onThemeModeChange}
          onAppLoggingLevelChange={onAppLoggingLevelChange}
          onDebugFlagModeChange={onDebugFlagModeChange}
          onLoggingLevelChange={onLoggingLevelChange}
          onWineDebugArgsChange={onWineDebugArgsChange}
          onShortcutChange={onShortcutChange}
          onAutoUpdateEnabledChange={onAutoUpdateEnabledChange}
          onCheckForUpdates={onCheckForUpdates}
          onBrowsePath={onBrowsePath}
          onResetPath={onResetPath}
          onDeleteLauncherData={onDeleteLauncherData}
          onReset={onResetInstallPath}
          onSave={onSavePreference}
        />
      )}
    </MainFrame>
  );
}
