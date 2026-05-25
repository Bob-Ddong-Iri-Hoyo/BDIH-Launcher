import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "../../style/index.css";
import { IPC_CHANNELS } from "../../../Common/Types/IPC";
import { RendererViewKey } from "../../Component/MainFrame";
import { change_renderer_locale, resolve_initial_locale, SupportedLocale } from "../../I18n";
import { useSystemStore } from "../../Store";
import { AccentColor, apply_renderer_accent_color, resolve_initial_accent_color } from "../../Theme";
import { LauncherView } from "./MainView";

const App: React.FC = () => {
  const [activeView, setActiveView] = useState<RendererViewKey>("dashboard");
  const [locale, setLocale] = useState<SupportedLocale>(() => resolve_initial_locale());
  const [accentColor, setAccentColor] = useState<AccentColor>(() => resolve_initial_accent_color());
  const isMac = window.BTIH_ENV?.platform === "darwin";
  const {
    wineVersions,
    selectedWineVersionId,
    installPath,
    isLoadingWineVersions,
    lastStatusMessage,
    loadWineVersions,
    installWineVersion,
    selectWineVersion,
    setInstallPath,
    subscribeWineStatus,
  } = useSystemStore();

  useEffect(() => {
    void loadWineVersions();
    const unsubscribe = subscribeWineStatus();

    return () => {
      unsubscribe();
    };
  }, [loadWineVersions, subscribeWineStatus]);

  const selectedWineVersion = useMemo(
    () => wineVersions.find((version) => version.id === selectedWineVersionId),
    [selectedWineVersionId, wineVersions],
  );

  const handle_locale_change = (nextLocale: SupportedLocale) => {
    setLocale(nextLocale);
    void change_renderer_locale(nextLocale);
  };

  useEffect(() => {
    apply_renderer_accent_color(accentColor);
  }, [accentColor]);

  return (
    <LauncherView
      activeView={activeView}
      statusText={lastStatusMessage}
      onViewChange={setActiveView}
      onQuit={() => window.BTIH_API?.send(IPC_CHANNELS.APP.QUIT.channelName, undefined as never)}
      onMinimize={() => window.BTIH_API?.send(IPC_CHANNELS.APP.MINIMIZE.channelName, undefined as never)}
      onMaximize={() => window.BTIH_API?.send(IPC_CHANNELS.APP.MAXIMIZE.channelName, undefined as never)}
      isMac={isMac}
      locale={locale}
      accentColor={accentColor}
      wineVersions={wineVersions}
      selectedWineVersion={selectedWineVersion}
      selectedWineVersionId={selectedWineVersionId}
      installPath={installPath}
      isLoadingWineVersions={isLoadingWineVersions}
      onSelectWineVersion={selectWineVersion}
      onInstallWineVersion={(versionId) => void installWineVersion(versionId)}
      onInstallPathChange={setInstallPath}
      onLocaleChange={handle_locale_change}
      onAccentColorChange={setAccentColor}
      onResetInstallPath={() => setInstallPath("~/Library/Application Support/BDIH/Wine")}
    />
  );
};

const container = document.getElementById("root");
const root = createRoot(container!);
root.render(<App />);
