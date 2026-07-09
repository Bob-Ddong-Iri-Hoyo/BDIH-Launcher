import { WebContents } from "electron";
import { spawn } from "child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "fs";
import { request as httpsRequest } from "https";
import os from "os";
import path from "path";
import { HOYOPLAY_WINDOWS_INSTALLER_URL, STEAM_WEBHELPER_ARGUMENTS, STEAM_WINDOWS_INSTALLER_URL } from "../../Common/Constant/RuntimeSources";
import {
  BottleLaunchOptionsPayload,
  BottleLauncherKind,
  BottlePrefixSessionPayload,
  BottleTaskResultPayload,
  BottleTaskStatusPayload,
  IPC_CHANNELS,
  InstallBottleLauncherPayload,
  RunBottleExecutablePayload,
  RunBottleExecutableResultPayload,
  SetupBottlePrefixPayload,
} from "../../Common/Types/IPC";
import type { WineLauncherOptionsManifest } from "../../Common/Types/Wine";
import {
  filter_launch_options_by_manifest,
  is_launch_option_supported_by_manifest,
  resolve_launch_options_for_app,
} from "../../Common/Util/LaunchOptions";
import {
  create_launcher_prefix_path,
  create_hoyo_game_prefix_path,
  hoyo_game_from_bottle_app,
} from "../../Common/Util/BottlePath";
import type { HoyoGameKind } from "../../Common/Util/BottlePath";
import {
  apply_wine_launcher_options_manifest_defaults,
  parse_wine_launcher_options_manifest,
} from "../../Common/Util/WineLauncherOptions";
import { ParamRunProgramReturn, runProgram } from "../Program/ChildProgram";
import { remove_quarantine_xattr } from "../Program/Xattr";
import { downloadManager } from "./DownloadManager";
import { processManager } from "./ProcessManager";
import { logManager } from "./LogManager";
import { preferenceManager } from "./PreferenceManager";
import { wineOverseer } from "./WineOverseer";
import type { HoyoOverseerEvent } from "./WineOverseer";
import { bottleManager } from "./BottleManager";
import { get_hoyo_game_profile, type HoyoGameProfile } from "../Data/Hoyoverse/HoyoGameProfile";

const LAUNCHER_EXECUTABLE_DETECT_TIMEOUT_MS = 10 * 60 * 1000;
const LAUNCHER_EXECUTABLE_DETECT_INTERVAL_MS = 1000;
const LAUNCHER_EXECUTABLE_STABLE_MS = 2000;
const PREFIX_SESSION_WATCH_DELAY_MS = 500;
const HOYO_STEAM_STUB_WIN_PATH = "C:\\windows\\system32\\steam.exe";
const DXMT_RUNTIME_CACHE_DIR_NAME = ".cache/dxmt";
const DXMT_PREFIX_REQUIRED_WINDOWS_FILES = ["d3d10core.dll", "d3d11.dll", "dxgi.dll", "winemetal.dll"];

interface PrefixSession {
  bottleId: string;
  bottleName: string;
  prefixPath: string;
  processId: string;
  launcher?: BottleLauncherKind;
  appId?: string;
  appName?: string;
  wineRuntimePath?: string;
  startedAt: string;
  sender?: WebContents;
  waiter?: ParamRunProgramReturn;
  ended: boolean;
}

/**
 * Runs Wine operations for bottle setup, launcher installs, and app execution.
 *
 * This class is deliberately process-oriented: it reports progress over IPC,
 * writes Wine logs through LogManager, and tracks active prefixes so shutdown or
 * cleanup can stop Wine processes cleanly.
 *
 * @see ./IPCManager.ts registers the bottle execution IPC handlers.
 */
export class BottleExecutionManager {
  private readonly logger = logManager.createLogger({ file: "wine", source: "bottle" });
  private readonly activeWinePrefixes = new Map<string, {
    bottleName: string;
    wineRuntimePath?: string;
  }>();
  private readonly prefixSessionsByPrefixPath = new Map<string, PrefixSession>();
  private readonly prefixSessionsByProcessId = new Map<string, PrefixSession>();

  async setupPrefix(
    request: SetupBottlePrefixPayload & { launcher?: BottleLauncherKind },
    sender?: WebContents,
  ): Promise<BottleTaskResultPayload> {
    // Prefix setup is the canonical creation path for a bottle. It creates the
    // WINEPREFIX, runs wineboot, records recipe metadata, and emits progress that
    // the renderer displays as setup/configure state.
    const bottlePath = expand_user_home_path(request.bottlePath);

    try {
      resolve_required_wine_tool(request.wineVersionId, request.wineRuntimePath, "wineboot");
      const shouldPrepareDxmt = should_prepare_dxmt_runtime(request);

      if (shouldPrepareDxmt) {
        validate_dxmt_runtime(request.dxmtVersionId, request.dxmtPackagePath);
      }
      this.trackWinePrefix(request);
      mkdirSync(bottlePath, { recursive: true });
      this.sendStatus(sender, {
        bottleId: request.bottleId,
        launcher: request.launcher,
        stage: "setup",
        progress: 5,
        message: `${request.bottleName} prefix directory created.`,
      });

      await this.runWineTool(
        request,
        "wineboot",
        ["-u"],
        "setup",
        10,
        70,
        sender,
        request.launcher,
      );

      if (shouldPrepareDxmt) {
        this.sendStatus(sender, {
          bottleId: request.bottleId,
          launcher: request.launcher,
          stage: "dxmt",
          progress: 72,
          message: "Preparing DXMT files for this Wine prefix.",
        });

        const dxmtRuntimePath = await resolve_dxmt_runtime_dir(
          request.dxmtPackagePath,
          request.dxmtVersionId,
          infer_hoyo_bottle_root_path(bottlePath),
          this.logger,
        );

        prepare_prefix_dxmt_runtime_files({
          dxmtRuntimePath,
          prefixPath: bottlePath,
        });
      }

      this.sendStatus(sender, {
        bottleId: request.bottleId,
        launcher: request.launcher,
        stage: "dxmt",
        progress: 82,
        message: shouldPrepareDxmt
          ? `DXMT ${request.dxmtVersionId} prepared as built-in bottle runtime.`
          : "DXMT built-in runtime skipped.",
      });
      writeFileSync(
        path.join(bottlePath, "bdih-bottle.json"),
        JSON.stringify(
          {
            schemaVersion: 1,
            id: request.bottleId,
            bottleId: request.bottleId,
            name: request.bottleName,
            bottleName: request.bottleName,
            path: bottlePath,
            wineVersionId: request.wineVersionId,
            wineRuntimePath: request.wineRuntimePath,
            dxmtVersionId: request.dxmtVersionId,
            dxmtPackagePath: request.dxmtPackagePath,
            status: "ready",
            apps: [],
            updatedAt: new Date().toISOString(),
          },
          null,
          2,
        ),
      );
      this.sendStatus(sender, {
        bottleId: request.bottleId,
        launcher: request.launcher,
        stage: "ready",
        progress: 100,
        message: `${request.bottleName} is ready.`,
      });

      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.sendStatus(sender, {
        bottleId: request.bottleId,
        launcher: request.launcher,
        stage: "error",
        progress: 0,
        message,
      });

      return {
        ok: false,
        error: message,
      };
    }
  }

  async installLauncher(
    request: InstallBottleLauncherPayload,
    sender?: WebContents,
  ): Promise<BottleTaskResultPayload> {
    try {
      const bottlePath = expand_user_home_path(request.bottlePath);

      if (!is_wine_prefix_ready(bottlePath)) {
        const setupResult = await this.setupPrefix(request, sender);

        if (!setupResult.ok) {
          throw new Error(setupResult.error || "Bottle prefix setup failed.");
        }
      } else {
        this.trackWinePrefix(request);
      }

      const installer = get_launcher_installer(request.launcher);
      const installerDir = path.join(bottlePath, "_bdih_installers");
      const installerPath = path.join(installerDir, installer.fileName);
      const installerMetadataPath = `${installerPath}.bdih.json`;

      mkdirSync(installerDir, { recursive: true });
      this.sendStatus(sender, {
        bottleId: request.bottleId,
        launcher: request.launcher,
        stage: "download",
        progress: 1,
        message: `${installer.label} download started.`,
      });

      const downloadPlan = await resolve_installer_download_plan(
        request.launcher,
        installer.url,
        installerPath,
        installerMetadataPath,
      );

      if (downloadPlan.shouldDownload) {
        if (existsSync(installerPath)) {
          rmSync(installerPath, { force: true });
        }

        await this.downloadInstaller(
          request.bottleId,
          request.launcher,
          installer.url,
          installerDir,
          installer.fileName,
          sender,
        );
        write_installer_metadata(installerMetadataPath, {
          url: installer.url,
          remoteSignature: downloadPlan.remoteSignature,
          downloadedAt: new Date().toISOString(),
        });
        this.sendStatus(sender, {
          bottleId: request.bottleId,
          launcher: request.launcher,
          stage: "ready",
          progress: 100,
          message: `${installer.label} installer downloaded. Click again to start it in Wine.`,
        });

        return { ok: true, refreshBottles: false };
      } else {
        this.sendStatus(sender, {
          bottleId: request.bottleId,
          launcher: request.launcher,
          stage: "install",
          progress: 8,
          message: `${installer.label} installer is ready. Starting in Wine.`,
        });
      }

      this.sendStatus(sender, {
        bottleId: request.bottleId,
        launcher: request.launcher,
        stage: "install",
        progress: 18,
        message: `${installer.label} installer is starting in Wine.`,
      });

      await this.launchInstallerExecutable(request, installerPath, installer.label, sender);
      const detectedExecutablePath = await this.waitForInstalledLauncherExecutable(request, installer.label, sender);

      this.sendStatus(sender, {
        bottleId: request.bottleId,
        launcher: request.launcher,
        stage: "ready",
        progress: 100,
        message: detectedExecutablePath
          ? `${installer.label} executable detected. App metadata will refresh shortly.`
          : `${installer.label} installer launched, but the launcher executable was not detected yet.`,
      });

      return { ok: true, refreshBottles: Boolean(detectedExecutablePath) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.sendStatus(sender, {
        bottleId: request.bottleId,
        launcher: request.launcher,
        stage: "error",
        progress: 0,
        message,
      });

      return {
        ok: false,
        error: message,
      };
    }
  }

  async runExecutable(
    request: RunBottleExecutablePayload,
    sender?: WebContents,
  ): Promise<RunBottleExecutableResultPayload> {
    const executablePath = request.executablePath.trim();

    if (!executablePath) {
      return {
        ok: false,
        error: "Executable path is required.",
      };
    }

    const bottlePath = expand_user_home_path(request.bottlePath);
    let wineCommand: string;

    try {
      wineCommand = resolve_required_wine_tool(request.wineVersionId, request.wineRuntimePath, "wine64");

      if (should_validate_dxmt_for_executable(request)) {
        validate_dxmt_runtime(request.dxmtVersionId, request.dxmtPackagePath);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      this.logger.warn("runtime dependency validation failed", {
        bottleId: request.bottleId,
        bottleName: request.bottleName,
        wineVersionId: request.wineVersionId,
        wineRuntimePath: request.wineRuntimePath,
        dxmtVersionId: request.dxmtVersionId,
        dxmtPackagePath: request.dxmtPackagePath,
        error: message,
      });

      return {
        ok: false,
        error: message,
      };
    }

    this.trackWinePrefix(request);
    const appName = request.appName?.trim() || app_name_from_executable_path(executablePath);
    const launcherOptionsManifest = request.launcherOptionsManifest ?? read_wine_launcher_options_manifest(request.wineRuntimePath);
    const launchOptions = filter_launch_options_by_manifest(
      resolve_launch_options_for_app(
        {
          id: request.appId ?? "",
          name: appName,
          source: undefined,
          executablePath,
          steamAppId: steam_app_id_from_args(request.executableArgs),
        },
        request.launchOptions,
      ),
      launcherOptionsManifest,
    ) ?? {};
    const appLogFileName = create_wine_app_log_file_name(request.bottleName, appName, request.bottleId, request.appId);
    const appLogger = logManager.createLogger({
      file: "wine",
      fileName: appLogFileName,
      source: appName,
      sessionId: `${logManager.getSessionName()}:${appLogFileName.replace(/\.log$/i, "")}`,
      sessionKind: "bottle",
      bottleId: request.bottleId,
      bottleName: request.bottleName,
    });
    const processId = `bottle:${request.bottleId}:${request.appId ?? "manual"}:${Date.now().toString(36)}`;
    const preference = await preferenceManager.getPreference();
    const hoyoGameKind = hoyo_game_from_run_request(request, appName, executablePath);

    if (hoyoGameKind) {
      const directLaunchOptions = filter_launch_options_by_manifest(
        resolve_launch_options_for_app(
          {
            id: request.appId ?? `hoyo:${hoyoGameKind}`,
            name: appName,
            source: "game",
            executablePath,
            steamAppId: steam_app_id_from_args(request.executableArgs),
          },
          coerce_hoyo_direct_launch_options(request.launchOptions, hoyoGameKind),
        ),
        launcherOptionsManifest,
      ) ?? {};
      const strategyContext = {
        request,
        executablePath,
        appName,
        appLogger,
        wineCommand,
        processId,
        launchOptions: directLaunchOptions,
        preference,
        gameKind: hoyoGameKind,
      };

      return hoyoGameKind === "zzz"
        ? this.runHoyoZzzExecutable(strategyContext, sender)
        : hoyoGameKind === "hsr"
          ? this.runHoyoHsrExecutable(strategyContext, sender)
          : this.runHoyoGenshinExecutable(strategyContext, sender);
    }

    if (should_use_hoyo_overseer_launch(request, appName, executablePath)) {
      return this.runHoyoOverseer(
        {
          request,
          executablePath,
          appName,
          appLogger,
          wineCommand,
          processId,
          launchOptions,
          preference,
        },
        sender,
      );
    }

    const launcherSessionKind = launcher_from_run_request(request, executablePath);
    let effectiveWineCommand = wineCommand;
    let effectiveWineRuntimePath = request.wineRuntimePath;
    let effectiveLauncherOptionsManifest = launcherOptionsManifest;

    const env = create_wine_environment(
      bottlePath,
      preference.debugFlagMode,
      preference.loggingLevel,
      preference.wineDebugArgs,
      effectiveWineRuntimePath,
      effectiveLauncherOptionsManifest,
    );

    apply_launch_options_to_env(env, launchOptions);

    await ensure_prefix_dxmt_runtime_files(request, bottlePath, appLogger);

    const supportsSteamWebHelperArgs = is_launch_option_supported_by_manifest("steamWebHelperArgs", effectiveLauncherOptionsManifest);

    if (
      supportsSteamWebHelperArgs &&
      (
        launchOptions.steamWebHelperArgs === true ||
        (request.launchOptions?.steamWebHelperArgs === undefined && should_apply_steam_webhelper_args(request))
      )
    ) {
      env.WINE_STEAMWEBHELPER_ARGS = STEAM_WEBHELPER_ARGUMENTS;
    }

    try {
      await apply_wine_registry_launch_options(effectiveWineCommand, bottlePath, launchOptions, appLogger);
      const executableArgs = executable_args_with_launch_options(
        executablePath,
        request.executableArgs ?? [],
        launchOptions,
      );
      const process = processManager.startProcess(processId, {
        command: effectiveWineCommand,
        args: [
          normalize_executable_path(executablePath),
          ...executableArgs,
        ],
        cwd: get_process_cwd(executablePath, bottlePath),
        env,
        onLog: (data) => appLogger.info("stdout", data.trim()),
        onError: (data) => appLogger.warn("stderr", data.trim()),
      });
      const prefixSessionProcessId = launcherSessionKind
        ? this.startPrefixSession(
            {
              ...request,
              wineRuntimePath: effectiveWineRuntimePath,
            },
            {
              launcher: launcherSessionKind,
              appId: request.appId ?? launcherSessionKind,
              appName,
            },
            sender,
          )
        : undefined;

      process.done.then(
        (code) => {
          const exitError = code === 0 ? undefined : `Wine exited with code ${code}.`;
          const exitPayload = exitError ? { processId, code, error: exitError } : { processId, code };

          if (exitError) {
            appLogger.error("bottle app executable exited with error", { processId, code });
          } else {
            appLogger.info("bottle app executable exited", { processId, code });
          }

          sender?.send(IPC_CHANNELS.BOTTLE.PROCESS_EXIT.channelName, exitPayload);
        },
        (error) => {
          const message = error instanceof Error ? error.message : String(error);
          appLogger.error("bottle app executable failed", { processId, error: message });
          sender?.send(IPC_CHANNELS.BOTTLE.PROCESS_EXIT.channelName, { processId, error: message });
        },
      );
      appLogger.info("bottle app executable started", {
        bottleId: request.bottleId,
        bottleName: request.bottleName,
        appId: request.appId,
        appName,
        wineVersionId: request.wineVersionId,
        wineCommand: effectiveWineCommand,
        executablePath,
        launchOptions,
      });
      this.logger.info("bottle executable started", {
        bottleId: request.bottleId,
        bottleName: request.bottleName,
        appId: request.appId,
        appName,
        wineVersionId: request.wineVersionId,
        wineCommand: effectiveWineCommand,
        executablePath,
        launchOptions,
      });
      request_wine_window_foreground(appName);

      const earlyExit = await wait_for_early_process_exit(
        process.done,
        launchOptions.earlyExitWaitMs ?? 1200,
      );

      if (earlyExit?.error) {
        return {
          ok: false,
          error: earlyExit.error,
        };
      }

      if (typeof earlyExit?.code === "number") {
        return {
          ok: false,
          error: earlyExit.code === 0
            ? "HoYo Star Rail exited immediately with code 0. This usually means Jadeite/Wine handed off no persistent game process."
            : `Wine exited with code ${earlyExit.code}.`,
        };
      }

      return {
        ok: true,
        processId: prefixSessionProcessId ?? processId,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error("failed to start bottle executable", {
        bottleId: request.bottleId,
        executablePath,
        error: message,
      });

      return {
        ok: false,
        error: message,
      };
    }
  }

  private async runHoyoOverseer(
    context: {
      request: RunBottleExecutablePayload;
      executablePath: string;
      appName: string;
      appLogger: ReturnType<typeof logManager.createLogger>;
      wineCommand: string;
      processId: string;
      launchOptions: BottleLaunchOptionsPayload;
      preference: Awaited<ReturnType<typeof preferenceManager.getPreference>>;
    },
    sender?: WebContents,
  ): Promise<RunBottleExecutableResultPayload> {
    const {
      request,
      executablePath,
      appName,
      appLogger,
      wineCommand,
      processId,
      launchOptions,
      preference,
    } = context;
    const receivedPrefixPath = expand_user_home_path(request.bottlePath);
    const bottleRootPath = infer_hoyo_bottle_root_path(receivedPrefixPath);
    const launcherPrefixPath = create_launcher_prefix_path(bottleRootPath, "hoyoplay");
    const hoyoplayExecutablePath = launcher_executable_candidates("hoyoplay", launcherPrefixPath)
      .find((candidatePath) => existsSync(candidatePath));

    if (!hoyoplayExecutablePath) {
      return {
        ok: false,
        error: `HoYoPlay is not installed in this bottle. Install HoYoPlay first: ${launcherPrefixPath}`,
      };
    }

    try {
      const wineRoot = resolve_wine_runtime_root(request.wineRuntimePath, wineCommand);

      assert_hoyo_overseer_supported_wine(request.wineRuntimePath, wineRoot);

      let prefixSessionProcessId = "";
      const wineBinCommand = resolve_wine_bin_tool(wineRoot, wineCommand);
      const wineserverCommand = resolve_wine_tool(request.wineRuntimePath, "wineserver");

      await wineOverseer.startHoyoPlay({
        processId,
        launcherPrefixPath,
        wineCommand,
        wineBinCommand,
        wineserverCommand,
        wineRootPath: wineRoot,
        hoyoplayExecutablePath,
        dataRootPath: expand_user_home_path(preference.dataRootPath),
        launchOptions,
        wineDebug: resolve_wine_debug_env(
          preference.debugFlagMode,
          preference.loggingLevel,
          preference.wineDebugArgs,
        ),
        onEvent: (event) => this.dispatchHoyoOverseerEvent(
          event,
          {
            request,
            bottleRootPath,
            wineCommand,
            launchOptions,
            preference,
          },
          sender,
        ),
        onExit: (code) => {
          const exitError = code === 0 ? undefined : `HoYoPlay exited with code ${code}.`;

          if (exitError) {
            appLogger.warn("HoYoPlay overseer exited with error", { processId, code });
          } else {
            appLogger.info("HoYoPlay overseer exited", { processId, code });
          }

          sender?.send(IPC_CHANNELS.BOTTLE.PROCESS_EXIT.channelName, {
            processId: prefixSessionProcessId || processId,
            code,
            error: exitError,
          });
        },
        onError: (error) => {
          appLogger.error("HoYoPlay overseer failed", {
            processId,
            error: error.message,
          });
          sender?.send(IPC_CHANNELS.BOTTLE.PROCESS_EXIT.channelName, {
            processId: prefixSessionProcessId || processId,
            error: error.message,
          });
        },
      });

      prefixSessionProcessId = this.startPrefixSession(
        {
          ...request,
          bottlePath: launcherPrefixPath,
        },
        {
          launcher: "hoyoplay",
          appId: request.appId ?? "hoyoplay",
          appName,
        },
        sender,
      );
      appLogger.info("HoYoPlay overseer session started", {
        processId,
        prefixSessionProcessId,
        bottleId: request.bottleId,
        bottleName: request.bottleName,
        launcherPrefixPath,
        hoyoplayExecutablePath,
        requestedExecutablePath: executablePath,
      });
      request_wine_window_foreground([
        appName,
        "HoYoPlay",
        "launcher",
        "Wine",
      ]);

      return {
        ok: true,
        processId: prefixSessionProcessId,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      appLogger.error("failed to start HoYoPlay overseer", {
        bottleId: request.bottleId,
        executablePath,
        launcherPrefixPath,
        error: message,
      });

      return {
        ok: false,
        error: message,
      };
    }
  }

  private async dispatchHoyoOverseerEvent(
    event: HoyoOverseerEvent,
    context: {
      request: RunBottleExecutablePayload;
      bottleRootPath: string;
      wineCommand: string;
      launchOptions: BottleLaunchOptionsPayload;
      preference: Awaited<ReturnType<typeof preferenceManager.getPreference>>;
    },
    sender?: WebContents,
  ): Promise<void> {
    const appId = hoyo_game_app_id(event.game);
    const appName = hoyo_game_display_name(event.game);
    const executableArgs = hoyo_overseer_executable_args(event.game, event.stubArgs);
    const appLogFileName = create_wine_app_log_file_name(context.request.bottleName, appName, context.request.bottleId, appId);
    const appLogger = logManager.createLogger({
      file: "wine",
      fileName: appLogFileName,
      source: appName,
      sessionId: `${logManager.getSessionName()}:${appLogFileName.replace(/\.log$/i, "")}`,
      sessionKind: "bottle",
      bottleId: context.request.bottleId,
      bottleName: context.request.bottleName,
    });

    const eventRequest = {
      ...context.request,
      bottlePath: create_hoyo_game_prefix_path(context.bottleRootPath, event.game),
      appId,
      appName,
      executablePath: event.targetWin,
      executableArgs,
    };
    const eventLaunchOptions = filter_launch_options_by_manifest(
      resolve_launch_options_for_app(
        {
          id: appId,
          name: appName,
          source: "game",
          executablePath: event.targetWin,
        },
        coerce_hoyo_direct_launch_options(context.request.launchOptions, event.game),
      ),
      context.request.launcherOptionsManifest ?? read_wine_launcher_options_manifest(context.request.wineRuntimePath),
    ) ?? {};
    const strategyContext = {
      request: eventRequest,
      executablePath: event.targetWin,
      appName,
      appLogger,
      wineCommand: context.wineCommand,
      processId: `bottle:${context.request.bottleId}:${appId}:${Date.now().toString(36)}`,
      launchOptions: eventLaunchOptions,
      preference: context.preference,
      gameKind: event.game,
    };
    const result = event.game === "zzz"
      ? await this.runHoyoZzzExecutable(strategyContext, sender)
      : event.game === "hsr"
        ? await this.runHoyoHsrExecutable(strategyContext, sender)
        : await this.runHoyoGenshinExecutable(strategyContext, sender);

    if (!result.ok) {
      sender?.send(IPC_CHANNELS.BOTTLE.PROCESS_EXIT.channelName, {
        processId: `overseer-event:${context.request.bottleId}:${event.game}:${Date.now().toString(36)}`,
        error: result.error ?? `${appName} launch failed.`,
      });
    }
  }

  private async registerLaunchedHoyoApp(params: {
    request: RunBottleExecutablePayload;
    gameKind: HoyoGameKind;
    appName: string;
    gameHostPath: string;
    executableArgs?: string[];
    launchOptions: BottleLaunchOptionsPayload;
    appLogger: ReturnType<typeof logManager.createLogger>;
  }): Promise<void> {
    const { request, gameKind, appName, gameHostPath, executableArgs, launchOptions, appLogger } = params;
    const bottleRootPath = infer_hoyo_bottle_root_path(expand_user_home_path(request.bottlePath));
    const appId = hoyo_game_app_id(gameKind);

    try {
      await bottleManager.upsertBottleApp({
        bottleId: request.bottleId,
        bottleName: request.bottleName,
        bottlePath: bottleRootPath,
        wineVersionId: request.wineVersionId,
        dxmtVersionId: request.dxmtVersionId,
        jadeiteVersionId: request.jadeiteVersionId,
        iconExecutablePath: gameHostPath,
        app: {
          id: appId,
          name: appName,
          subtitle: "HoYoverse game",
          wineVersionId: request.wineVersionId,
          executablePath: wine_z_path(gameHostPath),
          executableArgs: executableArgs && executableArgs.length > 0 ? executableArgs : undefined,
          launchOptions,
          source: "game",
          lastPlayed: new Date().toLocaleString(),
          status: "ready",
        },
      });
    } catch (error) {
      appLogger.warn("failed to register launched HoYo game in bottle metadata", {
        bottleId: request.bottleId,
        bottleName: request.bottleName,
        appId,
        gameHostPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async runHoyoZzzExecutable(
    context: {
      request: RunBottleExecutablePayload;
      executablePath: string;
      appName: string;
      appLogger: ReturnType<typeof logManager.createLogger>;
      wineCommand: string;
      processId: string;
      launchOptions: BottleLaunchOptionsPayload;
      preference: Awaited<ReturnType<typeof preferenceManager.getPreference>>;
      gameKind: HoyoGameKind;
    },
    sender?: WebContents,
  ): Promise<RunBottleExecutableResultPayload> {
    const {
      request,
      executablePath,
      appName,
      appLogger,
      processId,
      launchOptions,
      preference,
      gameKind,
    } = context;
    const gameProfile = get_hoyo_game_profile(gameKind);
    const receivedPrefixPath = expand_user_home_path(request.bottlePath);
    const gamePrefixPath = normalize_hoyo_game_prefix_path(receivedPrefixPath, gameKind);
    const gameHostPath = host_path_from_hoyo_executable_path(receivedPrefixPath, gamePrefixPath, executablePath);

    if (!gameHostPath || !existsSync(gameHostPath)) {
      return {
        ok: false,
        error: `HoYo game executable was not found on disk: ${executablePath}`,
      };
    }

    try {
      const bottleRootPath = infer_hoyo_bottle_root_path(receivedPrefixPath);
      const runtimeRequest = request_with_bottle_runtime_lock(request, bottleRootPath);
      const effectiveWineCommand = resolve_required_wine_tool(
        runtimeRequest.wineVersionId,
        runtimeRequest.wineRuntimePath,
        "wine64",
      );
      const wineRoot = resolve_wine_runtime_root(runtimeRequest.wineRuntimePath, effectiveWineCommand);

      assert_hoyo_overseer_supported_wine(runtimeRequest.wineRuntimePath, wineRoot);

      const dataRootPath = expand_user_home_path(preference.dataRootPath);
      const dxmtRuntimePath = await resolve_dxmt_runtime_dir(
        runtimeRequest.dxmtPackagePath,
        runtimeRequest.dxmtVersionId,
        bottleRootPath,
        appLogger,
      );
      const effectiveRequest = { ...runtimeRequest, wineRuntimePath: wineRoot };

      const gameWinPath = wine_z_path(gameHostPath);
      const gameHostDir = path.dirname(gameHostPath);
      const gameExe = path.basename(gameHostPath);
      const env = create_wine_environment(
        gamePrefixPath,
        preference.debugFlagMode,
        preference.loggingLevel,
        preference.wineDebugArgs,
        effectiveRequest.wineRuntimePath,
      );
      const zzzLaunchOptions = {
        enableMsync: true,
        enableTimeoutFix: true,
        ...gameProfile.launchRoutine.defaultLaunchOptions,
        ...launchOptions,
      };
      const executableArgs = request.executableArgs ?? gameProfile.launchRoutine.defaultExecutableArgs ?? [];

      apply_launch_options_to_env(env, zzzLaunchOptions);
      Object.assign(env, {
        WINEPREFIX: gamePrefixPath,
        WINE_ROOT: wineRoot,
        BDHI_DATA_ROOT: dataRootPath,
        GAME_PREFIX: gamePrefixPath,
        GAME_ROOT: gameHostDir,
        GAME_HOST: gameHostDir,
        GAME_EXE: gameExe,
        GAME_WIN: gameWinPath,
        WINEDLLOVERRIDES: env.WINEDLLOVERRIDES ?? "",
        WINE_ENABLE_TIMEOUT_FIX: env.WINE_ENABLE_TIMEOUT_FIX ?? "1",
        WINEMSYNC: env.WINEMSYNC ?? "1",
        DXMT_LOG_PATH: env.DXMT_LOG_PATH ?? dataRootPath,
        GST_PLUGIN_FEATURE_RANK: env.GST_PLUGIN_FEATURE_RANK ?? "atdec:MAX,avdec_h264:MAX",
        WINE_ENABLE_DISCONNECT: env.WINE_ENABLE_DISCONNECT ?? "0",
        WAIT_FOR_MANUAL_NETWORK_CUT: env.WAIT_FOR_MANUAL_NETWORK_CUT ?? "0",
        AUTO_NETWORK_CUT: env.AUTO_NETWORK_CUT ?? "0",
        WINE_ALLOW_HOYOPROTECT_SERVICE: env.WINE_ALLOW_HOYOPROTECT_SERVICE ?? "1",
        WINE_BLOCK_HOYOPROTECT_SERVICE: env.WINE_BLOCK_HOYOPROTECT_SERVICE ?? "0",
        WINE_HOYO_GAME: env.WINE_HOYO_GAME ?? "zzz",
        WINE_HOYO_SET_STEAM_ENV: env.WINE_HOYO_SET_STEAM_ENV ?? "1",
        WINE_HOYO_STEAM_APPID_ZZZ: env.WINE_HOYO_STEAM_APPID_ZZZ ?? "4162040",
      });

      await this.bootstrapHoyoGamePrefix(effectiveRequest, effectiveWineCommand, gamePrefixPath, appLogger, env);

      const protonExtrasPath = resolve_protonextras_root(wineRoot);
      env.DXMT_DIR = dxmtRuntimePath;
      env.PROTONEXTRAS = protonExtrasPath;
      apply_hoyo_dxmt_config_environment(env, {
        dataRootPath,
        dxmtRuntimePath,
        gamePrefixPath,
        launchOptions: zzzLaunchOptions,
      });

      await apply_wine_registry_launch_options(effectiveWineCommand, gamePrefixPath, zzzLaunchOptions, appLogger);
      prepare_hoyo_zzz_runtime_files({
        dxmtRuntimePath,
        gamePrefixPath,
        protonExtrasPath,
        wineRoot,
      });
      await clear_hoyo_zzz_webview_override(effectiveWineCommand, gamePrefixPath, appLogger);

      const process = processManager.startProcess(processId, {
        command: effectiveWineCommand,
        args: [
          HOYO_STEAM_STUB_WIN_PATH,
          gameWinPath,
          ...executableArgs,
        ],
        cwd: gameHostDir,
        env: without_env_keys(env, [
          "SteamAppId",
          "SteamGameId",
          "SteamOverlayGameId",
          "SteamClientLaunch",
          "SteamEnv",
          "UMU_ID",
          "UMU_USE_STEAM",
          "WINE_HOYO_CHILD_STUB",
          "WINE_HOYO_STUB_ZZZ",
          "WINE_HOYO_STUB_STARRAIL",
          "WINE_HOYO_STUB_GENSHIN",
          "WINE_HOYO_STUB_LOG",
          "WINE_HOYO_EVENT_PIPE",
          "WINE_HOYO_EVENT_SESSION",
          "WINE_HOYO_STUB_DROP_ARGS",
          "WINE_HOYO_STUB_TERMINATE_PARENT",
          "WINE_HOYO_STUB_LOG_ONLY",
          "WINE_HOYO_STUB_ROUTE_ONLY",
          "WINE_HOYO_STUB_REPORT_DISABLE",
        ]),
        onLog: (data) => appLogger.info("stdout", data.trim()),
        onError: (data) => appLogger.warn("stderr", data.trim()),
      });
      await this.registerLaunchedHoyoApp({
        request,
        gameKind,
        appName,
        gameHostPath,
        executableArgs,
        launchOptions: zzzLaunchOptions,
        appLogger,
      });
      const prefixSessionProcessId = this.startPrefixSession(
        {
          ...effectiveRequest,
          bottlePath: gamePrefixPath,
        },
        {
          launcher: "hoyoplay",
          appId: hoyo_game_app_id(gameKind),
          appName,
        },
        sender,
      );

      process.done.then(
        (code) => {
          const exitError = code === 0 ? undefined : `Wine exited with code ${code}.`;
          const exitPayload = exitError ? { processId, code, error: exitError } : { processId, code };

          if (exitError) {
            appLogger.error("HoYo ZZZ executable exited with error", { processId, code });
          } else {
            appLogger.info("HoYo ZZZ executable exited", { processId, code });
          }

          sender?.send(IPC_CHANNELS.BOTTLE.PROCESS_EXIT.channelName, exitPayload);
        },
        (error) => {
          const message = error instanceof Error ? error.message : String(error);
          appLogger.error("HoYo ZZZ executable failed", { processId, error: message });
          sender?.send(IPC_CHANNELS.BOTTLE.PROCESS_EXIT.channelName, { processId, error: message });
        },
      );
      appLogger.info("HoYo ZZZ executable started with Steam stub route", {
        bottleId: request.bottleId,
        bottleName: request.bottleName,
        appId: request.appId,
        appName,
        wineVersionId: request.wineVersionId,
        wineCommand: effectiveWineCommand,
        wineRoot,
        gamePrefixPath,
        gameHostPath,
        gameWinPath,
        dxmtRuntimePath,
        protonExtrasPath,
        launchOptions: zzzLaunchOptions,
      });
      this.logger.info("HoYo ZZZ executable started", {
        bottleId: request.bottleId,
        bottleName: request.bottleName,
        appId: request.appId,
        gamePrefixPath,
        executablePath,
      });
      request_wine_window_foreground([
        appName,
        "ZenlessZoneZero",
        "Zenless Zone Zero",
        "Wine",
      ]);

      const earlyExit = await wait_for_early_process_exit(
        process.done,
        zzzLaunchOptions.earlyExitWaitMs ?? 5000,
      );

      if (earlyExit?.error) {
        return {
          ok: false,
          error: earlyExit.error,
        };
      }

      if (typeof earlyExit?.code === "number" && earlyExit.code !== 0) {
        return {
          ok: false,
          error: `Wine exited with code ${earlyExit.code}.`,
        };
      }

      return {
        ok: true,
        processId: prefixSessionProcessId,
        refreshBottles: true,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      appLogger.error("failed to start HoYo ZZZ executable", {
        bottleId: request.bottleId,
        executablePath,
        gamePrefixPath,
        error: message,
      });

      return {
        ok: false,
        error: message,
      };
    }
  }

  private async runHoyoHsrExecutable(
    context: {
      request: RunBottleExecutablePayload;
      executablePath: string;
      appName: string;
      appLogger: ReturnType<typeof logManager.createLogger>;
      wineCommand: string;
      processId: string;
      launchOptions: BottleLaunchOptionsPayload;
      preference: Awaited<ReturnType<typeof preferenceManager.getPreference>>;
      gameKind: HoyoGameKind;
    },
    sender?: WebContents,
  ): Promise<RunBottleExecutableResultPayload> {
    const {
      request,
      executablePath,
      appName,
      appLogger,
      processId,
      launchOptions,
      preference,
      gameKind,
    } = context;
    const gameProfile = get_hoyo_game_profile(gameKind);
    const receivedPrefixPath = expand_user_home_path(request.bottlePath);
    const gamePrefixPath = normalize_hoyo_game_prefix_path(receivedPrefixPath, gameKind);
    const gameHostPath = host_path_from_hoyo_executable_path(receivedPrefixPath, gamePrefixPath, executablePath);

    if (!gameHostPath || !existsSync(gameHostPath)) {
      return {
        ok: false,
        error: `Star Rail executable was not found on disk: ${executablePath}`,
      };
    }

    try {
      const bottleRootPath = infer_hoyo_bottle_root_path(receivedPrefixPath);
      const runtimeRequest = request_with_bottle_runtime_lock(request, bottleRootPath);
      const effectiveWineCommand = resolve_required_wine_tool(
        runtimeRequest.wineVersionId,
        runtimeRequest.wineRuntimePath,
        "wine64",
      );
      const wineRoot = resolve_wine_runtime_root(runtimeRequest.wineRuntimePath, effectiveWineCommand);

      assert_hoyo_overseer_supported_wine(runtimeRequest.wineRuntimePath, wineRoot);

      const dataRootPath = expand_user_home_path(preference.dataRootPath);
      const dxmtRuntimePath = await resolve_dxmt_runtime_dir(
        runtimeRequest.dxmtPackagePath,
        runtimeRequest.dxmtVersionId,
        bottleRootPath,
        appLogger,
      );
      const effectiveRequest = { ...runtimeRequest, wineRuntimePath: wineRoot };

      const gameWinPath = wine_z_path(gameHostPath);
      const gameHostDir = path.dirname(gameHostPath);
      const gameExe = path.basename(gameHostPath);
      const jadeite = resolve_jadeite_runtime(dataRootPath, request.jadeiteRuntimePath);
      const jadeiteWinPath = wine_z_path(jadeite.executablePath);
      const steamClientPath = path.join(gamePrefixPath, "drive_c", "Program Files (x86)", "Steam");
      const env = create_wine_environment(
        gamePrefixPath,
        preference.debugFlagMode,
        preference.loggingLevel,
        preference.wineDebugArgs,
        effectiveRequest.wineRuntimePath,
      );
      const hsrLaunchOptions = {
        ...gameProfile.launchRoutine.defaultLaunchOptions,
        ...launchOptions,
      };

      apply_launch_options_to_env(env, hsrLaunchOptions);
      Object.assign(env, {
        WINEPREFIX: gamePrefixPath,
        WINE_ROOT: wineRoot,
        BDHI_DATA_ROOT: dataRootPath,
        GAME_PREFIX: gamePrefixPath,
        GAME_ROOT: gameHostDir,
        GAME_HOST: gameHostDir,
        GAME_EXE: gameExe,
        GAME_WIN: gameWinPath,
        WINEDLLOVERRIDES: "",
        WINE_ENABLE_TIMEOUT_FIX: env.WINE_ENABLE_TIMEOUT_FIX ?? "1",
        WINE_ENABLE_DISCONNECT: env.WINE_ENABLE_DISCONNECT ?? "1",
        WINE_HOYO_DISCONNECT_SECONDS: env.WINE_HOYO_DISCONNECT_SECONDS ?? "15",
        WINEMSYNC: env.WINEMSYNC ?? "1",
        DXMT_LOG_PATH: env.DXMT_LOG_PATH ?? dataRootPath,
        DXMT_CONFIG: env.DXMT_CONFIG ?? gameProfile.launchRoutine.dxmtConfig,
        DXMT_ENABLE_NVEXT: env.DXMT_ENABLE_NVEXT ?? (gameProfile.launchRoutine.dxmtEnableNvExt ? "1" : "0"),
        GST_PLUGIN_FEATURE_RANK: env.GST_PLUGIN_FEATURE_RANK ?? "atdec:MAX,avdec_h264:MAX",
        JADEITE_ALLOW_UNKNOWN: env.JADEITE_ALLOW_UNKNOWN ?? "1",
        JADEITE_DEBUG: env.JADEITE_DEBUG ?? "0",
        WINE_DISABLE_VULKAN_OPWR: env.WINE_DISABLE_VULKAN_OPWR ?? "1",
        WINE_ALLOW_HOYOPROTECT_SERVICE: env.WINE_ALLOW_HOYOPROTECT_SERVICE ?? "1",
        WINE_BLOCK_HOYOPROTECT_SERVICE: env.WINE_BLOCK_HOYOPROTECT_SERVICE ?? "0",
        WINE_HOYOPROTECT_SERVER_FAKE: env.WINE_HOYOPROTECT_SERVER_FAKE ?? "0",
        WINE_HOYOPROTECT_FAKE_FALLBACK: env.WINE_HOYOPROTECT_FAKE_FALLBACK ?? "0",
        WINE_HOYOPROTECT_PASSTHROUGH: env.WINE_HOYOPROTECT_PASSTHROUGH ?? "0",
        WINE_HOYOPROTECT_IOCTL_FIX: env.WINE_HOYOPROTECT_IOCTL_FIX ?? "0",
        WINE_HOYOPROTECT_CREATE_CONTEXT: env.WINE_HOYOPROTECT_CREATE_CONTEXT ?? "0",
        WINE_HOYOPROTECT_USER_FAKE: env.WINE_HOYOPROTECT_USER_FAKE ?? "0",
        WINE_HOYOPROTECT_USER_FAKE_FAILED: env.WINE_HOYOPROTECT_USER_FAKE_FAILED ?? "0",
        WINE_HOYOPROTECT_FAKE_ZERO: env.WINE_HOYOPROTECT_FAKE_ZERO ?? "0",
      });
      Object.assign(env, resolve_gstreamer_environment(wineRoot, dataRootPath));

      await this.bootstrapHoyoGamePrefix(effectiveRequest, effectiveWineCommand, gamePrefixPath, appLogger, env);

      const protonExtrasPath = resolve_protonextras_root(wineRoot);
      env.DXMT_DIR = dxmtRuntimePath;
      env.PROTONEXTRAS = protonExtrasPath;
      apply_hoyo_dxmt_config_environment(env, {
        dataRootPath,
        dxmtRuntimePath,
        gamePrefixPath,
        launchOptions: hsrLaunchOptions,
      });

      await apply_wine_registry_launch_options(effectiveWineCommand, gamePrefixPath, hsrLaunchOptions, appLogger);
      if (gameProfile.launchRoutine.applyNvExtensionRegistry) {
        await apply_hsr_nv_extension_registry(effectiveWineCommand, gamePrefixPath, appLogger, env);
      }
      prepare_hoyo_builtin_dxmt_runtime_files({
        dxmtRuntimePath,
        gamePrefixPath,
        protonExtrasPath,
        wineRoot,
      });
      prepare_hoyo_optional_dxmt_windows_runtime_files({
        dxmtRuntimePath,
        fileNames: gameProfile.launchRoutine.optionalDxmtWindowsFiles ?? [],
        gamePrefixPath,
        wineRoot,
      });
      mkdirSync(path.join(steamClientPath, "steamapps"), { recursive: true });

      const restoreGameDxmt = stash_game_local_dxmt_files(gameHostDir, gamePrefixPath, appLogger);
      const restoreRemovedFiles = stash_hoyo_removed_runtime_files(
        gameProfile,
        gameHostDir,
        gamePrefixPath,
        appLogger,
      );
      const restoreRuntimeFiles = () => {
        restoreGameDxmt();
        restoreRemovedFiles();
      };
      const executableArgs = request.executableArgs && request.executableArgs.length > 0
        ? request.executableArgs
        : gameProfile.launchRoutine.defaultExecutableArgs ?? [];
      Object.assign(env, {
        SteamClientLaunch: env.SteamClientLaunch ?? "1",
        SteamEnv: env.SteamEnv ?? "1",
        UMU_USE_STEAM: env.UMU_USE_STEAM ?? "1",
        UMU_ID: env.UMU_ID ?? "umu-honkai-star-rail",
        STEAM_COMPAT_INSTALL_PATH: env.STEAM_COMPAT_INSTALL_PATH ?? gameHostDir,
        STEAM_COMPAT_CLIENT_INSTALL_PATH: env.STEAM_COMPAT_CLIENT_INSTALL_PATH ?? steamClientPath,
        STEAM_COMPAT_LIBRARY_PATHS: env.STEAM_COMPAT_LIBRARY_PATHS ?? path.dirname(gameHostDir),
      });
      const process = processManager.startProcess(processId, {
        command: effectiveWineCommand,
        args: [
          HOYO_STEAM_STUB_WIN_PATH,
          jadeiteWinPath,
          gameWinPath,
          "--",
          ...executableArgs,
        ],
        cwd: jadeite.rootPath,
        env: without_env_keys(env, [
          "WINE_HOYO_CHILD_STUB",
          "WINE_HOYO_CHILD_STUB_DISABLE",
          "WINE_HOYO_STUB_ZZZ",
          "WINE_HOYO_STUB_STARRAIL",
          "WINE_HOYO_STUB_GENSHIN",
          "WINE_HOYO_STUB_LOG",
          "WINE_HOYO_EVENT_PIPE",
          "WINE_HOYO_EVENT_SESSION",
          "WINE_HOYO_STUB_DROP_ARGS",
          "WINE_HOYO_STUB_TERMINATE_PARENT",
          "WINE_HOYO_STUB_LOG_ONLY",
          "WINE_HOYO_STUB_ROUTE_ONLY",
          "WINE_HOYO_STUB_REPORT_DISABLE",
          "WINE_HOYO_GAME",
          "WINE_HOYO_SET_STEAM_ENV",
          "WINE_HOYO_STEAM_APPID",
          "WINE_HOYO_STEAM_APPID_ZZZ",
          "WINE_HOYO_STEAM_APPID_STARRAIL",
          "WINE_HOYO_STEAM_APPID_GENSHIN",
        ]),
        onLog: (data) => appLogger.info("stdout", data.trim()),
        onError: (data) => appLogger.warn("stderr", data.trim()),
      });
      await this.registerLaunchedHoyoApp({
        request,
        gameKind,
        appName,
        gameHostPath,
        executableArgs,
        launchOptions: hsrLaunchOptions,
        appLogger,
      });
      const prefixSessionProcessId = this.startPrefixSession(
        {
          ...effectiveRequest,
          bottlePath: gamePrefixPath,
        },
        {
          launcher: "hoyoplay",
          appId: hoyo_game_app_id(gameKind),
          appName,
        },
        sender,
      );

      process.done.then(restoreRuntimeFiles, restoreRuntimeFiles);
      process.done.then(
        (code) => {
          const exitError = code === 0 ? undefined : `Wine exited with code ${code}.`;
          const exitPayload = exitError ? { processId, code, error: exitError } : { processId, code };

          if (exitError) {
            appLogger.error("HoYo Star Rail executable exited with error", { processId, code });
          } else {
            appLogger.info("HoYo Star Rail executable exited", { processId, code });
          }

          sender?.send(IPC_CHANNELS.BOTTLE.PROCESS_EXIT.channelName, exitPayload);
        },
        (error) => {
          const message = error instanceof Error ? error.message : String(error);
          appLogger.error("HoYo Star Rail executable failed", { processId, error: message });
          sender?.send(IPC_CHANNELS.BOTTLE.PROCESS_EXIT.channelName, { processId, error: message });
        },
      );
      appLogger.info("HoYo Star Rail executable started with Jadeite", {
        bottleId: request.bottleId,
        bottleName: request.bottleName,
        appId: request.appId,
        appName,
        wineVersionId: request.wineVersionId,
        wineCommand: effectiveWineCommand,
        gamePrefixPath,
        gameHostPath,
        gameWinPath,
        jadeiteRootPath: jadeite.rootPath,
        jadeiteWinPath,
        dxmtRuntimePath,
        launchOptions,
      });
      request_wine_window_foreground([
        appName,
        "StarRail",
        "Honkai: Star Rail",
        "Jadeite",
        "Wine",
      ]);

      const earlyExit = await wait_for_early_process_exit(
        process.done,
        launchOptions.earlyExitWaitMs ?? 5000,
      );

      if (earlyExit?.error) {
        return {
          ok: false,
          error: earlyExit.error,
        };
      }

      if (typeof earlyExit?.code === "number" && earlyExit.code !== 0) {
        return {
          ok: false,
          error: `Wine exited with code ${earlyExit.code}.`,
        };
      }

      return {
        ok: true,
        processId: prefixSessionProcessId,
        refreshBottles: true,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      appLogger.error("failed to start HoYo Star Rail executable", {
        bottleId: request.bottleId,
        executablePath,
        gamePrefixPath,
        error: message,
      });

      return {
        ok: false,
        error: message,
      };
    }
  }

  private async runHoyoGenshinExecutable(
    context: {
      request: RunBottleExecutablePayload;
      executablePath: string;
      appName: string;
      appLogger: ReturnType<typeof logManager.createLogger>;
      wineCommand: string;
      processId: string;
      launchOptions: BottleLaunchOptionsPayload;
      preference: Awaited<ReturnType<typeof preferenceManager.getPreference>>;
      gameKind: HoyoGameKind;
    },
    sender?: WebContents,
  ): Promise<RunBottleExecutableResultPayload> {
    const {
      request,
      executablePath,
      appName,
      appLogger,
      processId,
      launchOptions,
      preference,
      gameKind,
    } = context;
    const gameProfile = get_hoyo_game_profile(gameKind);
    const receivedPrefixPath = expand_user_home_path(request.bottlePath);
    const gamePrefixPath = normalize_hoyo_game_prefix_path(receivedPrefixPath, gameKind);
    const gameHostPath = host_path_from_hoyo_executable_path(receivedPrefixPath, gamePrefixPath, executablePath);

    if (!gameHostPath || !existsSync(gameHostPath)) {
      return {
        ok: false,
        error: `Genshin executable was not found on disk: ${executablePath}`,
      };
    }

    try {
      const bottleRootPath = infer_hoyo_bottle_root_path(receivedPrefixPath);
      const runtimeRequest = request_with_bottle_runtime_lock(request, bottleRootPath);
      const effectiveWineCommand = resolve_required_wine_tool(
        runtimeRequest.wineVersionId,
        runtimeRequest.wineRuntimePath,
        "wine64",
      );
      const wineRoot = resolve_wine_runtime_root(runtimeRequest.wineRuntimePath, effectiveWineCommand);

      assert_hoyo_overseer_supported_wine(runtimeRequest.wineRuntimePath, wineRoot);

      const dataRootPath = expand_user_home_path(preference.dataRootPath);
      const dxmtRuntimePath = await resolve_dxmt_runtime_dir(
        runtimeRequest.dxmtPackagePath,
        runtimeRequest.dxmtVersionId,
        bottleRootPath,
        appLogger,
      );
      const effectiveRequest = { ...runtimeRequest, wineRuntimePath: wineRoot };

      const gameWinPath = wine_z_path(gameHostPath);
      const gameHostDir = path.dirname(gameHostPath);
      const gameExe = path.basename(gameHostPath);
      const env = create_wine_environment(
        gamePrefixPath,
        preference.debugFlagMode,
        preference.loggingLevel,
        preference.wineDebugArgs,
        effectiveRequest.wineRuntimePath,
      );

      const genshinLaunchOptions = {
        ...gameProfile.launchRoutine.defaultLaunchOptions,
        ...launchOptions,
        enableMsync: false,
        enableTimeoutFix: false,
        networkGate: false,
      };

      apply_launch_options_to_env(env, genshinLaunchOptions);
      Object.assign(env, {
        WINEPREFIX: gamePrefixPath,
        WINE_ROOT: wineRoot,
        BDHI_DATA_ROOT: dataRootPath,
        GAME_PREFIX: gamePrefixPath,
        GAME_ROOT: gameHostDir,
        GAME_HOST: gameHostDir,
        GAME_EXE: gameExe,
        GAME_WIN: gameWinPath,
        WINEDLLOVERRIDES: "",
        WINE_ENABLE_TIMEOUT_FIX: env.WINE_ENABLE_TIMEOUT_FIX ?? "0",
        WINE_ENABLE_DISCONNECT: env.WINE_ENABLE_DISCONNECT ?? "0",
        WAIT_FOR_MANUAL_NETWORK_CUT: env.WAIT_FOR_MANUAL_NETWORK_CUT ?? "0",
        AUTO_NETWORK_CUT: env.AUTO_NETWORK_CUT ?? "0",
        WINEMSYNC: env.WINEMSYNC ?? "0",
        WINEESYNC: env.WINEESYNC ?? "1",
        DXMT_LOG_PATH: env.DXMT_LOG_PATH ?? dataRootPath,
        DXMT_CONFIG: env.DXMT_CONFIG ?? gameProfile.launchRoutine.dxmtConfig,
        GST_PLUGIN_FEATURE_RANK: env.GST_PLUGIN_FEATURE_RANK ?? "atdec:MAX,avdec_h264:MAX",
      });
      apply_hoyo_profile_wine_auto_args_environment(env, gameProfile);
      if (env.WINE_HOYO_GENSHIN_ARGS) {
        env.WINE_HOYO_GENSHIN_ARGS_DISABLE = env.WINE_HOYO_GENSHIN_ARGS_DISABLE ?? "0";
      } else {
        env.WINE_HOYO_GENSHIN_ARGS_DISABLE = "1";
      }

      await this.bootstrapHoyoGamePrefix(effectiveRequest, effectiveWineCommand, gamePrefixPath, appLogger, env);

      const protonExtrasPath = resolve_protonextras_root(wineRoot);
      env.DXMT_DIR = dxmtRuntimePath;
      env.PROTONEXTRAS = protonExtrasPath;
      apply_hoyo_dxmt_config_environment(env, {
        dataRootPath,
        dxmtRuntimePath,
        gamePrefixPath,
        launchOptions: genshinLaunchOptions,
      });

      await apply_wine_registry_launch_options(effectiveWineCommand, gamePrefixPath, genshinLaunchOptions, appLogger);
      prepare_hoyo_builtin_dxmt_runtime_files({
        dxmtRuntimePath,
        gamePrefixPath,
        protonExtrasPath,
        wineRoot,
      });

      const restoreGameDxmt = stash_game_local_dxmt_files(gameHostDir, gamePrefixPath, appLogger);
      const restoreRemovedFiles = stash_hoyo_removed_runtime_files(
        gameProfile,
        gameHostDir,
        gamePrefixPath,
        appLogger,
      );
      const restoreRuntimeFiles = () => {
        restoreGameDxmt();
        restoreRemovedFiles();
      };
      const executableArgs = request.executableArgs ?? gameProfile.launchRoutine.defaultExecutableArgs ?? [];
      const process = processManager.startProcess(processId, {
        command: effectiveWineCommand,
        args: [
          HOYO_STEAM_STUB_WIN_PATH,
          gameWinPath,
          ...executableArgs,
        ],
        cwd: gameHostDir,
        env: without_env_keys(env, [
          "SteamAppId",
          "SteamGameId",
          "SteamOverlayGameId",
          "SteamClientLaunch",
          "SteamEnv",
          "WINEMSYNC",
          "WINEFSYNC",
          "UMU_ID",
          "UMU_USE_STEAM",
          "WINE_ALLOW_HOYOPROTECT_SERVICE",
          "WINE_BLOCK_HOYOPROTECT_SERVICE",
          "WINE_HOYO_CHILD_STUB",
          "WINE_HOYO_CHILD_STUB_DISABLE",
          "WINE_HOYO_STUB_ZZZ",
          "WINE_HOYO_STUB_STARRAIL",
          "WINE_HOYO_STUB_GENSHIN",
          "WINE_HOYO_STUB_LOG",
          "WINE_HOYO_EVENT_PIPE",
          "WINE_HOYO_EVENT_SESSION",
          "WINE_HOYO_STUB_DROP_ARGS",
          "WINE_HOYO_STUB_TERMINATE_PARENT",
          "WINE_HOYO_STUB_LOG_ONLY",
          "WINE_HOYO_STUB_ROUTE_ONLY",
          "WINE_HOYO_STUB_REPORT_DISABLE",
          "WINE_HOYO_GAME",
          "WINE_HOYO_SET_STEAM_ENV",
          "WINE_HOYO_STEAM_APPID",
          "WINE_HOYO_STEAM_APPID_ZZZ",
          "WINE_HOYO_STEAM_APPID_STARRAIL",
          "WINE_HOYO_STEAM_APPID_GENSHIN",
        ]),
        onLog: (data) => appLogger.info("stdout", data.trim()),
        onError: (data) => appLogger.warn("stderr", data.trim()),
      });
      await this.registerLaunchedHoyoApp({
        request,
        gameKind,
        appName,
        gameHostPath,
        executableArgs,
        launchOptions: genshinLaunchOptions,
        appLogger,
      });
      const prefixSessionProcessId = this.startPrefixSession(
        {
          ...effectiveRequest,
          bottlePath: gamePrefixPath,
        },
        {
          launcher: "hoyoplay",
          appId: hoyo_game_app_id(gameKind),
          appName,
        },
        sender,
      );

      process.done.then(restoreRuntimeFiles, restoreRuntimeFiles);
      process.done.then(
        (code) => {
          const exitError = code === 0 ? undefined : `Wine exited with code ${code}.`;
          const exitPayload = exitError ? { processId, code, error: exitError } : { processId, code };

          if (exitError) {
            appLogger.error("HoYo Genshin executable exited with error", { processId, code });
          } else {
            appLogger.info("HoYo Genshin executable exited", { processId, code });
          }

          sender?.send(IPC_CHANNELS.BOTTLE.PROCESS_EXIT.channelName, exitPayload);
        },
        (error) => {
          const message = error instanceof Error ? error.message : String(error);
          appLogger.error("HoYo Genshin executable failed", { processId, error: message });
          sender?.send(IPC_CHANNELS.BOTTLE.PROCESS_EXIT.channelName, { processId, error: message });
        },
      );
      appLogger.info("HoYo Genshin executable started", {
        bottleId: request.bottleId,
        bottleName: request.bottleName,
        appId: request.appId,
        appName,
        wineVersionId: request.wineVersionId,
        wineCommand: effectiveWineCommand,
        gamePrefixPath,
        gameHostPath,
        gameWinPath,
        dxmtRuntimePath,
        launchOptions: genshinLaunchOptions,
      });
      request_wine_window_foreground([
        appName,
        "GenshinImpact",
        "YuanShen",
        "Genshin Impact",
        "Wine",
      ]);

      const earlyExit = await wait_for_early_process_exit(
        process.done,
        genshinLaunchOptions.earlyExitWaitMs ?? 5000,
      );

      if (earlyExit?.error) {
        return {
          ok: false,
          error: earlyExit.error,
        };
      }

      if (typeof earlyExit?.code === "number" && earlyExit.code !== 0) {
        return {
          ok: false,
          error: `Wine exited with code ${earlyExit.code}.`,
        };
      }

      return {
        ok: true,
        processId: prefixSessionProcessId,
        refreshBottles: true,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      appLogger.error("failed to start HoYo Genshin executable", {
        bottleId: request.bottleId,
        executablePath,
        gamePrefixPath,
        error: message,
      });

      return {
        ok: false,
        error: message,
      };
    }
  }

  private async bootstrapHoyoGamePrefix(
    request: RunBottleExecutablePayload,
    wineCommand: string,
    gamePrefixPath: string,
    appLogger: ReturnType<typeof logManager.createLogger>,
    sourceEnv?: NodeJS.ProcessEnv | Record<string, string>,
  ): Promise<void> {
    const bottleRootPath = infer_hoyo_bottle_root_path(gamePrefixPath);
    const runtimeRequest = request_with_bottle_runtime_lock(request, bottleRootPath);
    let dxmtRuntimePath: string | undefined;

    if (runtimeRequest.dxmtVersionId) {
      validate_dxmt_runtime(runtimeRequest.dxmtVersionId, runtimeRequest.dxmtPackagePath);
      dxmtRuntimePath = await resolve_dxmt_runtime_dir(
        runtimeRequest.dxmtPackagePath,
        runtimeRequest.dxmtVersionId,
        bottleRootPath,
        appLogger,
      );
    }

    if (is_wine_prefix_ready(gamePrefixPath) && (!dxmtRuntimePath || is_prefix_dxmt_runtime_ready(gamePrefixPath, dxmtRuntimePath))) {
      return;
    }

    quarantine_invalid_wine_prefix(gamePrefixPath, appLogger);
    mkdirSync(gamePrefixPath, { recursive: true });

    const winebootCommand = resolve_required_wine_tool(runtimeRequest.wineVersionId, runtimeRequest.wineRuntimePath, "wineboot");
    const baseEnv = create_wine_helper_environment(sourceEnv, gamePrefixPath);

    appLogger.info("bootstrapping HoYo game prefix", { gamePrefixPath });
    if (!is_wine_prefix_ready(gamePrefixPath)) {
      await run_wine_command_best_effort(winebootCommand, ["-u"], gamePrefixPath, baseEnv, appLogger);
      await run_wine_command_best_effort(wineCommand, ["winecfg", "-v", "win10"], gamePrefixPath, baseEnv, appLogger);
    }

    if (dxmtRuntimePath) {
      prepare_prefix_dxmt_runtime_files({
        dxmtRuntimePath,
        prefixPath: gamePrefixPath,
      });
    }

    await stop_wine_prefix_best_effort(gamePrefixPath, runtimeRequest.wineRuntimePath, appLogger);

    if (!is_wine_prefix_ready(gamePrefixPath)) {
      throw new Error(`Wine prefix bootstrap did not produce a valid prefix: ${gamePrefixPath}`);
    }
  }

  private async launchInstallerExecutable(
    request: InstallBottleLauncherPayload,
    executablePath: string,
    installerLabel: string,
    sender?: WebContents,
  ): Promise<void> {
    const bottlePath = expand_user_home_path(request.bottlePath);
    const appName = `${installerLabel} Installer`;
    const appLogFileName = create_wine_app_log_file_name(request.bottleName, appName, request.bottleId, `installer:${request.launcher}`);
    const appLogger = logManager.createLogger({
      file: "wine",
      fileName: appLogFileName,
      source: appName,
      sessionId: `${logManager.getSessionName()}:${appLogFileName.replace(/\.log$/i, "")}`,
      sessionKind: "bottle",
      bottleId: request.bottleId,
      bottleName: request.bottleName,
    });
    const preference = await preferenceManager.getPreference();
    const command = resolve_required_wine_tool(request.wineVersionId, request.wineRuntimePath, "wine64");
    const processId = `bottle:${request.bottleId}:installer:${request.launcher}:${Date.now().toString(36)}`;
    const launcherOptionsManifest = request.launcherOptionsManifest ?? read_wine_launcher_options_manifest(request.wineRuntimePath);
    const env = create_wine_environment(
      bottlePath,
      preference.debugFlagMode,
      preference.loggingLevel,
      preference.wineDebugArgs,
      request.wineRuntimePath,
      launcherOptionsManifest,
    );

    if (request.launcher === "steam") {
      delete env.WINE_STEAMWEBHELPER_ARGS;
      delete env.DXMT_CONFIG;
      delete env.DXMT_CONFIG_FILE;
      delete env.DXMT_ENABLE_NVEXT;
      delete env.DXMT_LOG_LEVEL;
      delete env.DXMT_LOG_PATH;
      env.WINEMSYNC = env.WINEMSYNC ?? "1";
    }

    if (request.launcher === "hoyoplay") {
      apply_launch_options_to_env(
        env,
        filter_launch_options_by_manifest(
          resolve_launch_options_for_app(
            {
              id: "hoyoplay",
              name: "HoYoPlay",
              source: "launcher",
              executablePath,
            },
            { presetId: "hoyoplay" },
          ),
          launcherOptionsManifest,
        ) ?? {},
      );
    }

    appLogger.info("launcher installer environment prepared", {
      launcher: request.launcher,
      wineVersionId: request.wineVersionId,
      hasLauncherOptionsManifest: Boolean(launcherOptionsManifest),
      appliedLaunchEnv: pick_launch_option_env(env),
    });

    const process = processManager.startProcess(processId, {
      command,
      args: [normalize_executable_path(executablePath)],
      cwd: bottlePath,
      env,
      onLog: (data) => appLogger.info("stdout", data.trim()),
      onError: (data) => appLogger.warn("stderr", data.trim()),
    });
    this.startPrefixSession(
      request,
      {
        launcher: request.launcher,
        appId: request.launcher,
        appName: installerLabel,
      },
      sender,
    );

    process.done.then(
      (code) => {
        if (code === 0) {
          appLogger.info("installer process exited", { processId, code });
          return;
        }

        appLogger.warn("installer process exited with non-zero code", { processId, code });
      },
      (error) => {
        appLogger.warn("installer process failed after launch", {
          processId,
          error: error instanceof Error ? error.message : String(error),
        });
      },
    );
    appLogger.info("installer process launched", {
      processId,
      bottleId: request.bottleId,
      bottleName: request.bottleName,
      launcher: request.launcher,
      wineVersionId: request.wineVersionId,
      executablePath,
      command,
    });
    request_wine_window_foreground([
      installerLabel,
      `${installerLabel} Installer`,
      path.basename(executablePath),
      path.basename(executablePath).replace(/\.exe$/i, ""),
    ]);
  }

  private async waitForInstalledLauncherExecutable(
    request: InstallBottleLauncherPayload,
    installerLabel: string,
    sender?: WebContents,
  ): Promise<string | undefined> {
    const bottlePath = expand_user_home_path(request.bottlePath);
    const candidates = launcher_executable_candidates(request.launcher, bottlePath);
    const startedAt = Date.now();
    let lastProgressUpdate = 0;

    while (Date.now() - startedAt < LAUNCHER_EXECUTABLE_DETECT_TIMEOUT_MS) {
      const detectedPath = candidates.find((candidatePath) => existsSync(candidatePath));

      if (detectedPath && await is_stable_launcher_executable(detectedPath, LAUNCHER_EXECUTABLE_STABLE_MS)) {
        this.sendStatus(sender, {
          bottleId: request.bottleId,
          launcher: request.launcher,
          stage: "install",
          progress: 96,
          message: `${installerLabel} executable detected: ${detectedPath}`,
        });
        return detectedPath;
      }

      const elapsedMs = Date.now() - startedAt;

      if (elapsedMs - lastProgressUpdate >= 5000) {
        lastProgressUpdate = elapsedMs;
        this.sendStatus(sender, {
          bottleId: request.bottleId,
          launcher: request.launcher,
          stage: "install",
          progress: Math.min(95, 74 + Math.floor(elapsedMs / 30_000)),
          message: `Waiting for ${installerLabel} executable to appear in the prefix...`,
        });
      }

      await delay(LAUNCHER_EXECUTABLE_DETECT_INTERVAL_MS);
    }

    this.sendStatus(sender, {
      bottleId: request.bottleId,
      launcher: request.launcher,
      stage: "install",
      progress: 95,
      message: `${installerLabel} installer was launched, but the executable was not detected yet.`,
    });

    return undefined;
  }

  async stopAllWineProcesses(): Promise<void> {
    // App shutdown uses this broad cleanup path. ProcessManager stops child
    // processes first, then wineserver is asked to terminate each tracked prefix.
    const prefixes = [...this.activeWinePrefixes.entries()];

    if (prefixes.length === 0) {
      await processManager.stopAll();
      return;
    }

    this.logger.info("stopping active Wine processes", {
      count: prefixes.length,
      prefixes: prefixes.map(([bottlePath, context]) => ({
        bottlePath,
        bottleName: context.bottleName,
      })),
    });

    await processManager.stopAll();
    await Promise.all(
      prefixes.map(([bottlePath, context]) =>
        this.stopWinePrefix(bottlePath, context.wineRuntimePath),
      ),
    );
    this.activeWinePrefixes.clear();
  }

  hasActiveWineProcesses(): boolean {
    return this.activeWinePrefixes.size > 0 || processManager.listRunningProcessIds().length > 0;
  }

  async stopProcess(processId: string): Promise<void> {
    const prefixSession = this.prefixSessionsByProcessId.get(processId);

    if (prefixSession) {
      await this.stopWinePrefix(prefixSession.prefixPath, prefixSession.wineRuntimePath);
      await prefixSession.waiter?.Stop().catch(() => undefined);
      this.finishPrefixSession(prefixSession);
      return;
    }

    await processManager.stopProcess(processId);
  }

  private trackWinePrefix(request: Pick<SetupBottlePrefixPayload, "bottlePath" | "bottleName" | "wineRuntimePath">): void {
    const bottlePath = prefix_session_key(request.bottlePath);

    this.activeWinePrefixes.set(bottlePath, {
      bottleName: request.bottleName,
      wineRuntimePath: request.wineRuntimePath,
    });
  }

  private stopWinePrefix(bottlePath: string, wineRuntimePath?: string): Promise<void> {
    return new Promise((resolve) => {
      const command = resolve_wine_tool(wineRuntimePath, "wineserver");
      const killer = spawn(command, ["-k"], {
        cwd: bottlePath,
        env: {
          ...process.env,
          WINEPREFIX: bottlePath,
        },
        shell: false,
        detached: false,
        windowsHide: true,
        stdio: "ignore",
      });
      const timeout = setTimeout(() => {
        killer.kill("SIGKILL");
        resolve();
      }, 1500);

      killer.on("close", () => {
        clearTimeout(timeout);
        resolve();
      });
      killer.on("error", (error) => {
        clearTimeout(timeout);
        this.logger.warn("failed to stop Wine prefix", {
          bottlePath,
          error: error instanceof Error ? error.message : String(error),
        });
        resolve();
      });
    });
  }

  private startPrefixSession(
    request: Pick<SetupBottlePrefixPayload, "bottleId" | "bottleName" | "bottlePath" | "wineRuntimePath">,
    context: {
      launcher?: BottleLauncherKind;
      appId?: string;
      appName?: string;
    },
    sender?: WebContents,
  ): string {
    const prefixPath = prefix_session_key(request.bottlePath);
    const existingSession = this.prefixSessionsByPrefixPath.get(prefixPath);

    if (existingSession && !existingSession.ended) {
      existingSession.sender = sender ?? existingSession.sender;
      existingSession.launcher = context.launcher ?? existingSession.launcher;
      existingSession.appId = context.appId ?? existingSession.appId;
      existingSession.appName = context.appName ?? existingSession.appName;
      this.sendPrefixSessionUpdate(existingSession, true);
      return existingSession.processId;
    }

    const processId = `prefix-session:${request.bottleId}:${context.launcher ?? context.appId ?? "app"}:${Date.now().toString(36)}`;
    const session: PrefixSession = {
      bottleId: request.bottleId,
      bottleName: request.bottleName,
      prefixPath,
      processId,
      launcher: context.launcher,
      appId: context.appId,
      appName: context.appName,
      wineRuntimePath: request.wineRuntimePath,
      startedAt: new Date().toISOString(),
      sender,
      ended: false,
    };

    this.prefixSessionsByPrefixPath.set(prefixPath, session);
    this.prefixSessionsByProcessId.set(processId, session);
    this.activeWinePrefixes.set(prefixPath, {
      bottleName: request.bottleName,
      wineRuntimePath: request.wineRuntimePath,
    });
    this.sendPrefixSessionUpdate(session, true);
    this.logger.info("prefix session started", {
      processId,
      bottleId: request.bottleId,
      bottleName: request.bottleName,
      prefixPath,
      launcher: context.launcher,
      appId: context.appId,
    });

    setTimeout(() => this.startPrefixSessionWaiter(session), PREFIX_SESSION_WATCH_DELAY_MS);
    return processId;
  }

  private startPrefixSessionWaiter(session: PrefixSession): void {
    if (session.ended) {
      return;
    }

    try {
      const command = resolve_wine_tool(session.wineRuntimePath, "wineserver");
      const waiter = runProgram({
        command,
        args: ["-w"],
        cwd: session.prefixPath,
        env: {
          WINEPREFIX: session.prefixPath,
        },
        onLog: (data) => this.logger.info("wineserver -w stdout", data.trim()),
        onError: (data) => this.logger.warn("wineserver -w stderr", data.trim()),
      });

      session.waiter = waiter;
      waiter.done.then(
        (code) => {
          this.finishPrefixSession(
            session,
            code === 0 ? undefined : `wineserver -w exited with code ${code}.`,
          );
        },
        (error) => {
          this.finishPrefixSession(
            session,
            error instanceof Error ? error.message : String(error),
          );
        },
      );
    } catch (error) {
      this.finishPrefixSession(
        session,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private finishPrefixSession(session: PrefixSession, error?: string): void {
    if (session.ended) {
      return;
    }

    session.ended = true;
    this.prefixSessionsByPrefixPath.delete(session.prefixPath);
    this.prefixSessionsByProcessId.delete(session.processId);
    this.activeWinePrefixes.delete(session.prefixPath);
    this.logger.info("prefix session ended", {
      processId: session.processId,
      bottleId: session.bottleId,
      bottleName: session.bottleName,
      prefixPath: session.prefixPath,
      launcher: session.launcher,
      appId: session.appId,
      error,
    });
    this.sendPrefixSessionUpdate(session, false, error);
  }

  private sendPrefixSessionUpdate(
    session: PrefixSession,
    isRunning: boolean,
    error?: string,
  ): void {
    const sender = session.sender;

    if (!sender || sender.isDestroyed()) {
      return;
    }

    const payload: BottlePrefixSessionPayload = {
      bottleId: session.bottleId,
      bottleName: session.bottleName,
      prefixPath: session.prefixPath,
      processId: session.processId,
      isRunning,
      launcher: session.launcher,
      appId: session.appId,
      appName: session.appName,
      startedAt: session.startedAt,
      endedAt: isRunning ? undefined : new Date().toISOString(),
      error,
    };

    sender.send(IPC_CHANNELS.BOTTLE.PREFIX_SESSION_UPDATE.channelName, payload);
  }

  private async runWineTool(
    request: SetupBottlePrefixPayload,
    toolName: "wineboot" | "wine64",
    args: string[],
    stage: BottleTaskStatusPayload["stage"],
    startProgress: number,
    endProgress: number,
    sender?: WebContents,
    launcher?: BottleLauncherKind,
  ): Promise<void> {
    const command = resolve_required_wine_tool(request.wineVersionId, request.wineRuntimePath, toolName);
    const bottlePath = expand_user_home_path(request.bottlePath);
    const preference = await preferenceManager.getPreference();
    const processId = `bottle:${request.bottleId}:${toolName}:${Date.now().toString(36)}`;
    const env = create_wine_environment(
      bottlePath,
      preference.debugFlagMode,
      preference.loggingLevel,
      preference.wineDebugArgs,
      request.wineRuntimePath,
    );
    const process = processManager.startProcess(processId, {
      command,
      args,
      cwd: bottlePath,
      env,
      onLog: (data) => this.logger.info(`${toolName} stdout`, data.trim()),
      onError: (data) => this.logger.warn(`${toolName} stderr`, data.trim()),
    });

    this.sendStatus(sender, {
      bottleId: request.bottleId,
      launcher,
      stage,
      progress: startProgress,
      message: `${toolName} started.`,
    });

    const code = await process.done;

    if (code !== 0) {
      throw new Error(`${toolName} exited with code ${code}.`);
    }

    this.sendStatus(sender, {
      bottleId: request.bottleId,
      launcher,
      stage,
      progress: endProgress,
      message: `${toolName} completed.`,
    });
  }

  private downloadInstaller(
    bottleId: string,
    launcher: BottleLauncherKind,
    url: string,
    outputDir: string,
    fileName: string,
    sender?: WebContents,
  ): Promise<void> {
    const downloadId = `bottle-installer:${bottleId}:${launcher}`;

    return new Promise((resolve, reject) => {
      downloadManager.startDownload(
        downloadId,
        url,
        {
          outputDir,
          fileName,
        },
        {
          onProgress: (progress) => {
            this.sendStatus(sender, {
              bottleId,
              launcher,
              stage: "download",
              progress: Math.min(98, Math.max(2, progress)),
              message: `${get_launcher_installer(launcher).label} downloading ${Math.round(progress)}%.`,
            });
          },
          onEnd: (success) => {
            if (!success) {
              reject(new Error(`${get_launcher_installer(launcher).label} download failed.`));
              return;
            }

            resolve();
          },
          onError: reject,
        },
      );
    });
  }

  private sendStatus(
    sender: WebContents | undefined,
    payload: BottleTaskStatusPayload,
  ): void {
    sender?.send(IPC_CHANNELS.BOTTLE.STATUS_UPDATE.channelName, payload);
  }
}

function resolve_wine_tool(wineRuntimePath: string | undefined, toolName: "wineboot" | "wine64" | "wineserver"): string {
  const resolvedRuntimePath = wineRuntimePath ? expand_user_home_path(wineRuntimePath) : "";
  const alternativeToolName = toolName === "wine64" ? "wine" : toolName;
  const runtimeRoots = [
    resolvedRuntimePath,
    strip_archive_extension(resolvedRuntimePath),
  ].filter((candidate, index, candidates): candidate is string => Boolean(candidate) && candidates.indexOf(candidate) === index);
  const candidates = runtimeRoots.flatMap((runtimeRoot) => [
    runtimeRoot,
    path.join(runtimeRoot, "bin", toolName),
    path.join(runtimeRoot, "bin", alternativeToolName),
    path.join(runtimeRoot, "Contents", "Resources", "wine", "bin", toolName),
    path.join(runtimeRoot, "Contents", "Resources", "wine", "bin", alternativeToolName),
    path.join(runtimeRoot, "Contents", "MacOS", toolName),
    path.join(runtimeRoot, "Contents", "MacOS", alternativeToolName),
  ]);

  for (const candidate of candidates) {
    if (is_executable_file(candidate)) {
      return candidate;
    }
  }

  if (resolvedRuntimePath) {
    throw new Error(`Wine runtime is not ready: ${resolvedRuntimePath}. Install or extract this Wine version first.`);
  }

  return toolName;
}

function resolve_required_wine_tool(
  wineVersionId: string,
  wineRuntimePath: string | undefined,
  toolName: "wineboot" | "wine64",
): string {
  if (!wineRuntimePath) {
    throw new Error(`Wine runtime is not installed or extracted: ${wineVersionId}. Install this Wine version before launching.`);
  }

  return resolve_wine_tool(wineRuntimePath, toolName);
}

function is_wine_prefix_ready(bottlePath: string): boolean {
  const windowsPath = path.join(bottlePath, "drive_c", "windows");
  const system32Path = path.join(windowsPath, "system32");
  const syswow64Path = path.join(windowsPath, "syswow64");
  const hasRegistry = existsSync(path.join(bottlePath, "system.reg")) || existsSync(path.join(bottlePath, "user.reg"));
  const hasKernel32 = existsSync(path.join(system32Path, "kernel32.dll")) ||
    existsSync(path.join(syswow64Path, "kernel32.dll"));

  return hasRegistry && existsSync(system32Path) && hasKernel32;
}

function quarantine_invalid_wine_prefix(
  prefixPath: string,
  logger: ReturnType<typeof logManager.createLogger>,
): void {
  if (!existsSync(prefixPath) || is_wine_prefix_ready(prefixPath)) {
    return;
  }

  const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const quarantineBasePath = `${prefixPath}.invalid-${timestamp}`;
  let quarantinePath = quarantineBasePath;
  let suffix = 1;

  while (existsSync(quarantinePath)) {
    quarantinePath = `${quarantineBasePath}-${suffix}`;
    suffix += 1;
  }

  try {
    renameSync(prefixPath, quarantinePath);
    logger.warn("invalid Wine prefix moved aside before bootstrap", {
      prefixPath,
      quarantinePath,
    });
  } catch (error) {
    rmSync(prefixPath, { recursive: true, force: true });
    logger.warn("invalid Wine prefix removed before bootstrap after quarantine failed", {
      prefixPath,
      quarantinePath,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function launcher_executable_candidates(launcher: BottleLauncherKind, bottlePath: string): string[] {
  if (launcher === "steam") {
    return [
      path.join(bottlePath, "drive_c", "Program Files (x86)", "Steam", "steam.exe"),
      path.join(bottlePath, "drive_c", "Program Files (x86)", "Steam", "Steam.exe"),
      path.join(bottlePath, "drive_c", "Program Files", "Steam", "steam.exe"),
      path.join(bottlePath, "drive_c", "Program Files", "Steam", "Steam.exe"),
    ];
  }

  return [
    path.join(bottlePath, "drive_c", "Program Files", "HoYoPlay", "launcher.exe"),
    path.join(bottlePath, "drive_c", "Program Files", "HoYoPlay", "HoYoPlay.exe"),
    path.join(bottlePath, "drive_c", "Program Files (x86)", "HoYoPlay", "launcher.exe"),
    path.join(bottlePath, "drive_c", "Program Files (x86)", "HoYoPlay", "HoYoPlay.exe"),
  ];
}

async function is_stable_launcher_executable(targetPath: string, stableMs: number): Promise<boolean> {
  try {
    const before = statSync(targetPath);

    if (!before.isFile() || before.size <= 0) {
      return false;
    }

    await delay(stableMs);

    const after = statSync(targetPath);

    return after.isFile() && after.size === before.size && after.mtimeMs === before.mtimeMs;
  } catch {
    return false;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface InstallerDownloadPlan {
  shouldDownload: boolean;
  remoteSignature?: string;
}

interface InstallerMetadata {
  url?: string;
  remoteSignature?: string;
  downloadedAt?: string;
}

async function resolve_installer_download_plan(
  launcher: BottleLauncherKind,
  url: string,
  installerPath: string,
  metadataPath: string,
): Promise<InstallerDownloadPlan> {
  const remoteSignature = launcher === "steam"
    ? await read_remote_file_signature(url)
    : undefined;

  if (!existsSync(installerPath)) {
    return {
      shouldDownload: true,
      remoteSignature,
    };
  }

  if (launcher !== "steam" || !remoteSignature) {
    return {
      shouldDownload: false,
      remoteSignature,
    };
  }

  const metadata = read_installer_metadata(metadataPath);

  return {
    shouldDownload: metadata?.remoteSignature !== remoteSignature,
    remoteSignature,
  };
}

function read_installer_metadata(metadataPath: string): InstallerMetadata | undefined {
  try {
    const parsed = JSON.parse(readFileSync(metadataPath, "utf8")) as unknown;

    if (!is_plain_record(parsed)) {
      return undefined;
    }

    return {
      url: typeof parsed.url === "string" ? parsed.url : undefined,
      remoteSignature: typeof parsed.remoteSignature === "string" ? parsed.remoteSignature : undefined,
      downloadedAt: typeof parsed.downloadedAt === "string" ? parsed.downloadedAt : undefined,
    };
  } catch {
    return undefined;
  }
}

function write_installer_metadata(metadataPath: string, metadata: InstallerMetadata): void {
  try {
    writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), "utf8");
  } catch {
    // Installer metadata is a freshness hint. Downloaded installers can still run without it.
  }
}

function read_remote_file_signature(url: string, redirectCount = 0): Promise<string | undefined> {
  if (redirectCount > 4) {
    return Promise.resolve(undefined);
  }

  return new Promise((resolve) => {
    let settled = false;

    function settle(value: string | undefined) {
      if (settled) {
        return;
      }

      settled = true;
      resolve(value);
    }

    try {
      const parsedUrl = new URL(url);

      if (parsedUrl.protocol !== "https:") {
        settle(undefined);
        return;
      }

      const request = httpsRequest(
        parsedUrl,
        {
          method: "HEAD",
          headers: {
            "User-Agent": "BDIH-Launcher",
          },
        },
        (response) => {
          const redirectLocation = response.headers.location;

          if (
            response.statusCode &&
            response.statusCode >= 300 &&
            response.statusCode < 400 &&
            typeof redirectLocation === "string"
          ) {
            response.resume();
            const redirectedUrl = new URL(redirectLocation, parsedUrl).toString();

            void read_remote_file_signature(redirectedUrl, redirectCount + 1).then(settle);
            return;
          }

          const signature = [
            response.headers.etag,
            response.headers["last-modified"],
            response.headers["content-length"],
          ]
            .filter((value): value is string => typeof value === "string" && value.length > 0)
            .join("|");

          response.resume();
          settle(signature || undefined);
        },
      );

      request.setTimeout(3500, () => {
        request.destroy();
        settle(undefined);
      });
      request.on("error", () => settle(undefined));
      request.end();
    } catch {
      settle(undefined);
    }
  });
}

function is_plain_record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function validate_dxmt_runtime(dxmtVersionId?: string, dxmtPackagePath?: string): void {
  if (!dxmtVersionId) {
    return;
  }

  if (!dxmtPackagePath) {
    throw new Error(`DXMT runtime is not downloaded: ${dxmtVersionId}. Download this DXMT version before launching.`);
  }

  const resolvedPath = expand_user_home_path(dxmtPackagePath);

  if (!existsSync(resolvedPath)) {
    throw new Error(`DXMT runtime file was not found: ${resolvedPath}. Re-download ${dxmtVersionId} before launching.`);
  }
}

async function resolve_dxmt_runtime_dir(
  dxmtPackagePath: string | undefined,
  dxmtVersionId: string | undefined,
  gamePrefixPath: string,
  logger: ReturnType<typeof logManager.createLogger>,
): Promise<string> {
  if (!dxmtPackagePath) {
    throw new Error("DXMT runtime is required for HoYo game launch. Download a DXMT version before launching.");
  }

  const resolvedPackagePath = expand_user_home_path(dxmtPackagePath);

  if (is_dxmt_runtime_root(resolvedPackagePath)) {
    return resolvedPackagePath;
  }

  if (!existsSync(resolvedPackagePath)) {
    throw new Error(`DXMT runtime file was not found: ${resolvedPackagePath}`);
  }

  const cacheName = safe_log_file_part(
    path.basename(strip_archive_extension(resolvedPackagePath)),
    dxmtVersionId ?? "dxmt-runtime",
  );
  const extractionRoot = path.join(gamePrefixPath, DXMT_RUNTIME_CACHE_DIR_NAME, cacheName);
  const existingRuntimeRoot = find_dxmt_runtime_root(extractionRoot);

  if (existingRuntimeRoot) {
    return existingRuntimeRoot;
  }

  rmSync(extractionRoot, { recursive: true, force: true });
  mkdirSync(extractionRoot, { recursive: true });

  if (/\.tar\.gz$/i.test(resolvedPackagePath) || /\.tgz$/i.test(resolvedPackagePath)) {
    await run_system_command("tar", ["-xzf", resolvedPackagePath, "-C", extractionRoot], logger);
  } else if (/\.zip$/i.test(resolvedPackagePath)) {
    await run_system_command("unzip", ["-q", "-o", resolvedPackagePath, "-d", extractionRoot], logger);
  } else {
    throw new Error(`Unsupported DXMT package format: ${resolvedPackagePath}`);
  }

  const runtimeRoot = find_dxmt_runtime_root(extractionRoot);

  if (!runtimeRoot) {
    throw new Error(`DXMT package did not contain the expected runtime files: ${resolvedPackagePath}`);
  }

  const xattrResult = await remove_quarantine_xattr(runtimeRoot);

  if (!xattrResult.skipped && !xattrResult.ok) {
    logger.warn("failed to remove DXMT quarantine xattr", {
      runtimeRoot,
      error: xattrResult.error,
    });
  }

  return runtimeRoot;
}

function find_dxmt_runtime_root(rootPath: string): string | undefined {
  const pending: Array<{ targetPath: string; depth: number }> = [{ targetPath: rootPath, depth: 0 }];

  while (pending.length > 0) {
    const current = pending.shift();

    if (!current || current.depth > 3 || !existsSync(current.targetPath)) {
      continue;
    }

    if (is_dxmt_runtime_root(current.targetPath)) {
      return current.targetPath;
    }

    for (const entry of safe_readdir(current.targetPath)) {
      const entryPath = path.join(current.targetPath, entry);

      if (safe_is_directory(entryPath)) {
        pending.push({ targetPath: entryPath, depth: current.depth + 1 });
      }
    }
  }

  return undefined;
}

function is_dxmt_runtime_root(targetPath: string): boolean {
  return [
    path.join(targetPath, "x86_64-windows", "d3d10core.dll"),
    path.join(targetPath, "x86_64-windows", "d3d11.dll"),
    path.join(targetPath, "x86_64-windows", "dxgi.dll"),
    path.join(targetPath, "x86_64-windows", "winemetal.dll"),
    path.join(targetPath, "x86_64-unix", "winemetal.so"),
  ].every((candidatePath) => existsSync(candidatePath));
}

interface SteamBuiltinDxmtWineRuntime {
  wineRoot: string;
  wineCommand: string;
  dxmtRuntimePath: string;
  launcherOptionsManifest?: WineLauncherOptionsManifest;
}

interface SteamBuiltinDxmtWineMetadata {
  schemaVersion: 1;
  baseWineRoot: string;
  baseWineSignature?: string;
  dxmtVersionId?: string;
  dxmtPackagePath: string;
  dxmtPackageSignature?: string;
}

interface HoyoBuiltinDxmtWineRuntime {
  wineRoot: string;
  wineCommand: string;
  dxmtRuntimePath: string;
  launcherOptionsManifest?: WineLauncherOptionsManifest;
}

interface HoyoBuiltinDxmtWineMetadata {
  schemaVersion: 1;
  baseWineRoot: string;
  baseWineSignature?: string;
  dxmtVersionId?: string;
  dxmtPackagePath: string;
  dxmtPackageSignature?: string;
}

interface BottleRuntimeLock {
  wineVersionId?: string;
  wineRuntimePath?: string;
  dxmtVersionId?: string;
  dxmtPackagePath?: string;
}

function request_with_bottle_runtime_lock(
  request: RunBottleExecutablePayload,
  bottleRootPath: string,
): RunBottleExecutablePayload {
  const lock = read_bottle_runtime_lock(bottleRootPath);

  return {
    ...request,
    wineVersionId: lock.wineVersionId ?? request.wineVersionId,
    wineRuntimePath: lock.wineRuntimePath ?? request.wineRuntimePath,
    dxmtVersionId: lock.dxmtVersionId ?? request.dxmtVersionId,
    dxmtPackagePath: lock.dxmtPackagePath ?? request.dxmtPackagePath,
  };
}

function read_bottle_runtime_lock(bottleRootPath: string): BottleRuntimeLock {
  const metadataPath = path.join(bottleRootPath, "bdih-bottle.json");

  if (!existsSync(metadataPath)) {
    return {};
  }

  try {
    const parsed = JSON.parse(readFileSync(metadataPath, "utf8"));

    if (!is_plain_record(parsed)) {
      return {};
    }

    return {
      wineVersionId: optional_runtime_string(parsed.wineVersionId),
      wineRuntimePath: optional_runtime_string(parsed.wineRuntimePath),
      dxmtVersionId: optional_runtime_string(parsed.dxmtVersionId),
      dxmtPackagePath: optional_runtime_string(parsed.dxmtPackagePath),
    };
  } catch {
    return {};
  }
}

function optional_runtime_string(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

async function ensure_prefix_dxmt_runtime_files(
  request: RunBottleExecutablePayload,
  prefixPath: string,
  logger: ReturnType<typeof logManager.createLogger>,
): Promise<void> {
  const bottleRootPath = infer_hoyo_bottle_root_path(prefixPath);
  const runtimeRequest = request_with_bottle_runtime_lock(request, bottleRootPath);

  if (!runtimeRequest.dxmtVersionId) {
    return;
  }

  validate_dxmt_runtime(runtimeRequest.dxmtVersionId, runtimeRequest.dxmtPackagePath);

  const dxmtRuntimePath = await resolve_dxmt_runtime_dir(
    runtimeRequest.dxmtPackagePath,
    runtimeRequest.dxmtVersionId,
    bottleRootPath,
    logger,
  );

  if (is_prefix_dxmt_runtime_ready(prefixPath, dxmtRuntimePath)) {
    return;
  }

  prepare_prefix_dxmt_runtime_files({
    dxmtRuntimePath,
    prefixPath,
  });
}

async function prepare_steam_builtin_dxmt_wine_runtime(options: {
  request: RunBottleExecutablePayload;
  bottlePath: string;
  wineCommand: string;
  logger: ReturnType<typeof logManager.createLogger>;
}): Promise<SteamBuiltinDxmtWineRuntime | undefined> {
  const runtimeRequest = request_with_bottle_runtime_lock(options.request, options.bottlePath);

  if (!runtimeRequest.dxmtVersionId && !runtimeRequest.dxmtPackagePath) {
    return undefined;
  }

  validate_dxmt_runtime(runtimeRequest.dxmtVersionId, runtimeRequest.dxmtPackagePath);

  const baseWineRoot = resolve_wine_runtime_root(runtimeRequest.wineRuntimePath, options.wineCommand);
  const resolvedDxmtPackagePath = expand_user_home_path(runtimeRequest.dxmtPackagePath ?? "");
  const dxmtRuntimePath = await resolve_dxmt_runtime_dir(
    runtimeRequest.dxmtPackagePath,
    runtimeRequest.dxmtVersionId,
    options.bottlePath,
    options.logger,
  );
  const cacheName = safe_log_file_part(
    [
      path.basename(baseWineRoot),
      runtimeRequest.dxmtVersionId ?? path.basename(strip_archive_extension(resolvedDxmtPackagePath)),
    ].filter(Boolean).join("-"),
    "bottle-dxmt-wine",
  );
  const steamWineRoot = path.join(options.bottlePath, ".cache", "builtin-wine", cacheName);
  const metadataPath = path.join(steamWineRoot, ".bdih-bottle-dxmt-wine.json");
  const metadata: SteamBuiltinDxmtWineMetadata = {
    schemaVersion: 1,
    baseWineRoot,
    baseWineSignature: runtime_file_signature(resolve_wine_tool(baseWineRoot, "wine64")),
    dxmtVersionId: runtimeRequest.dxmtVersionId,
    dxmtPackagePath: resolvedDxmtPackagePath,
    dxmtPackageSignature: runtime_file_signature(resolvedDxmtPackagePath),
  };

  if (!is_steam_builtin_dxmt_wine_cache_valid(steamWineRoot, metadataPath, metadata)) {
    rmSync(steamWineRoot, { recursive: true, force: true });
    mkdirSync(path.dirname(steamWineRoot), { recursive: true });
    options.logger.info("copying bottle shared DXMT Wine runtime for Steam", {
      baseWineRoot,
      steamWineRoot,
      dxmtRuntimePath,
    });
    await run_system_command("ditto", [baseWineRoot, steamWineRoot], options.logger);
  }

  prepare_steam_builtin_dxmt_runtime_files({
    dxmtRuntimePath,
    wineRoot: steamWineRoot,
  });
  writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), "utf8");

  return {
    wineRoot: steamWineRoot,
    wineCommand: resolve_wine_tool(steamWineRoot, "wine64"),
    dxmtRuntimePath,
    launcherOptionsManifest: read_wine_launcher_options_manifest(steamWineRoot),
  };
}

async function prepare_hoyo_builtin_dxmt_wine_runtime(options: {
  request: RunBottleExecutablePayload;
  bottleRootPath: string;
  wineCommand: string;
  dxmtRuntimePath: string;
  logger: ReturnType<typeof logManager.createLogger>;
}): Promise<HoyoBuiltinDxmtWineRuntime> {
  const runtimeRequest = request_with_bottle_runtime_lock(options.request, options.bottleRootPath);

  validate_dxmt_runtime(runtimeRequest.dxmtVersionId, runtimeRequest.dxmtPackagePath);

  const baseWineRoot = resolve_wine_runtime_root(runtimeRequest.wineRuntimePath, options.wineCommand);
  const resolvedDxmtPackagePath = expand_user_home_path(runtimeRequest.dxmtPackagePath ?? "");
  const cacheName = safe_log_file_part(
    [
      path.basename(baseWineRoot),
      runtimeRequest.dxmtVersionId ?? path.basename(strip_archive_extension(resolvedDxmtPackagePath)),
    ].filter(Boolean).join("-"),
    "bottle-dxmt-wine",
  );
  const hoyoWineRoot = path.join(options.bottleRootPath, ".cache", "builtin-wine", cacheName);
  const metadataPath = path.join(hoyoWineRoot, ".bdih-bottle-dxmt-wine.json");
  const metadata: HoyoBuiltinDxmtWineMetadata = {
    schemaVersion: 1,
    baseWineRoot,
    baseWineSignature: runtime_file_signature(resolve_wine_tool(baseWineRoot, "wine64")),
    dxmtVersionId: runtimeRequest.dxmtVersionId,
    dxmtPackagePath: resolvedDxmtPackagePath,
    dxmtPackageSignature: runtime_file_signature(resolvedDxmtPackagePath),
  };

  if (!is_hoyo_builtin_dxmt_wine_cache_valid(hoyoWineRoot, metadataPath, metadata)) {
    rmSync(hoyoWineRoot, { recursive: true, force: true });
    mkdirSync(path.dirname(hoyoWineRoot), { recursive: true });
    options.logger.info("copying bottle shared DXMT Wine runtime for HoYo", {
      baseWineRoot,
      hoyoWineRoot,
      dxmtRuntimePath: options.dxmtRuntimePath,
    });
    await run_system_command("ditto", [baseWineRoot, hoyoWineRoot], options.logger);
  }

  prepare_builtin_dxmt_wine_runtime_files({
    dxmtRuntimePath: options.dxmtRuntimePath,
    wineRoot: hoyoWineRoot,
  });
  writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), "utf8");

  return {
    wineRoot: hoyoWineRoot,
    wineCommand: resolve_wine_tool(hoyoWineRoot, "wine64"),
    dxmtRuntimePath: options.dxmtRuntimePath,
    launcherOptionsManifest: read_wine_launcher_options_manifest(hoyoWineRoot),
  };
}

function is_hoyo_builtin_dxmt_wine_cache_valid(
  wineRoot: string,
  metadataPath: string,
  expected: HoyoBuiltinDxmtWineMetadata,
): boolean {
  let wineCommand: string;

  try {
    wineCommand = resolve_wine_tool(wineRoot, "wine64");
  } catch {
    return false;
  }

  if (!existsSync(wineCommand) || !existsSync(metadataPath)) {
    return false;
  }

  try {
    const parsed = JSON.parse(readFileSync(metadataPath, "utf8")) as Partial<HoyoBuiltinDxmtWineMetadata>;

    return parsed.schemaVersion === expected.schemaVersion &&
      parsed.baseWineRoot === expected.baseWineRoot &&
      parsed.baseWineSignature === expected.baseWineSignature &&
      parsed.dxmtVersionId === expected.dxmtVersionId &&
      parsed.dxmtPackagePath === expected.dxmtPackagePath &&
      parsed.dxmtPackageSignature === expected.dxmtPackageSignature &&
      has_builtin_dxmt_wine_runtime_files(wineRoot);
  } catch {
    return false;
  }
}

function is_steam_builtin_dxmt_wine_cache_valid(
  wineRoot: string,
  metadataPath: string,
  expected: SteamBuiltinDxmtWineMetadata,
): boolean {
  let wineCommand: string;

  try {
    wineCommand = resolve_wine_tool(wineRoot, "wine64");
  } catch {
    return false;
  }

  if (!existsSync(wineCommand) || !existsSync(metadataPath)) {
    return false;
  }

  try {
    const parsed = JSON.parse(readFileSync(metadataPath, "utf8")) as Partial<SteamBuiltinDxmtWineMetadata>;

    return parsed.schemaVersion === expected.schemaVersion &&
      parsed.baseWineRoot === expected.baseWineRoot &&
      parsed.baseWineSignature === expected.baseWineSignature &&
      parsed.dxmtVersionId === expected.dxmtVersionId &&
      parsed.dxmtPackagePath === expected.dxmtPackagePath &&
      parsed.dxmtPackageSignature === expected.dxmtPackageSignature &&
      has_builtin_dxmt_wine_runtime_files(wineRoot);
  } catch {
    return false;
  }
}

function has_builtin_dxmt_wine_runtime_files(wineRoot: string): boolean {
  try {
    const wineLibRoot = resolve_wine_lib_root(wineRoot);

    return [
      path.join(wineLibRoot, "x86_64-windows", "d3d10core.dll"),
      path.join(wineLibRoot, "x86_64-windows", "d3d11.dll"),
      path.join(wineLibRoot, "x86_64-windows", "dxgi.dll"),
      path.join(wineLibRoot, "x86_64-windows", "winemetal.dll"),
      path.join(wineLibRoot, "x86_64-unix", "winemetal.so"),
    ].every((candidatePath) => existsSync(candidatePath));
  } catch {
    return false;
  }
}

function prepare_steam_builtin_dxmt_runtime_files(options: {
  dxmtRuntimePath: string;
  wineRoot: string;
}): void {
  prepare_builtin_dxmt_wine_runtime_files(options);
}

function prepare_builtin_dxmt_wine_runtime_files(options: {
  dxmtRuntimePath: string;
  wineRoot: string;
}): void {
  const wineLibRoot = resolve_wine_lib_root(options.wineRoot);

  for (const name of DXMT_PREFIX_REQUIRED_WINDOWS_FILES) {
    copy_required_file(
      path.join(options.dxmtRuntimePath, "x86_64-windows", name),
      path.join(wineLibRoot, "x86_64-windows", name),
      `DXMT ${name}`,
    );
    copy_optional_file(
      path.join(options.dxmtRuntimePath, "i386-windows", name),
      path.join(wineLibRoot, "i386-windows", name),
    );
  }

  copy_required_file(
    path.join(options.dxmtRuntimePath, "x86_64-unix", "winemetal.so"),
    path.join(wineLibRoot, "x86_64-unix", "winemetal.so"),
    "DXMT winemetal.so",
  );
}

function prepare_prefix_dxmt_runtime_files(options: {
  dxmtRuntimePath: string;
  prefixPath: string;
}): void {
  const system32Path = path.join(options.prefixPath, "drive_c", "windows", "system32");
  const syswow64Path = path.join(options.prefixPath, "drive_c", "windows", "syswow64");
  const x64RuntimePath = path.join(options.dxmtRuntimePath, "x86_64-windows");
  const x86RuntimePath = path.join(options.dxmtRuntimePath, "i386-windows");
  const x64FileNames = [...new Set([
    ...DXMT_PREFIX_REQUIRED_WINDOWS_FILES,
    ...safe_readdir(x64RuntimePath).filter(is_dxmt_windows_runtime_file),
  ])];
  const x86FileNames = safe_readdir(x86RuntimePath).filter(is_dxmt_windows_runtime_file);

  mkdirSync(system32Path, { recursive: true });
  mkdirSync(syswow64Path, { recursive: true });

  for (const name of x64FileNames) {
    const sourcePath = path.join(x64RuntimePath, name);
    const targetPath = path.join(system32Path, name);

    if (DXMT_PREFIX_REQUIRED_WINDOWS_FILES.includes(name)) {
      copy_required_file(sourcePath, targetPath, `DXMT ${name}`);
    } else {
      copy_optional_file(sourcePath, targetPath);
    }
  }

  for (const name of x86FileNames) {
    copy_optional_file(
      path.join(x86RuntimePath, name),
      path.join(syswow64Path, name),
    );
  }
}

function is_prefix_dxmt_runtime_ready(prefixPath: string, dxmtRuntimePath: string): boolean {
  return DXMT_PREFIX_REQUIRED_WINDOWS_FILES.every((name) => {
    const sourcePath = path.join(dxmtRuntimePath, "x86_64-windows", name);
    const targetPath = path.join(prefixPath, "drive_c", "windows", "system32", name);

    return existsSync(sourcePath) &&
      existsSync(targetPath) &&
      runtime_file_signature(sourcePath) === runtime_file_signature(targetPath);
  });
}

function is_dxmt_windows_runtime_file(name: string): boolean {
  return name.toLowerCase().endsWith(".dll");
}

function runtime_file_signature(targetPath: string): string | undefined {
  try {
    const stat = statSync(targetPath);

    return `${stat.size}:${Math.trunc(stat.mtimeMs)}`;
  } catch {
    return undefined;
  }
}

function prepare_hoyo_zzz_runtime_files(options: {
  dxmtRuntimePath: string;
  gamePrefixPath: string;
  protonExtrasPath: string;
  wineRoot: string;
}): void {
  const system32Path = path.join(options.gamePrefixPath, "drive_c", "windows", "system32");
  const syswow64Path = path.join(options.gamePrefixPath, "drive_c", "windows", "syswow64");

  mkdirSync(system32Path, { recursive: true });
  mkdirSync(syswow64Path, { recursive: true });

  copy_required_file(
    path.join(options.protonExtrasPath, "steam64.exe"),
    path.join(system32Path, "steam.exe"),
    "Proton steam64.exe",
  );
  copy_required_file(
    path.join(options.protonExtrasPath, "steam32.exe"),
    path.join(syswow64Path, "steam.exe"),
    "Proton steam32.exe",
  );
  copy_required_file(
    path.join(options.protonExtrasPath, "lsteamclient64.dll"),
    path.join(system32Path, "lsteamclient.dll"),
    "Proton lsteamclient64.dll",
  );
  copy_required_file(
    path.join(options.protonExtrasPath, "lsteamclient32.dll"),
    path.join(syswow64Path, "lsteamclient.dll"),
    "Proton lsteamclient32.dll",
  );
}

function prepare_hoyo_builtin_dxmt_runtime_files(options: {
  dxmtRuntimePath: string;
  gamePrefixPath: string;
  protonExtrasPath: string;
  wineRoot: string;
}): void {
  const system32Path = path.join(options.gamePrefixPath, "drive_c", "windows", "system32");
  const syswow64Path = path.join(options.gamePrefixPath, "drive_c", "windows", "syswow64");

  mkdirSync(system32Path, { recursive: true });
  mkdirSync(syswow64Path, { recursive: true });

  copy_required_file(
    path.join(options.protonExtrasPath, "steam64.exe"),
    path.join(system32Path, "steam.exe"),
    "Proton steam64.exe",
  );
  copy_required_file(
    path.join(options.protonExtrasPath, "lsteamclient64.dll"),
    path.join(system32Path, "lsteamclient.dll"),
    "Proton lsteamclient64.dll",
  );
  copy_required_file(
    path.join(options.protonExtrasPath, "steam32.exe"),
    path.join(syswow64Path, "steam.exe"),
    "Proton steam32.exe",
  );
  copy_required_file(
    path.join(options.protonExtrasPath, "lsteamclient32.dll"),
    path.join(syswow64Path, "lsteamclient.dll"),
    "Proton lsteamclient32.dll",
  );
}

function prepare_hoyo_optional_dxmt_windows_runtime_files(options: {
  dxmtRuntimePath: string;
  fileNames: string[];
  gamePrefixPath: string;
  wineRoot: string;
}): void {
  if (options.fileNames.length === 0) {
    return;
  }

  const system32Path = path.join(options.gamePrefixPath, "drive_c", "windows", "system32");
  const syswow64Path = path.join(options.gamePrefixPath, "drive_c", "windows", "syswow64");

  mkdirSync(system32Path, { recursive: true });
  mkdirSync(syswow64Path, { recursive: true });

  for (const fileName of options.fileNames) {
    copy_optional_file(
      path.join(options.dxmtRuntimePath, "x86_64-windows", fileName),
      path.join(system32Path, fileName),
    );
    copy_optional_file(
      path.join(options.dxmtRuntimePath, "i386-windows", fileName),
      path.join(syswow64Path, fileName),
    );
  }
}

async function apply_hsr_nv_extension_registry(
  wineCommand: string,
  gamePrefixPath: string,
  logger: ReturnType<typeof logManager.createLogger>,
  sourceEnv?: NodeJS.ProcessEnv | Record<string, string>,
): Promise<void> {
  const nvExtensionValue = "{41FCC608-8496-4DEF-B43E-7D9BD675A6FF}";
  const helperEnv = create_wine_helper_environment(sourceEnv, gamePrefixPath);
  const registryWrites: Array<{ key: string; args: string[] }> = [
    {
      key: "HKLM\\SOFTWARE\\NVIDIA Corporation\\Global",
      args: ["/v", nvExtensionValue, "/t", "REG_BINARY", "/d", "1"],
    },
    {
      key: "HKLM\\SYSTEM\\CurrentControlSet\\Services\\nvlddmkm",
      args: ["/v", nvExtensionValue, "/t", "REG_BINARY", "/d", "1"],
    },
    {
      key: "HKLM\\SYSTEM\\ControlSet001\\Services\\nvlddmkm",
      args: ["/v", nvExtensionValue, "/t", "REG_BINARY", "/d", "1"],
    },
    {
      key: "HKLM\\SOFTWARE\\NVIDIA Corporation\\Global\\NGXCore",
      args: ["/v", "FullPath", "/t", "REG_SZ", "/d", "C:\\Windows\\System32"],
    },
  ];

  for (const entry of registryWrites) {
    await run_wine_command_best_effort(
      wineCommand,
      ["reg", "add", entry.key, ...entry.args, "/f"],
      gamePrefixPath,
      helperEnv,
      logger,
    );
  }
}

function stash_game_local_dxmt_files(
  gameHostDir: string,
  gamePrefixPath: string,
  logger: ReturnType<typeof logManager.createLogger>,
): () => void {
  if (!existsSync(gameHostDir) || !safe_is_directory(gameHostDir)) {
    return () => undefined;
  }

  const stashDir = path.join(gamePrefixPath, ".cache", "game-dxmt-stash", Date.now().toString(36));
  const stashedFiles: Array<{ sourcePath: string; stashPath: string }> = [];

  for (const fileName of safe_readdir(gameHostDir)) {
    if (!/^(d3d10core|d3d11|dxgi|winemetal)\.dll$/i.test(fileName)) {
      continue;
    }

    const sourcePath = path.join(gameHostDir, fileName);

    if (!safe_is_file(sourcePath)) {
      continue;
    }

    mkdirSync(stashDir, { recursive: true });
    const stashPath = path.join(stashDir, fileName);

    try {
      renameSync(sourcePath, stashPath);
      stashedFiles.push({ sourcePath, stashPath });
    } catch (error) {
      logger.warn("failed to stash game-local DXMT DLL", {
        sourcePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (stashedFiles.length === 0) {
    rmSync(stashDir, { recursive: true, force: true });
    return () => undefined;
  }

  logger.info("stashed game-local DXMT DLLs", {
    gameHostDir,
    stashDir,
    count: stashedFiles.length,
  });

  return () => {
    for (const { sourcePath, stashPath } of stashedFiles) {
      try {
        if (!existsSync(sourcePath) && existsSync(stashPath)) {
          renameSync(stashPath, sourcePath);
        }
      } catch (error) {
        logger.warn("failed to restore game-local DXMT DLL", {
          sourcePath,
          stashPath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    rmSync(stashDir, { recursive: true, force: true });
  };
}

function stash_hoyo_removed_runtime_files(
  gameProfile: HoyoGameProfile,
  gameHostDir: string,
  gamePrefixPath: string,
  logger: ReturnType<typeof logManager.createLogger>,
): () => void {
  const relativePaths = gameProfile.launchRoutine.runtimeFilesToHide ?? [];

  if (relativePaths.length === 0 || !existsSync(gameHostDir) || !safe_is_directory(gameHostDir)) {
    return () => undefined;
  }

  const stashDir = path.join(gamePrefixPath, ".cache", "hoyo-runtime-stash", gameProfile.id, Date.now().toString(36));
  const stashedFiles: Array<{ sourcePath: string; stashPath: string }> = [];

  for (const relativePath of relativePaths) {
    const sourcePath = path.join(gameHostDir, relativePath);

    if (!safe_is_file(sourcePath)) {
      continue;
    }

    const stashPath = path.join(stashDir, relativePath);

    try {
      mkdirSync(path.dirname(stashPath), { recursive: true });
      renameSync(sourcePath, stashPath);
      stashedFiles.push({ sourcePath, stashPath });
    } catch (error) {
      logger.warn("failed to stash HoYo runtime file", {
        gameKind: gameProfile.id,
        sourcePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (stashedFiles.length === 0) {
    rmSync(stashDir, { recursive: true, force: true });
    return () => undefined;
  }

  logger.info("stashed HoYo runtime files", {
    gameKind: gameProfile.id,
    gameHostDir,
    stashDir,
    count: stashedFiles.length,
  });

  return () => {
    for (const { sourcePath, stashPath } of stashedFiles) {
      try {
        if (!existsSync(sourcePath) && existsSync(stashPath)) {
          mkdirSync(path.dirname(sourcePath), { recursive: true });
          renameSync(stashPath, sourcePath);
        }
      } catch (error) {
        logger.warn("failed to restore HoYo runtime file", {
          gameKind: gameProfile.id,
          sourcePath,
          stashPath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    rmSync(stashDir, { recursive: true, force: true });
  };
}

function resolve_jadeite_runtime(
  dataRootPath: string,
  preferredRuntimePath?: string,
): { rootPath: string; executablePath: string } {
  const candidates = [
    preferredRuntimePath,
    path.join(dataRootPath, "dependencies", "jadeite", "v5.0.1"),
    path.join(dataRootPath, "Jadeite", "v5.0.1"),
    "/Users/yabai/myproject/WineProject/Wine/jedite-5.0.1",
    "/Users/yabai/myproject/WineProject/Wine/jadeite-5.0.1",
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const rootPath of candidates) {
    const executablePath = path.join(rootPath, "jadeite.exe");

    if (
      existsSync(executablePath) &&
      existsSync(path.join(rootPath, "game_payload.dll")) &&
      existsSync(path.join(rootPath, "launcher_payload.dll"))
    ) {
      return {
        rootPath,
        executablePath,
      };
    }
  }

  throw new Error("Jadeite runtime is required for Honkai: Star Rail, but jadeite.exe/game_payload.dll/launcher_payload.dll were not found.");
}

function resolve_gstreamer_environment(wineRoot: string, dataRootPath: string): Record<string, string> {
  const pluginDir = first_existing_directory([
    path.join(wineRoot, "lib", "gstreamer-1.0"),
    "/opt/homebrew/lib/gstreamer-1.0",
    "/usr/local/lib/gstreamer-1.0",
    path.join(wineRoot, "lib", "GStreamer.framework", "Versions", "1.0", "lib", "gstreamer-1.0"),
    "/Library/Frameworks/GStreamer.framework/Versions/1.0/lib/gstreamer-1.0",
  ]);
  const scannerPath = first_existing_file([
    path.join(wineRoot, "libexec", "gstreamer-1.0", "gst-plugin-scanner"),
    "/opt/homebrew/libexec/gstreamer-1.0/gst-plugin-scanner",
    "/usr/local/libexec/gstreamer-1.0/gst-plugin-scanner",
    path.join(wineRoot, "lib", "GStreamer.framework", "Versions", "1.0", "libexec", "gstreamer-1.0", "gst-plugin-scanner"),
    "/Library/Frameworks/GStreamer.framework/Versions/1.0/libexec/gstreamer-1.0/gst-plugin-scanner",
  ]);
  const env: Record<string, string> = {
    WINE_GST_REGISTRY_DIR: path.join(dataRootPath, "gstreamer-1.0"),
  };

  if (pluginDir) {
    env.GST_PLUGIN_SYSTEM_PATH_1_0 = pluginDir;
    env.GST_PLUGIN_PATH = pluginDir;
  }

  if (scannerPath) {
    env.GST_PLUGIN_SCANNER = scannerPath;
  }

  return env;
}

function without_env_keys(env: Record<string, string>, keys: string[]): Record<string, string> {
  const nextEnv = { ...env };

  for (const key of keys) {
    delete nextEnv[key];
  }

  return nextEnv;
}

function create_wine_helper_environment(
  sourceEnv: NodeJS.ProcessEnv | Record<string, string> | undefined,
  gamePrefixPath: string,
): Record<string, string> {
  const helperEnv: Record<string, string> = {
    WINEPREFIX: gamePrefixPath,
    WINEDEBUG: sourceEnv?.WINEDEBUG ?? "fixme-all,err-unwind,+timestamp",
  };
  const passthroughKeys = [
    "PATH",
    "DYLD_LIBRARY_PATH",
    "WINEMSYNC",
    "WINEESYNC",
    "WINEFSYNC",
    "WINE_ROOT",
    "WINE_ENABLE_TIMEOUT_FIX",
    "GST_PLUGIN_SYSTEM_PATH_1_0",
    "GST_PLUGIN_PATH",
    "GST_PLUGIN_SCANNER",
    "GST_PLUGIN_FEATURE_RANK",
    "WINE_GST_REGISTRY_DIR",
  ];

  for (const key of passthroughKeys) {
    const value = sourceEnv?.[key] ?? process.env[key];

    if (value) {
      helperEnv[key] = value;
    }
  }

  if (!helperEnv.WINEMSYNC && !helperEnv.WINEESYNC && !helperEnv.WINEFSYNC) {
    helperEnv.WINEMSYNC = "1";
  }

  return helperEnv;
}

function resolve_wine_lib_root(wineRoot: string): string {
  const candidates = [
    path.join(wineRoot, "lib", "wine"),
    path.join(wineRoot, "Contents", "Resources", "wine", "lib", "wine"),
    path.join(wineRoot, "Contents", "Resources", "lib", "wine"),
  ];

  for (const candidate of candidates) {
    if (
      existsSync(path.join(candidate, "x86_64-windows")) &&
      existsSync(path.join(candidate, "x86_64-unix"))
    ) {
      return candidate;
    }
  }

  throw new Error(
    `Unsupported Wine runtime: this Wine build does not expose the lib/wine directories required to inject DXMT runtime files. Runtime: ${wineRoot}`,
  );
}

function resolve_protonextras_root(wineRoot: string): string {
  const candidates = [
    path.join(wineRoot, "share", "protonextras"),
    path.join(wineRoot, "Contents", "Resources", "wine", "share", "protonextras"),
    path.join(wineRoot, "Contents", "Resources", "share", "protonextras"),
    "/Users/yabai/myproject/WineProject/wine-build/artifacts/protonextras-wrapper-real",
    "/Users/yabai/myproject/WineProject/wine-build/artifacts/protonextras",
  ];

  for (const candidate of candidates) {
    if (has_protonextras_files(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `Unsupported Wine runtime for HoYo ZZZ: Proton Steam stub files were not found. ZZZ is launched through C:\\windows\\system32\\steam.exe, so this Wine build must include share/protonextras/steam64.exe, steam32.exe, and lsteamclient DLLs. Runtime: ${wineRoot}`,
  );
}

function has_protonextras_files(targetPath: string): boolean {
  return [
    "steam64.exe",
    "steam32.exe",
    "lsteamclient64.dll",
    "lsteamclient32.dll",
  ].every((name) => existsSync(path.join(targetPath, name)));
}

function copy_required_file(sourcePath: string, destinationPath: string, label: string): void {
  if (!existsSync(sourcePath)) {
    throw new Error(`Missing ${label}: ${sourcePath}`);
  }

  mkdirSync(path.dirname(destinationPath), { recursive: true });
  copyFileSync(sourcePath, destinationPath);
}

function copy_optional_file(sourcePath: string, destinationPath: string): void {
  if (!existsSync(sourcePath) || !existsSync(path.dirname(destinationPath))) {
    return;
  }

  copyFileSync(sourcePath, destinationPath);
}

function resolve_wine_runtime_root(wineRuntimePath: string | undefined, wineCommand: string): string {
  const expandedRuntimePath = wineRuntimePath ? expand_user_home_path(wineRuntimePath) : "";
  const commandRuntimePath = path.basename(path.dirname(wineCommand)) === "bin"
    ? path.dirname(path.dirname(wineCommand))
    : "";
  const candidates = [
    expandedRuntimePath,
    strip_archive_extension(expandedRuntimePath),
    commandRuntimePath,
  ].filter((candidate, index, candidates): candidate is string => Boolean(candidate) && candidates.indexOf(candidate) === index);

  for (const candidate of candidates) {
    if (
      existsSync(path.join(candidate, "bin", "wine")) ||
      existsSync(path.join(candidate, "bin", "wine64")) ||
      existsSync(path.join(candidate, "lib", "wine")) ||
      existsSync(path.join(candidate, "Contents", "Resources", "wine"))
    ) {
      return candidate;
    }
  }

  throw new Error(`Wine runtime root was not found: ${wineRuntimePath ?? wineCommand}`);
}

function resolve_wine_bin_tool(wineRoot: string, wineCommand: string): string {
  const candidates = [
    path.join(wineRoot, "bin", "wine.bin"),
    path.join(wineRoot, "Contents", "Resources", "wine", "bin", "wine.bin"),
    path.join(wineRoot, "Contents", "Resources", "bin", "wine.bin"),
    wineCommand,
  ];

  return candidates.find((candidate) => existsSync(candidate)) ?? wineCommand;
}

function normalize_hoyo_game_prefix_path(receivedPrefixPath: string, gameKind: HoyoGameKind): string {
  const trimmedPath = receivedPrefixPath.replace(/\/+$/, "");
  const expectedName = path.basename(create_hoyo_game_prefix_path("/__bdih__", gameKind));
  const basename = path.basename(trimmedPath).toLowerCase();

  if (basename === expectedName) {
    return trimmedPath;
  }

  if (["steam-prefix", "hoyo-prefix", "hoyoplay-prefix", "manual-prefix"].includes(basename)) {
    return path.join(path.dirname(trimmedPath), expectedName);
  }

  return create_hoyo_game_prefix_path(trimmedPath, gameKind);
}

function host_path_from_wine_or_host_path(prefixPath: string, executablePath: string): string | undefined {
  const normalizedPath = executablePath.replace(/\\/g, "/");

  if (/^[Cc]:\//.test(normalizedPath)) {
    return path.join(prefixPath, "drive_c", normalizedPath.replace(/^[Cc]:\/?/, ""));
  }

  if (/^[Zz]:\//.test(normalizedPath)) {
    return `/${normalizedPath.replace(/^[Zz]:\/?/, "")}`;
  }

  if (path.isAbsolute(executablePath)) {
    return expand_user_home_path(executablePath);
  }

  return undefined;
}

function host_path_from_hoyo_executable_path(
  receivedPrefixPath: string,
  gamePrefixPath: string,
  executablePath: string,
): string | undefined {
  const directHostPath = host_path_from_wine_or_host_path(gamePrefixPath, executablePath);

  if (!directHostPath || existsSync(directHostPath) || !/^[Cc]:[\\/]/.test(executablePath)) {
    return directHostPath;
  }

  const bottleRootPath = infer_bottle_root_from_prefix_path(receivedPrefixPath, gamePrefixPath);
  const normalizedPath = executablePath.replace(/\\/g, "/");
  const cRelativePath = normalizedPath.replace(/^[Cc]:\/?/, "");
  const fallbackPrefixes = [
    path.join(bottleRootPath, "hoyo-prefix"),
    path.join(bottleRootPath, "hoyoplay-prefix"),
    bottleRootPath,
  ];

  for (const prefixPath of fallbackPrefixes) {
    const candidatePath = path.join(prefixPath, "drive_c", cRelativePath);

    if (existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  return directHostPath;
}

function infer_bottle_root_from_prefix_path(receivedPrefixPath: string, gamePrefixPath: string): string {
  const normalizedReceivedPath = receivedPrefixPath.replace(/\/+$/, "");
  const normalizedGamePrefixPath = gamePrefixPath.replace(/\/+$/, "");
  const internalPrefixNames = ["steam-prefix", "hoyo-prefix", "hoyoplay-prefix", "manual-prefix", "zzz-prefix", "hsr-prefix", "genshin-prefix"];

  if (internalPrefixNames.includes(path.basename(normalizedReceivedPath).toLowerCase())) {
    return path.dirname(normalizedReceivedPath);
  }

  if (internalPrefixNames.includes(path.basename(normalizedGamePrefixPath).toLowerCase())) {
    return path.dirname(normalizedGamePrefixPath);
  }

  return normalizedReceivedPath;
}

function infer_hoyo_bottle_root_path(receivedPrefixPath: string): string {
  const normalizedReceivedPath = receivedPrefixPath.replace(/\/+$/, "");
  const internalPrefixNames = ["steam-prefix", "hoyo-prefix", "hoyoplay-prefix", "manual-prefix", "zzz-prefix", "hsr-prefix", "genshin-prefix"];

  return internalPrefixNames.includes(path.basename(normalizedReceivedPath).toLowerCase())
    ? path.dirname(normalizedReceivedPath)
    : normalizedReceivedPath;
}

function wine_z_path(hostPath: string): string {
  return `Z:${hostPath.replace(/\//g, "\\")}`;
}

function hoyo_game_app_id(game: HoyoGameKind): string {
  return get_hoyo_game_profile(game).appId;
}

function apply_hoyo_dxmt_config_environment(
  env: NodeJS.ProcessEnv,
  options: {
    dataRootPath: string;
    dxmtRuntimePath: string;
    gamePrefixPath: string;
    launchOptions: BottleLaunchOptionsPayload;
  },
): void {
  const inlineConfig = env.DXMT_CONFIG && !existing_file_path_from_env_value(env.DXMT_CONFIG)
    ? env.DXMT_CONFIG.trim()
    : "";
  const sourceConfigPath = existing_file_path_from_env_value(env.DXMT_CONFIG_FILE) ??
    existing_file_path_from_env_value(env.DXMT_CONFIG) ??
    find_hoyo_dxmt_config_path(options.dataRootPath, options.dxmtRuntimePath);
  const configParts: string[] = [];

  if (sourceConfigPath) {
    try {
      configParts.push(readFileSync(sourceConfigPath, "utf8").trimEnd());
    } catch {
      // Keep launch resilient. DXMT can still consume inline env config.
    }
  }

  if (inlineConfig) {
    configParts.push(inlineConfig);
  }

  const spatialUpscaleFactor = options.launchOptions.dxmtMetalFxSpatialUpscaleFactor;

  if (typeof spatialUpscaleFactor === "number" && Number.isFinite(spatialUpscaleFactor)) {
    configParts.push(`d3d11.metalSpatialUpscaleFactor = ${spatialUpscaleFactor}`);
  }

  if (configParts.length === 0) {
    return;
  }

  const runtimeConfigPath = path.join(options.gamePrefixPath, ".cache", "dxmt", "bdih-dxmt.conf");

  try {
    mkdirSync(path.dirname(runtimeConfigPath), { recursive: true });
    writeFileSync(runtimeConfigPath, `${configParts.filter(Boolean).join("\n\n")}\n`, "utf8");
    env.DXMT_CONFIG_FILE = runtimeConfigPath;

    if (!env.DXMT_CONFIG) {
      env.DXMT_CONFIG = sourceConfigPath ?? runtimeConfigPath;
    }
  } catch {
    if (sourceConfigPath) {
      env.DXMT_CONFIG_FILE = sourceConfigPath;

      if (!env.DXMT_CONFIG) {
        env.DXMT_CONFIG = sourceConfigPath;
      }
    }
  }
}

function apply_hoyo_profile_wine_auto_args_environment(
  env: NodeJS.ProcessEnv,
  gameProfile: HoyoGameProfile,
): void {
  const config = gameProfile.launchRoutine.wineAutoArgs;

  if (!config || env[config.disableEnvName]) {
    return;
  }

  if (env[config.envName]) {
    env[config.disableEnvName] = "0";
    return;
  }

  env[config.disableEnvName] = config.defaultDisabled ? "1" : "0";
}

function existing_file_path_from_env_value(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const expandedPath = expand_user_home_path(value.trim());

  try {
    return statSync(expandedPath).isFile() ? expandedPath : undefined;
  } catch {
    return undefined;
  }
}

function find_hoyo_dxmt_config_path(dataRootPath: string, dxmtRuntimePath: string): string | undefined {
  const candidates = [
    path.join(dataRootPath, "dxmt.conf"),
    path.join(path.dirname(dxmtRuntimePath), "dxmt.conf"),
    path.join(dxmtRuntimePath, "dxmt.conf"),
    ...application_support_dxmt_config_candidates(),
  ];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const expandedPath = expand_user_home_path(candidate);

    if (seen.has(expandedPath)) {
      continue;
    }

    seen.add(expandedPath);

    if (existsSync(expandedPath)) {
      return expandedPath;
    }
  }

  return undefined;
}

function application_support_dxmt_config_candidates(): string[] {
  const homePath = process.env.HOME;

  if (!homePath) {
    return [];
  }

  const applicationSupportPath = path.join(homePath, "Library", "Application Support");

  try {
    return readdirSync(applicationSupportPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(applicationSupportPath, entry.name, "dxmt.conf"));
  } catch {
    return [];
  }
}

function hoyo_overseer_executable_args(game: HoyoGameKind, eventArgs: string[] = []): string[] {
  const gameProfile = get_hoyo_game_profile(game);
  const args = eventArgs.filter((arg) => typeof arg === "string" && arg.trim().length > 0);

  if (args.length > 0) {
    return args;
  }

  return gameProfile.launchRoutine.defaultExecutableArgs ?? [];
}

function hoyo_game_display_name(game: HoyoGameKind): string {
  return get_hoyo_game_profile(game).displayName;
}

function hoyo_game_from_run_request(
  request: RunBottleExecutablePayload,
  appName: string,
  executablePath: string,
): HoyoGameKind | undefined {
  return hoyo_game_from_bottle_app({
    id: request.appId ?? "",
    name: appName,
    source: "game",
    executablePath,
  });
}

function coerce_hoyo_direct_launch_options(
  launchOptions: BottleLaunchOptionsPayload | undefined,
  gameKind: HoyoGameKind,
): BottleLaunchOptionsPayload {
  const requestedPreset = launchOptions?.presetId;

  if (!requestedPreset || requestedPreset === "auto" || requestedPreset === "hoyoplay") {
    return {
      ...launchOptions,
      presetId: gameKind,
    };
  }

  return launchOptions;
}

function run_system_command(
  command: string,
  args: string[],
  logger: ReturnType<typeof logManager.createLogger>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: process.env,
      shell: false,
      windowsHide: true,
    });

    child.stdout?.on("data", (data: Buffer) => logger.info(`${command} stdout`, data.toString().trim()));
    child.stderr?.on("data", (data: Buffer) => logger.warn(`${command} stderr`, data.toString().trim()));
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} exited with code ${code ?? "unknown"}.`));
    });
  });
}

async function run_wine_command_best_effort(
  command: string,
  args: string[],
  cwd: string,
  env: Record<string, string>,
  logger: ReturnType<typeof logManager.createLogger>,
): Promise<void> {
  const process = processManager.startProcess(`wine-tool:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`, {
    command,
    args,
    cwd,
    env,
    onLog: (data) => logger.info(`${path.basename(command)} stdout`, data.trim()),
    onError: (data) => logger.warn(`${path.basename(command)} stderr`, data.trim()),
  });

  try {
    const code = await process.done;

    if (code !== 0) {
      logger.warn("Wine helper exited with non-zero code", { command, args, code });
    }
  } catch (error) {
    logger.warn("Wine helper failed", {
      command,
      args,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function stop_wine_prefix_best_effort(
  prefixPath: string,
  wineRuntimePath: string | undefined,
  logger: ReturnType<typeof logManager.createLogger>,
): Promise<void> {
  const command = resolve_wine_tool(wineRuntimePath, "wineserver");

  await run_wine_command_best_effort(
    command,
    ["-k"],
    prefixPath,
    {
      WINEPREFIX: prefixPath,
      WINEDEBUG: "-all",
    },
    logger,
  );
}

async function clear_hoyo_zzz_webview_override(
  wineCommand: string,
  gamePrefixPath: string,
  logger: ReturnType<typeof logManager.createLogger>,
): Promise<void> {
  await run_wine_command_best_effort(
    wineCommand,
    [
      "reg",
      "delete",
      "HKCU\\Software\\miHoYo\\ZenlessZoneZero",
      "/v",
      "MIHOYOSDK_WEBVIEW_RENDER_METHOD_h1573598267",
      "/f",
    ],
    gamePrefixPath,
    {
      WINEPREFIX: gamePrefixPath,
      WINEDEBUG: "fixme-all,err-unwind,+timestamp",
    },
    logger,
  );
}

function safe_readdir(targetPath: string): string[] {
  try {
    return readdirSync(targetPath);
  } catch {
    return [];
  }
}

function safe_is_directory(targetPath: string): boolean {
  try {
    return statSync(targetPath).isDirectory();
  } catch {
    return false;
  }
}

function should_prepare_dxmt_runtime(request: { launcher?: BottleLauncherKind; dxmtVersionId?: string }): boolean {
  return Boolean(request.dxmtVersionId);
}

function should_validate_dxmt_for_executable(request: RunBottleExecutablePayload): boolean {
  if (!request.dxmtVersionId) {
    return false;
  }

  if (request.appId === "steam" || request.appId?.startsWith("steam:")) {
    return false;
  }

  const executablePath = request.executablePath.toLowerCase().replace(/\\/g, "/");

  if (request.appId === "hoyoplay" || looks_like_hoyoplay_executable(executablePath)) {
    return false;
  }

  return !/\/steam\/steam\.exe$/i.test(executablePath);
}

function strip_archive_extension(targetPath: string): string {
  return targetPath
    .replace(/\.tar\.gz$/i, "")
    .replace(/\.tgz$/i, "")
    .replace(/\.zip$/i, "")
    .replace(/\.7z$/i, "")
    .replace(/\.dmg$/i, "");
}

function create_wine_environment(
  bottlePath: string,
  debugFlagMode: string,
  loggingLevel: string,
  wineDebugArgs: string,
  wineRuntimePath?: string,
  launcherOptionsManifest?: WineLauncherOptionsManifest,
): Record<string, string> {
  const env: Record<string, string> = {
    WINEPREFIX: bottlePath,
  };
  const manifest = launcherOptionsManifest ?? read_wine_launcher_options_manifest(wineRuntimePath);
  const wineDebug = resolve_wine_debug_env(debugFlagMode, loggingLevel, wineDebugArgs);

  apply_wine_launcher_options_manifest_defaults(env, manifest);

  if (wineDebug) {
    env.WINEDEBUG = wineDebug;
  }

  return env;
}

function pick_launch_option_env(env: Record<string, string>): Record<string, string> {
  const keys = [
    "WINEMSYNC",
    "WINE_STEAMWEBHELPER_ARGS",
    "WINE_HOYOPLAY_ARGS",
    "WINE_ENABLE_TIMEOUT_FIX",
    "WINE_ENABLE_DISCONNECT",
    "WINE_HOYO_DISCONNECT_SECONDS",
    "SUPERVISE_STEAM_WAIT_SECONDS",
    "DXMT_CONFIG",
    "MTL_HUD_ENABLED",
  ];

  return keys.reduce<Record<string, string>>((picked, key) => {
    if (env[key] !== undefined) {
      picked[key] = env[key];
    }

    return picked;
  }, {});
}

function read_wine_launcher_options_manifest(wineRuntimePath?: string): WineLauncherOptionsManifest | undefined {
  for (const candidatePath of wine_runtime_manifest_candidates(wineRuntimePath)) {
    try {
      const manifest = parse_wine_launcher_options_manifest(readFileSync(candidatePath, "utf8"));

      if (manifest) {
        return manifest;
      }
    } catch {
      // Launcher metadata is optional. Missing or invalid metadata should never
      // stop Wine from launching.
    }
  }

  return undefined;
}

function assert_hoyo_overseer_supported_wine(wineRuntimePath: string | undefined, wineRoot: string): void {
  const manifest = read_wine_launcher_options_manifest(wineRuntimePath);

  if (!manifest) {
    throw new Error(
      `Unsupported Wine runtime for HoYo games: launcher metadata was not found, so the launcher cannot confirm that this Wine build includes HoYo routing patches. Install a BDHI WineHQ 11.x runtime that ships share/bdhi/launcher-options.json. Runtime: ${wineRoot}`,
    );
  }

  const groupIds = new Set(manifest.groups.map((group) => group.id));
  const missingGroups = ["hoyo-routing", "hoyo-network"].filter((groupId) => !groupIds.has(groupId));

  if (missingGroups.length > 0) {
    throw new Error(
      `Unsupported Wine runtime for HoYo games: ${manifest.name} does not declare the required HoYo support groups (${missingGroups.join(", ")}). HoYoPlay supervision needs the patched route/timeout behavior from the BDHI WineHQ 11.x builds. Runtime: ${wineRoot}`,
    );
  }
}

function wine_runtime_manifest_candidates(wineRuntimePath?: string): string[] {
  if (!wineRuntimePath) {
    return [];
  }

  const runtimePath = expand_user_home_path(wineRuntimePath);
  const runtimeRoots = [
    runtimePath,
    strip_archive_extension(runtimePath),
  ].filter((candidate, index, candidates): candidate is string => Boolean(candidate) && candidates.indexOf(candidate) === index);

  return runtimeRoots.flatMap((runtimeRoot) => [
    path.join(runtimeRoot, "share", "bdhi", "launcher-options.json"),
    path.join(runtimeRoot, "Contents", "Resources", "wine", "share", "bdhi", "launcher-options.json"),
    path.join(runtimeRoot, "Contents", "Resources", "share", "bdhi", "launcher-options.json"),
  ]);
}

function apply_launch_options_to_env(
  env: Record<string, string>,
  options: BottleLaunchOptionsPayload,
) {
  set_boolean_env(env, "WINEMSYNC", options.enableMsync);
  set_boolean_env(env, "WINE_ENABLE_TIMEOUT_FIX", options.enableTimeoutFix);
  set_boolean_env(env, "MTL_HUD_ENABLED", options.metalHud);
  set_boolean_env(env, "DXMT_METALFX_SPATIAL_SWAPCHAIN", options.dxmtMetalFxSpatialUpscale);
  set_boolean_env(env, "WINE_ENABLE_DISCONNECT", options.networkGate);
  set_boolean_env(env, "WAIT_FOR_MANUAL_NETWORK_CUT", options.waitForManualNetworkCut);
  set_boolean_env(env, "AUTO_NETWORK_CUT", options.autoNetworkCut);
  set_boolean_env(env, "SUPERVISOR_ALLOW_DUPLICATE_GAME", options.allowDuplicateGame);
  set_number_env(env, "WINE_HOYO_DISCONNECT_SECONDS", options.networkGateSeconds);
  set_number_env(env, "AUTO_NETWORK_RECONNECT_SECONDS", options.autoNetworkReconnectSeconds);
  set_number_env(env, "SUPERVISE_STEAM_WAIT_SECONDS", options.superviseWaitSeconds);
  set_dxmt_config(env, "d3d11.preferredMaxFrameRate", options.dxmtPreferredMaxFrameRate);
  set_dxmt_config(env, "d3d11.metalSpatialUpscaleFactor", options.dxmtMetalFxSpatialUpscaleFactor);

  if (options.hoyoplayInProcessGpu) {
    env.WINE_HOYOPLAY_ARGS = "--in-process-gpu";
  }
}

function executable_args_with_launch_options(
  executablePath: string,
  executableArgs: string[],
  options: BottleLaunchOptionsPayload,
): string[] {
  if (!options.hoyoplayInProcessGpu || !looks_like_hoyoplay_executable(executablePath)) {
    return executableArgs;
  }

  return executableArgs.some((arg) => arg === "--in-process-gpu")
    ? executableArgs
    : ["--in-process-gpu", ...executableArgs];
}

async function apply_wine_registry_launch_options(
  wineCommand: string,
  bottlePath: string,
  options: BottleLaunchOptionsPayload,
  logger: { warn: (...args: unknown[]) => void },
): Promise<void> {
  const values: Array<[string, string]> = [];

  if (options.leftCommandIsCtrl !== undefined) {
    values.push(["LeftCommandIsCtrl", options.leftCommandIsCtrl ? "y" : "n"]);
  }

  if (options.retinaMode !== undefined) {
    values.push(["RetinaMode", options.retinaMode ? "y" : "n"]);
  }

  for (const [name, value] of values) {
    try {
      await run_wine_reg_add(wineCommand, bottlePath, name, value);
    } catch (error) {
      logger.warn("failed to apply Wine Mac Driver launch option", {
        name,
        value,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

function run_wine_reg_add(
  wineCommand: string,
  bottlePath: string,
  valueName: string,
  value: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      wineCommand,
      [
        "reg",
        "add",
        "HKCU\\Software\\Wine\\Mac Driver",
        "/v",
        valueName,
        "/t",
        "REG_SZ",
        "/d",
        value,
        "/f",
      ],
      {
        cwd: bottlePath,
        env: {
          ...process.env,
          WINEPREFIX: bottlePath,
          WINEDEBUG: "-all",
        },
      },
    );

    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`wine reg exited with code ${code ?? "unknown"}.`));
    });
  });
}

function set_boolean_env(
  env: Record<string, string>,
  name: string,
  value: boolean | undefined,
) {
  if (value !== undefined) {
    env[name] = value ? "1" : "0";
  }
}

function set_number_env(
  env: Record<string, string>,
  name: string,
  value: number | undefined,
) {
  if (value !== undefined) {
    env[name] = String(value);
  }
}

function set_dxmt_config(
  env: Record<string, string>,
  name: string,
  value: number | undefined,
) {
  if (value === undefined || !Number.isFinite(value)) {
    return;
  }

  const existingConfig = env.DXMT_CONFIG?.trim();
  const existingConfigIsFile = Boolean(existingConfig && looks_like_dxmt_config_file(existingConfig));

  if (existingConfigIsFile && !env.DXMT_CONFIG_FILE) {
    env.DXMT_CONFIG_FILE = existingConfig;
  }

  const configPrefix = existingConfig && !existingConfigIsFile
    ? existingConfig.replace(/;?\s*$/, ";")
    : "";
  env.DXMT_CONFIG = `${configPrefix}${name}=${value};`;
}

function looks_like_dxmt_config_file(value: string): boolean {
  return value.endsWith(".conf") || value.includes("/") || value.includes("\\");
}

function looks_like_hoyoplay_executable(executablePath: string): boolean {
  const normalized = executablePath.toLowerCase().replace(/\\/g, "/");

  return normalized.includes("hoyoplay") || normalized.endsWith("/launcher.exe");
}

function steam_app_id_from_args(args: string[] | undefined): string | undefined {
  const appLaunchIndex = args?.findIndex((arg) => arg === "-applaunch") ?? -1;

  if (!args || appLaunchIndex < 0) {
    return undefined;
  }

  return args[appLaunchIndex + 1];
}

function launcher_from_run_request(
  request: RunBottleExecutablePayload,
  executablePath: string,
): BottleLauncherKind | undefined {
  if (request.appId === "steam") {
    return "steam";
  }

  if (request.appId === "hoyoplay") {
    return "hoyoplay";
  }

  const normalizedExecutablePath = executablePath.toLowerCase().replace(/\\/g, "/");

  if (normalizedExecutablePath.endsWith("/steam.exe")) {
    return "steam";
  }

  if (normalizedExecutablePath.endsWith("/hoyoplay.exe")) {
    return "hoyoplay";
  }

  return undefined;
}

function should_use_hoyo_overseer_launch(
  request: RunBottleExecutablePayload,
  appName: string,
  executablePath: string,
): boolean {
  if (request.appId === "hoyoplay" || request.appId?.startsWith("hoyo:")) {
    return true;
  }

  if (looks_like_hoyoplay_executable(executablePath)) {
    return true;
  }

  return false;
}

function should_apply_steam_webhelper_args(request: RunBottleExecutablePayload): boolean {
  const searchable = [
    request.appId,
    request.appName,
    request.executablePath,
    ...(request.executableArgs ?? []),
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ")
    .toLowerCase()
    .replace(/\\/g, "/");

  return searchable.includes("steam")
    || searchable.includes("steam.exe")
    || searchable.includes("steamsetup.exe");
}

function wait_for_early_process_exit(
  done: Promise<number>,
  timeoutMs: number,
): Promise<{ code?: number; error?: string } | undefined> {
  return Promise.race([
    done.then(
      (code) => ({ code }),
      (error) => ({ error: error instanceof Error ? error.message : String(error) }),
    ),
    new Promise<undefined>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

function resolve_wine_debug_env(
  debugFlagMode: string,
  loggingLevel: string,
  wineDebugArgs: string,
): string | undefined {
  if (debugFlagMode === "wineDebug") {
    return wineDebugArgs.trim() || "-all";
  }

  switch (loggingLevel) {
    case "error":
      return "-all,err+all";
    case "warn":
      return "-all,err+all,warn+all";
    case "info":
      return "-all,err+all,warn+all,fixme+all";
    case "debug":
      return "-all,err+all,warn+all,fixme+all,trace+seh,trace+process,trace+loaddll,trace+module";
    case "all":
      return "+all";
    case "off":
    default:
      return "-all";
  }
}

function get_launcher_installer(launcher: BottleLauncherKind): {
  label: string;
  url: string;
  fileName: string;
} {
  if (launcher === "steam") {
    return {
      label: "Steam",
      url: STEAM_WINDOWS_INSTALLER_URL,
      fileName: "SteamSetup.exe",
    };
  }

  return {
    label: "HoYoPlay",
    url: HOYOPLAY_WINDOWS_INSTALLER_URL,
    fileName: "HoYoPlaySetup.exe",
  };
}

function escape_apple_script_string(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function activate_macos_process(candidateNames: Array<string | undefined>): void {
  if (process.platform !== "darwin") {
    return;
  }

  const names = Array.from(
    new Set(
      candidateNames
        .map((name) => name?.trim())
        .filter((name): name is string => Boolean(name)),
    ),
  );

  if (names.length === 0) {
    return;
  }

  const list = names
    .map((name) => `"${escape_apple_script_string(name)}"`)
    .join(", ");
  const script = `
tell application "System Events"
  set candidateNames to {${list}}
  repeat with candidateName in candidateNames
    try
      if exists process (candidateName as text) then
        tell process (candidateName as text)
          set frontmost to true
          try
            perform action "AXRaise" of window 1
          end try
        end tell
        return
      end if
    end try
  end repeat
end tell
`;

  const foregroundProcess = spawn("osascript", ["-e", script], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  foregroundProcess.unref();
}

function request_wine_window_foreground(appName?: string | Array<string | undefined>): void {
  if (process.platform !== "darwin") {
    return;
  }

  const requestedNames = Array.isArray(appName) ? appName : [appName];
  const candidates = [
    ...requestedNames,
    "SteamSetup.exe",
    "SteamSetup",
    "Steam Setup",
    "Steam Installer",
    "HoYoPlaySetup.exe",
    "HoYoPlaySetup",
    "HoYoPlay Setup",
    "HoYoPlay Installer",
    "Steam",
    "HoYoPlay",
    "Wine",
    "wine64",
    "XQuartz",
  ];

  for (const delay of [350, 900, 1600, 2600]) {
    setTimeout(() => activate_macos_process(candidates), delay);
  }
}

function normalize_executable_path(executablePath: string): string {
  if (is_windows_path(executablePath)) {
    return executablePath;
  }

  return expand_user_home_path(executablePath);
}

function get_process_cwd(executablePath: string, bottlePath: string): string {
  if (is_windows_path(executablePath)) {
    return bottlePath;
  }

  const normalizedPath = expand_user_home_path(executablePath);

  if (path.isAbsolute(normalizedPath)) {
    return path.dirname(normalizedPath);
  }

  return bottlePath;
}

function app_name_from_executable_path(executablePath: string): string {
  const normalizedPath = executablePath.replace(/\\/g, "/");
  const fileName = normalizedPath.split("/").filter(Boolean).pop() ?? "Wine App";

  return fileName.replace(/\.[^.]+$/, "") || "Wine App";
}

function create_wine_app_log_file_name(
  bottleName: string,
  appName: string,
  bottleId: string,
  appId?: string,
): string {
  return path.join(
    "bottles",
    safe_log_file_part(bottleName, bottleId),
    `${safe_log_file_part(appName, appId ?? "app")}.log`,
  );
}

function safe_log_file_part(value: string, fallback = "unknown"): string {
  const normalized = value
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/^-+|-+$/g, "");

  if (normalized) {
    return normalized;
  }

  return fallback
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}

function is_windows_path(targetPath: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(targetPath);
}

function is_executable_file(targetPath: string): boolean {
  try {
    const stat = statSync(targetPath);
    return existsSync(targetPath) && stat.isFile() && (stat.mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

function safe_is_file(targetPath: string): boolean {
  try {
    return statSync(targetPath).isFile();
  } catch {
    return false;
  }
}

function first_existing_directory(paths: string[]): string | undefined {
  return paths.find((targetPath) => existsSync(targetPath) && safe_is_directory(targetPath));
}

function first_existing_file(paths: string[]): string | undefined {
  return paths.find((targetPath) => existsSync(targetPath) && safe_is_file(targetPath));
}

function expand_user_home_path(targetPath: string): string {
  if (targetPath === "~") {
    return os.homedir();
  }

  if (targetPath.startsWith("~/")) {
    return path.join(os.homedir(), targetPath.slice(2));
  }

  return targetPath;
}

function prefix_session_key(prefixPath: string): string {
  return path.resolve(expand_user_home_path(prefixPath));
}

export const bottleExecutionManager = new BottleExecutionManager();
