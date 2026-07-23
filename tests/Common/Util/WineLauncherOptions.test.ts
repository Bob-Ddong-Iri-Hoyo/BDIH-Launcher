import { normalize_wine_launcher_options_manifest } from "../../../src/Common/Util/WineLauncherOptions";

describe("Wine launcher options manifest", () => {
  it("keeps the internal BDIH process telemetry capability separate from options", () => {
    const manifest = normalize_wine_launcher_options_manifest({
      schemaVersion: 1,
      id: "bdhi.wine.launcher-options",
      name: "Wine 11.11",
      capabilities: {
        bdihProcessTelemetry: {
          protocol: 1,
          transport: "fifo",
          activationEnvironment: "WINE_BDIH_PROCESS_TELEMETRY",
          pipeEnvironment: "WINE_BDIH_PROCESS_PIPE",
        },
        hoyoPlayProxy: {
          protocol: 1,
          relativePath: "share/bdhi/helpers/hoyoplay-proxy.exe",
          requiresProcessTelemetry: true,
        },
      },
      groups: [{
        id: "core",
        title: "Core",
        options: [{
          name: "WINEDEBUG",
          type: "string",
        }],
      }],
    });

    expect(manifest?.capabilities?.bdihProcessTelemetry).toEqual({
      protocol: 1,
      transport: "fifo",
      activationEnvironment: "WINE_BDIH_PROCESS_TELEMETRY",
      pipeEnvironment: "WINE_BDIH_PROCESS_PIPE",
    });
    expect(manifest?.capabilities?.hoyoPlayProxy).toEqual({
      protocol: 1,
      relativePath: "share/bdhi/helpers/hoyoplay-proxy.exe",
      requiresProcessTelemetry: true,
    });
    expect(manifest?.groups[0].options.map((option) => option.name)).toEqual(["WINEDEBUG"]);
  });

  it("does not enable an incompatible telemetry contract", () => {
    const manifest = normalize_wine_launcher_options_manifest({
      schemaVersion: 1,
      id: "bdhi.wine.launcher-options",
      name: "Unsupported Wine",
      capabilities: {
        bdihProcessTelemetry: {
          protocol: 2,
          transport: "fifo",
          activationEnvironment: "WINE_BDIH_PROCESS_TELEMETRY",
          pipeEnvironment: "WINE_BDIH_PROCESS_PIPE",
        },
      },
      groups: [{
        id: "core",
        title: "Core",
        options: [{
          name: "WINEDEBUG",
          type: "string",
        }],
      }],
    });

    expect(manifest?.capabilities).toBeUndefined();
  });
});
