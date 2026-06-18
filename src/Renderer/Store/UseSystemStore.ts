import { create } from "zustand";
import { PREDEFINED_WINE_VERSIONS } from "../../Common/Constant/WineCatalog";
import { IPC_CHANNELS, WineStatusPayload } from "../../Common/Types/IPC";
import { DxmtVersion, WineVersion } from "../../Common/Types/Wine";
import i18n from "../I18n/I18n";

export interface SystemSummary {
  platform: string;
  arch: string;
  rendererMode: "electron" | "storybook" | "browser";
}

export interface SystemStoreState {
  wineVersions: WineVersion[];
  dxmtVersions: DxmtVersion[];
  selectedWineVersionId: string;
  selectedDxmtVersionId: string;
  installPath: string;
  dxmtCachePath: string;
  isLoadingWineVersions: boolean;
  isLoadingDxmtVersions: boolean;
  lastStatusMessage: string;
  systemSummary: SystemSummary;
  loadWineVersions: () => Promise<void>;
  loadDxmtVersions: () => Promise<void>;
  installWineVersion: (versionId: string) => Promise<void>;
  installDxmtVersion: (versionId: string) => Promise<void>;
  selectWineVersion: (versionId: string) => void;
  selectDxmtVersion: (versionId: string) => void;
  setInstallPath: (installPath: string) => void;
  setDxmtCachePath: (dxmtCachePath: string) => void;
  subscribeWineStatus: () => () => void;
}

const DEFAULT_WINE_INSTALL_PATH =
  "~/Library/Application Support/BDIH Launcher/Wine";
const DEFAULT_DXMT_CACHE_PATH =
  "~/Library/Application Support/BDIH Launcher/DXMT";

function get_bith_api() {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window.BTIH_API;
}

function create_system_summary(): SystemSummary {
  if (typeof navigator === "undefined") {
    return {
      platform: "unknown",
      arch: "unknown",
      rendererMode: "storybook",
    };
  }

  return {
    platform: navigator.platform || "unknown",
    arch:
      navigator.userAgent.includes("arm64") ||
      navigator.userAgent.includes("aarch64")
        ? "arm64"
        : "x64",
    rendererMode: get_bith_api() ? "electron" : "browser",
  };
}

function normalize_wine_versions(versions: unknown): WineVersion[] {
  if (!Array.isArray(versions) || versions.length === 0) {
    return PREDEFINED_WINE_VERSIONS;
  }

  return versions as WineVersion[];
}

function normalize_dxmt_versions(versions: unknown): DxmtVersion[] {
  return Array.isArray(versions) ? (versions as DxmtVersion[]) : [];
}

function update_runtime_status<T extends WineVersion | DxmtVersion>(
  versions: T[],
  payload: WineStatusPayload,
): T[] {
  return versions.map((version) => {
    if (version.id !== payload.versionId) {
      return version;
    }

    return {
      ...version,
      status: payload.status,
      progress: payload.progress,
      path: payload.path ?? version.path,
    } as T;
  });
}

export const useSystemStore = create<SystemStoreState>((set, get) => ({
  wineVersions: PREDEFINED_WINE_VERSIONS,
  dxmtVersions: [],
  selectedWineVersionId: PREDEFINED_WINE_VERSIONS[0]?.id ?? "",
  selectedDxmtVersionId: "",
  installPath: DEFAULT_WINE_INSTALL_PATH,
  dxmtCachePath: DEFAULT_DXMT_CACHE_PATH,
  isLoadingWineVersions: false,
  isLoadingDxmtVersions: false,
  lastStatusMessage: i18n.t("store.catalogLocal"),
  systemSummary: create_system_summary(),

  loadWineVersions: async () => {
    set({ isLoadingWineVersions: true });

    try {
      const api = get_bith_api();
      const versions = api
        ? await api.invoke(
            IPC_CHANNELS.WINE.GET_VERSION_LIST.channelName,
            undefined as never,
          )
        : PREDEFINED_WINE_VERSIONS;
      const wineVersions = normalize_wine_versions(versions);

      set({
        wineVersions,
        selectedWineVersionId: wineVersions[0]?.id ?? "",
        isLoadingWineVersions: false,
        lastStatusMessage: api
          ? i18n.t("store.catalogMain")
          : i18n.t("store.catalogLocal"),
      });
    } catch (error) {
      set({
        wineVersions: PREDEFINED_WINE_VERSIONS,
        selectedWineVersionId: PREDEFINED_WINE_VERSIONS[0]?.id ?? "",
        isLoadingWineVersions: false,
        lastStatusMessage:
          error instanceof Error
            ? error.message
            : i18n.t("store.catalogFailed"),
      });
    }
  },

  loadDxmtVersions: async () => {
    set({ isLoadingDxmtVersions: true });

    try {
      const api = get_bith_api();
      const versions = api
        ? await api.invoke(
            IPC_CHANNELS.DXMT.GET_VERSION_LIST.channelName,
            undefined as never,
          )
        : [];
      const dxmtVersions = normalize_dxmt_versions(versions);

      set({
        dxmtVersions,
        selectedDxmtVersionId: dxmtVersions[0]?.id ?? "",
        isLoadingDxmtVersions: false,
      });
    } catch {
      set({
        dxmtVersions: [],
        selectedDxmtVersionId: "",
        isLoadingDxmtVersions: false,
      });
    }
  },

  installWineVersion: async (versionId: string) => {
    const { installPath } = get();

    set((state) => ({
      wineVersions: state.wineVersions.map((version) =>
        version.id === versionId
          ? {
              ...version,
              status: "installing",
              progress: Math.max(version.progress, 5),
            }
          : version,
      ),
      lastStatusMessage: i18n.t("store.installRequested", { versionId }),
    }));

    try {
      const api = get_bith_api();

      if (api) {
        await api.invoke(IPC_CHANNELS.WINE.INSTALL.channelName, {
          versionId,
          installPath,
        });
      } else {
        set((state) => ({
          wineVersions: state.wineVersions.map((version) =>
            version.id === versionId
              ? {
                  ...version,
                  status: "installed",
                  progress: 100,
                  path: installPath,
                }
              : version,
          ),
          lastStatusMessage: i18n.t("store.previewInstallComplete"),
        }));
      }
    } catch (error) {
      set((state) => ({
        wineVersions: state.wineVersions.map((version) =>
          version.id === versionId
            ? { ...version, status: "error", progress: version.progress }
            : version,
        ),
        lastStatusMessage:
          error instanceof Error
            ? error.message
            : i18n.t("store.installFailed"),
      }));
    }
  },

  installDxmtVersion: async (versionId: string) => {
    const { dxmtCachePath } = get();

    set((state) => ({
      dxmtVersions: state.dxmtVersions.map((version) =>
        version.id === versionId
          ? {
              ...version,
              status: "installing",
              progress: Math.max(version.progress, 5),
            }
          : version,
      ),
      lastStatusMessage: i18n.t("store.installRequested", { versionId }),
    }));

    try {
      const api = get_bith_api();

      if (api) {
        await api.invoke(IPC_CHANNELS.DXMT.INSTALL.channelName, {
          versionId,
          installPath: dxmtCachePath,
        });
      }
    } catch (error) {
      set((state) => ({
        dxmtVersions: state.dxmtVersions.map((version) =>
          version.id === versionId
            ? { ...version, status: "error", progress: version.progress }
            : version,
        ),
        lastStatusMessage:
          error instanceof Error
            ? error.message
            : i18n.t("store.installFailed"),
      }));
    }
  },

  selectWineVersion: (versionId: string) => {
    set({ selectedWineVersionId: versionId });
  },

  selectDxmtVersion: (versionId: string) => {
    set({ selectedDxmtVersionId: versionId });
  },

  setInstallPath: (installPath: string) => {
    set({ installPath });
  },

  setDxmtCachePath: (dxmtCachePath: string) => {
    set({ dxmtCachePath });
  },

  subscribeWineStatus: () => {
    const api = get_bith_api();

    if (!api) {
      return () => undefined;
    }

    const unsubscribeWine = api.on(
      IPC_CHANNELS.WINE.STATUS_UPDATE.channelName,
      (_event, payload) => {
        set((state) => ({
          wineVersions: update_runtime_status(state.wineVersions, payload),
          lastStatusMessage:
            payload.message ?? `${payload.versionId}: ${payload.status}`,
        }));
      },
    );
    const unsubscribeDxmt = api.on(
      IPC_CHANNELS.DXMT.STATUS_UPDATE.channelName,
      (_event, payload) => {
        set((state) => ({
          dxmtVersions: update_runtime_status(state.dxmtVersions, payload),
          lastStatusMessage:
            payload.message ?? `${payload.versionId}: ${payload.status}`,
        }));
      },
    );

    return () => {
      unsubscribeWine?.();
      unsubscribeDxmt?.();
    };
  },
}));

// // Placeholder functions for tutorial completion flag management.
// export async function setTutorialCompletedFlag(): Promise<void> {
//   return;
// }

// export async function getTutorialCompletedFlag(): Promise<boolean> {
//   return false;
// }
