import type { InstallBottleLauncherPayload } from "../../../src/Common/Types/IPC";
import { HOYOPLAY_EXECUTION_PROVIDER } from "../../../src/Main/Data/Hoyoverse/hoyoplay";
import { STEAM_EXECUTION_PROVIDER } from "../../../src/Main/Data/Steam";
import {
  assert_launcher_install_plan_matches_request,
  create_launcher_install_plan_context,
} from "../../../src/Main/Execution/LauncherInstallPlan";

describe("launcher install Strategy plans", () => {
  it("keeps the installer-started Steam process on one DXMT runtime binding", () => {
    const request = create_request("steam", {
      dxmtVersionId: "dxmt-test",
      dxmtPackagePath: "/runtime/dxmt-test.tar.gz",
    });
    const plan = STEAM_EXECUTION_PROVIDER.strategies.install.describe(
      create_launcher_install_plan_context(),
      request,
    );

    expect(plan).toEqual(expect.objectContaining({
      launcher: "steam",
      runtime: {
        kind: "dxmt-wine",
        inheritance: "process-tree",
      },
      installer: expect.objectContaining({
        unsetEnvironment: expect.arrayContaining([
          "WINE_STEAMWEBHELPER_ARGS",
          "DXMT_CONFIG",
          "WINEMSYNC",
        ]),
      }),
      completion: {
        launcher: "steam",
        transitionReadiness: "launcher-executable",
      },
      transition: {
        kind: "adopt-existing",
        supervisor: {
          kind: "steam-session",
          watchGameProcessLog: true,
        },
      },
    }));
    expect(() => assert_launcher_install_plan_matches_request(plan, request)).not.toThrow();
  });

  it("restarts installed HoYoPlay through its supervised launch Strategy", () => {
    const request = create_request("hoyoplay");
    const plan = HOYOPLAY_EXECUTION_PROVIDER.strategies.install.describe(
      create_launcher_install_plan_context(),
      request,
    );

    expect(plan).toEqual(expect.objectContaining({
      launcher: "hoyoplay",
      runtime: {
        kind: "base-wine",
      },
      installer: {
        launchOptionsPreset: "hoyoplay",
        unsetEnvironment: [],
      },
      completion: {
        launcher: "hoyoplay",
        transitionReadiness: "installer-exit-or-launcher-process",
      },
      transition: {
        kind: "stop-and-relaunch",
        nextStrategyId: "hoyoplay.supervised-launch",
        supervisor: {
          kind: "hoyoplay-overseer",
          routeGamePrefixes: true,
        },
      },
    }));
    expect(HOYOPLAY_EXECUTION_PROVIDER.strategies.install
      .requirements(request)
      .map((requirement) => requirement.id))
      .toEqual(expect.arrayContaining([
        "wine.tool.wineserver",
        "wine.manifest.group.hoyo-routing",
        "wine.manifest.group.hoyo-network",
        "supervisor.hoyoplay-overseer",
      ]));
    expect(() => assert_launcher_install_plan_matches_request(plan, request)).not.toThrow();
  });
});

function create_request(
  launcher: InstallBottleLauncherPayload["launcher"],
  overrides: Partial<InstallBottleLauncherPayload> = {},
): InstallBottleLauncherPayload {
  return {
    bottleId: "bottle-test",
    bottleName: "Bottle Test",
    bottlePath: `/bottles/test/${launcher}-prefix`,
    wineVersionId: "wine-test",
    wineRuntimePath: "/runtime/wine-test",
    launcher,
    ...overrides,
  };
}
