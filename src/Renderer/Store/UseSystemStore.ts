import { create } from "zustand";
import { PREDEFINED_WINE_VERSIONS } from "../../Common/Constant/WineCatalog";
import { IPC_CHANNELS, WineStatusPayload } from "../../Common/Types/IPC";
import { DxmtVersion, JadeiteVersion, WineVersion } from "../../Common/Types/Wine";
import i18n from "../I18n/I18n";

export interface SystemSummary {
  platform: string;
  arch: string;
  rendererMode: "electron" | "storybook" | "browser";
}

export type RuntimeInstallFailureReason =
  | "diskSpace"
  | "network"
  | "archive"
  | "permission"
  | "missingFile"
  | "cancelled"
  | "unknown";

export interface RuntimeInstallFailure {
  resource: "Wine" | "DXMT" | "Jadeite";
  versionId: string;
  reason: RuntimeInstallFailureReason;
  details: string;
}

export interface SystemStoreState {
  wineVersions: WineVersion[];
  dxmtVersions: DxmtVersion[];
  jadeiteVersions: JadeiteVersion[];
  selectedWineVersionId: string;
  selectedDxmtVersionId: string;
  selectedJadeiteVersionId: string;
  installPath: string;
  dxmtCachePath: string;
  jadeiteInstallPath: string;
  isLoadingWineVersions: boolean;
  isLoadingDxmtVersions: boolean;
  isLoadingJadeiteVersions: boolean;
  lastStatusMessage: string;
  runtimeInstallFailure: RuntimeInstallFailure | null;
  systemSummary: SystemSummary;
  loadWineVersions: () => Promise<void>;
  loadDxmtVersions: () => Promise<void>;
  loadJadeiteVersions: () => Promise<void>;
  installWineVersion: (versionId: string) => Promise<void>;
  installDxmtVersion: (versionId: string) => Promise<void>;
  installJadeiteVersion: (versionId: string) => Promise<void>;
  deleteWineVersion: (versionId: string) => Promise<void>;
  deleteDxmtVersion: (versionId: string) => Promise<void>;
  deleteJadeiteVersion: (versionId: string) => Promise<void>;
  selectWineVersion: (versionId: string) => void;
  selectDxmtVersion: (versionId: string) => void;
  selectJadeiteVersion: (versionId: string) => void;
  setInstallPath: (installPath: string) => void;
  setDxmtCachePath: (dxmtCachePath: string) => void;
  setJadeiteInstallPath: (jadeiteInstallPath: string) => void;
  clearWineRuntimeMetadata: () => void;
  clearDxmtRuntimeMetadata: () => void;
  clearJadeiteRuntimeMetadata: () => void;
  clearRuntimeInstallFailure: () => void;
  subscribeWineStatus: () => () => void;
}

const DEFAULT_WINE_INSTALL_PATH =
  "~/Library/Application Support/BDIH Launcher/Wine";
const DEFAULT_DXMT_CACHE_PATH =
  "~/Library/Application Support/BDIH Launcher/DXMT";
const DEFAULT_JADEITE_INSTALL_PATH =
  "~/Library/Application Support/BDIH Launcher/dependencies/jadeite";

function get_bith_api() {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window.BTIH_API;
}

function describe_install_error(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function classify_install_failure(
  resource: RuntimeInstallFailure["resource"],
  versionId: string,
  error: unknown,
): RuntimeInstallFailure {
  const details = describe_install_error(error);
  const normalized = details.toLowerCase();
  let reason: RuntimeInstallFailureReason = "unknown";

  if (/enospc|no space left|disk (?:is )?full|quota exceeded|not enough (?:free )?space/.test(normalized)) {
    reason = "diskSpace";
  } else if (/eacces|eperm|permission denied|operation not permitted|read-only file system/.test(normalized)) {
    reason = "permission";
  } else if (/enotfound|eai_again|econnreset|econnrefused|etimedout|network|fetch failed|download failed|socket hang up|http (?:4|5)\d\d/.test(normalized)) {
    reason = "network";
  } else if (/unexpected end of file|unexpected eof|not in gzip format|invalid (?:archive|tar|zip)|checksum|corrupt|tar exited|gzip:|unzip exited/.test(normalized)) {
    reason = "archive";
  } else if (/enoent|no such file or directory|cannot find|could not find/.test(normalized)) {
    reason = "missingFile";
  } else if (/cancelled|canceled|aborterror|operation was aborted/.test(normalized)) {
    reason = "cancelled";
  }

  return { resource, versionId, reason, details };
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

function normalize_jadeite_versions(versions: unknown): JadeiteVersion[] {
  return Array.isArray(versions) ? (versions as JadeiteVersion[]) : [];
}

function update_runtime_status<T extends WineVersion | DxmtVersion | JadeiteVersion>(
  versions: T[],
  payload: WineStatusPayload,
): T[] {
  const shouldKeepInstalledPaths = payload.status === "installed" || payload.status === "completed";

  return versions.map((version) => {
    if (version.id !== payload.versionId) {
      return version;
    }

    return {
      ...version,
      status: payload.status,
      progress: payload.progress,
      path: shouldKeepInstalledPaths ? payload.path ?? version.path : payload.path,
      metadataPath: shouldKeepInstalledPaths
        ? payload.metadataPath ?? ("metadataPath" in version ? version.metadataPath : undefined)
        : undefined,
      launcherOptionsManifest: shouldKeepInstalledPaths
        ? payload.launcherOptionsManifest ?? ("launcherOptionsManifest" in version ? version.launcherOptionsManifest : undefined)
        : undefined,
    } as T;
  });
}

export const useSystemStore = create<SystemStoreState>((set, get) => ({
  wineVersions: PREDEFINED_WINE_VERSIONS,
  dxmtVersions: [],
  jadeiteVersions: [],
  selectedWineVersionId: PREDEFINED_WINE_VERSIONS[0]?.id ?? "",
  selectedDxmtVersionId: "",
  selectedJadeiteVersionId: "",
  installPath: DEFAULT_WINE_INSTALL_PATH,
  dxmtCachePath: DEFAULT_DXMT_CACHE_PATH,
  jadeiteInstallPath: DEFAULT_JADEITE_INSTALL_PATH,
  isLoadingWineVersions: false,
  isLoadingDxmtVersions: false,
  isLoadingJadeiteVersions: false,
  lastStatusMessage: i18n.t("store.catalogLocal"),
  runtimeInstallFailure: null,
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

  loadJadeiteVersions: async () => {
    set({ isLoadingJadeiteVersions: true });

    try {
      const api = get_bith_api();
      const versions = api
        ? await api.invoke(
            IPC_CHANNELS.JADEITE.GET_VERSION_LIST.channelName,
            undefined as never,
          )
        : [];
      const jadeiteVersions = normalize_jadeite_versions(versions);

      set({
        jadeiteVersions,
        selectedJadeiteVersionId: jadeiteVersions[0]?.id ?? "",
        isLoadingJadeiteVersions: false,
      });
    } catch {
      set({
        jadeiteVersions: [],
        selectedJadeiteVersionId: "",
        isLoadingJadeiteVersions: false,
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
      runtimeInstallFailure: null,
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
        runtimeInstallFailure: classify_install_failure("Wine", versionId, error),
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
      runtimeInstallFailure: null,
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
        runtimeInstallFailure: classify_install_failure("DXMT", versionId, error),
      }));
    }
  },

  installJadeiteVersion: async (versionId: string) => {
    const { jadeiteInstallPath } = get();

    set((state) => ({
      jadeiteVersions: state.jadeiteVersions.map((version) =>
        version.id === versionId
          ? {
              ...version,
              status: "installing",
              progress: Math.max(version.progress, 5),
            }
          : version,
      ),
      lastStatusMessage: i18n.t("store.installRequested", { versionId }),
      runtimeInstallFailure: null,
    }));

    try {
      const api = get_bith_api();

      if (api) {
        await api.invoke(IPC_CHANNELS.JADEITE.INSTALL.channelName, {
          versionId,
          installPath: jadeiteInstallPath,
        });
      }
    } catch (error) {
      set((state) => ({
        jadeiteVersions: state.jadeiteVersions.map((version) =>
          version.id === versionId
            ? { ...version, status: "error", progress: version.progress }
            : version,
        ),
        lastStatusMessage:
          error instanceof Error
            ? error.message
            : i18n.t("store.installFailed"),
        runtimeInstallFailure: classify_install_failure("Jadeite", versionId, error),
      }));
    }
  },

  deleteWineVersion: async (versionId: string) => {
    const { installPath } = get();

    try {
      const api = get_bith_api();

      if (api) {
        const result = await api.invoke(IPC_CHANNELS.WINE.DELETE.channelName, {
          versionId,
          installPath,
        });

        if (!result?.ok) {
          throw new Error(result?.error ?? i18n.t("store.deleteFailed"));
        }
      }

      set((state) => ({
        wineVersions: state.wineVersions.map((version) =>
          version.id === versionId
            ? {
                ...version,
                status: "available",
                progress: 0,
                path: undefined,
                metadataPath: undefined,
                launcherOptionsManifest: undefined,
              }
            : version,
        ),
        lastStatusMessage: i18n.t("store.deleteCompleted", { versionId }),
      }));
    } catch (error) {
      set({
        lastStatusMessage:
          error instanceof Error
            ? error.message
            : i18n.t("store.deleteFailed"),
      });
    }
  },

  deleteDxmtVersion: async (versionId: string) => {
    const { dxmtCachePath } = get();

    try {
      const api = get_bith_api();

      if (api) {
        const result = await api.invoke(IPC_CHANNELS.DXMT.DELETE.channelName, {
          versionId,
          installPath: dxmtCachePath,
        });

        if (!result?.ok) {
          throw new Error(result?.error ?? i18n.t("store.deleteFailed"));
        }
      }

      set((state) => ({
        dxmtVersions: state.dxmtVersions.map((version) =>
          version.id === versionId
            ? {
                ...version,
                status: "available",
                progress: 0,
                path: undefined,
              }
            : version,
        ),
        lastStatusMessage: i18n.t("store.deleteCompleted", { versionId }),
      }));
    } catch (error) {
      set({
        lastStatusMessage:
          error instanceof Error
            ? error.message
            : i18n.t("store.deleteFailed"),
      });
    }
  },

  deleteJadeiteVersion: async (versionId: string) => {
    const { jadeiteInstallPath } = get();

    try {
      const api = get_bith_api();

      if (api) {
        const result = await api.invoke(IPC_CHANNELS.JADEITE.DELETE.channelName, {
          versionId,
          installPath: jadeiteInstallPath,
        });

        if (!result?.ok) {
          throw new Error(result?.error ?? i18n.t("store.deleteFailed"));
        }
      }

      set((state) => ({
        jadeiteVersions: state.jadeiteVersions.map((version) =>
          version.id === versionId
            ? {
                ...version,
                status: "available",
                progress: 0,
                path: undefined,
              }
            : version,
        ),
        lastStatusMessage: i18n.t("store.deleteCompleted", { versionId }),
      }));
    } catch (error) {
      set({
        lastStatusMessage:
          error instanceof Error
            ? error.message
            : i18n.t("store.deleteFailed"),
      });
    }
  },

  selectWineVersion: (versionId: string) => {
    set({ selectedWineVersionId: versionId });
  },

  selectDxmtVersion: (versionId: string) => {
    set({ selectedDxmtVersionId: versionId });
  },

  selectJadeiteVersion: (versionId: string) => {
    set({ selectedJadeiteVersionId: versionId });
  },

  setInstallPath: (installPath: string) => {
    set({ installPath });
  },

  setDxmtCachePath: (dxmtCachePath: string) => {
    set({ dxmtCachePath });
  },

  setJadeiteInstallPath: (jadeiteInstallPath: string) => {
    set({ jadeiteInstallPath });
  },

  clearWineRuntimeMetadata: () => {
    set((state) => ({
      wineVersions: state.wineVersions.map((version) => ({
        ...version,
        status: "available",
        progress: 0,
        path: undefined,
        metadataPath: undefined,
        launcherOptionsManifest: undefined,
      })),
    }));
  },

  clearDxmtRuntimeMetadata: () => {
    set((state) => ({
      dxmtVersions: state.dxmtVersions.map((version) => ({
        ...version,
        status: "available",
        progress: 0,
        path: undefined,
      })),
    }));
  },

  clearJadeiteRuntimeMetadata: () => {
    set((state) => ({
      jadeiteVersions: state.jadeiteVersions.map((version) => ({
        ...version,
        status: "available",
        progress: 0,
        path: undefined,
      })),
    }));
  },

  clearRuntimeInstallFailure: () => set({ runtimeInstallFailure: null }),

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
    const unsubscribeJadeite = api.on(
      IPC_CHANNELS.JADEITE.STATUS_UPDATE.channelName,
      (_event, payload) => {
        set((state) => ({
          jadeiteVersions: update_runtime_status(state.jadeiteVersions, payload),
          lastStatusMessage:
            payload.message ?? `${payload.versionId}: ${payload.status}`,
        }));
      },
    );

    return () => {
      unsubscribeWine?.();
      unsubscribeDxmt?.();
      unsubscribeJadeite?.();
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
