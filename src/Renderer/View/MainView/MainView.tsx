import React from "react";
import { ChevronLeft, Copy, FolderOpen, Pencil, Play, Settings, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { WineVersion } from "../../../Common/Types/Wine";
import { BottleDetailPanel, CreateBottleDialog, DashboardBreadcrumb, DashboardHomePanel } from "../../Component/BottleDashboard";
import { ContextMenu, ContextMenuItem, ContextMenuPosition } from "../../Component/ContextMenu";
import { IconButton } from "../../Component/IconButton";
import { LogEntry, LogSession, LogSourceOption, LogViewer } from "../../Component/LogViewer";
import { MacTitleBar } from "../../Component/MacTitleBar";
import { MainFrame, RendererViewKey } from "../../Component/MainFrame";
import XTermTerminal from "../../Component/Terminal";
import { ViewSurface } from "../../Component/ViewSurface";
import { WindowControls } from "../../Component/WindowControls";
import { SupportedLocale } from "../../I18n";
import { AccentColor } from "../../Theme";
import type { Bottle, CreateBottleInput } from "../../Types/Bottle";
import { PreferenceView } from "../PreferenceView/PreferenceView";
import LogoSquare from "../../../../resouces/bobtongirihoyo.png";
import LogoWide from "../../../../resouces/bobtongirihoyo_wide.png";

export type { Bottle, CreateBottleInput, InstalledApp } from "../../Types/Bottle";

export interface DashboardViewProps {
  wineVersions: WineVersion[];
  selectedWineVersion?: WineVersion;
  selectedWineVersionId: string;
  installPath: string;
  isLoadingWineVersions: boolean;
  bottles?: Bottle[];
  selectedBottleId?: string;
  onSelectBottle?: (bottleId: string) => void;
  onBottleHome?: () => void;
  onCreateBottle?: (input: CreateBottleInput) => void;
  onSelectWineVersion: (versionId: string) => void;
  onInstallWineVersion: (versionId: string) => void;
}

export interface LauncherViewProps extends DashboardViewProps {
  activeView: RendererViewKey;
  statusText: string;
  onViewChange: (viewKey: RendererViewKey) => void;
  onQuit: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  isMac?: boolean;
  locale?: SupportedLocale;
  accentColor?: AccentColor;
  logEntries?: LogEntry[];
  logSessions?: LogSession[];
  logSources?: LogSourceOption[];
  onInstallPathChange: (installPath: string) => void;
  onLocaleChange: (locale: SupportedLocale) => void;
  onAccentColorChange: (accentColor: AccentColor) => void;
  onResetInstallPath: () => void;
}

function get_view_title(viewKey: RendererViewKey, translate: (key: string) => string) {
  return translate(`navigation.${viewKey}.label`);
}

function get_view_subtitle(viewKey: RendererViewKey, translate: (key: string) => string) {
  return translate(`navigation.${viewKey}.subtitle`);
}

export function DashboardView({
  wineVersions,
  selectedWineVersion,
  selectedWineVersionId,
  installPath,
  isLoadingWineVersions,
  bottles = [],
  selectedBottleId,
  onSelectBottle,
  onBottleHome,
  onCreateBottle,
  onSelectWineVersion,
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
        id: "recipe",
        label: t("main.contextMenu.recipeSettings"),
        icon: Settings,
        onSelect: () => onSelectBottle?.(contextBottle.id),
      },
      {
        id: "rename",
        label: t("main.contextMenu.rename"),
        icon: Pencil,
        disabled: true,
        onSelect: () => undefined,
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
        disabled: true,
        onSelect: () => undefined,
      },
      {
        id: "delete",
        label: t("main.contextMenu.deleteBottle"),
        icon: Trash2,
        danger: true,
        disabled: true,
        separatorBefore: true,
        onSelect: () => undefined,
      },
    ];
  }, [contextBottle, onSelectBottle, t]);

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
    return (
      <BottleDetailPanel
        bottle={selectedBottle}
        selectedWineVersionId={selectedWineVersionId}
        appLogoSrc={LogoSquare}
        onBottleHome={onBottleHome}
      />
    );
  }

  return (
    <>
      <DashboardHomePanel
        wineVersions={wineVersions}
        selectedWineVersion={selectedWineVersion}
        selectedWineVersionId={selectedWineVersionId}
        installPath={installPath}
        isLoadingWineVersions={isLoadingWineVersions}
        bottles={bottles}
        heroImageSrc={LogoWide}
        isInstalledWineOpen={isInstalledWineOpen}
        onToggleInstalledWine={() => setIsInstalledWineOpen((isOpen) => !isOpen)}
        onSelectWineVersion={onSelectWineVersion}
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
        selectedWineVersionId={selectedWineVersionId}
        onClose={() => setIsCreateBottleOpen(false)}
        onCreateBottle={onCreateBottle}
      />
    </>
  );
}

export function LauncherView({
  activeView,
  statusText,
  wineVersions,
  selectedWineVersion,
  selectedWineVersionId,
  installPath,
  isLoadingWineVersions,
  bottles,
  onViewChange,
  onQuit,
  onMinimize,
  onMaximize,
  isMac = false,
  locale,
  accentColor,
  logEntries = [],
  logSessions = [],
  logSources = [],
  onSelectWineVersion,
  onInstallWineVersion,
  onInstallPathChange,
  onLocaleChange,
  onAccentColorChange,
  onResetInstallPath,
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
      statusText={statusText}
      titleBar={
        isMac ? (
          <MacTitleBar title={t("common.appName")} onQuit={onQuit} onMinimize={onMinimize} onMaximize={onMaximize} />
        ) : undefined
      }
      headerLeading={
        activeView === "dashboard" && selectedBottle ? (
          <IconButton
            icon={ChevronLeft}
            label={t("main.backToBottleHome")}
            onClick={() => setSelectedBottleId(undefined)}
          />
        ) : undefined
      }
      actions={!isMac ? <WindowControls onMinimize={onMinimize} onMaximize={onMaximize} onQuit={onQuit} /> : undefined}
      onViewChange={handle_view_change}
    >
      {activeView === "dashboard" && (
        <DashboardView
          wineVersions={wineVersions}
          selectedWineVersion={selectedWineVersion}
          selectedWineVersionId={selectedWineVersionId}
          installPath={installPath}
          isLoadingWineVersions={isLoadingWineVersions}
          bottles={activeBottles}
          selectedBottleId={selectedBottleId}
          onSelectBottle={setSelectedBottleId}
          onBottleHome={() => setSelectedBottleId(undefined)}
          onCreateBottle={() => undefined}
          onSelectWineVersion={onSelectWineVersion}
          onInstallWineVersion={onInstallWineVersion}
        />
      )}
      {activeView === "terminal" && (
        <ViewSurface>
          <XTermTerminal height="100%" welcomeMessage={t("main.terminalWelcome")} />
        </ViewSurface>
      )}
      {activeView === "logs" && (
        <ViewSurface>
          <LogViewer entries={logEntries} sessions={logSessions} sources={logSources} className="h-full" />
        </ViewSurface>
      )}
      {activeView === "preferences" && (
        <PreferenceView
          installPath={installPath}
          locale={locale}
          accentColor={accentColor}
          onInstallPathChange={onInstallPathChange}
          onLocaleChange={onLocaleChange}
          onAccentColorChange={onAccentColorChange}
          onReset={onResetInstallPath}
        />
      )}
    </MainFrame>
  );
}


