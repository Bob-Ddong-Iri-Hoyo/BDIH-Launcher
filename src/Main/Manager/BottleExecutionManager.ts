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

const LAUNCHER_EXECUTABLE_DETECT_TIMEOUT_MS = 10 * 60 * 1000;
const LAUNCHER_EXECUTABLE_DETECT_INTERVAL_MS = 1000;
const LAUNCHER_EXECUTABLE_STABLE_MS = 2000;
const PREFIX_SESSION_WATCH_DELAY_MS = 500;
const HOYO_STEAM_STUB_WIN_PATH = "C:\\windows\\system32\\steam.exe";
const DXMT_RUNTIME_CACHE_DIR_NAME = ".cache/dxmt";

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
            dxmtVersionId: shouldPrepareDxmt ? request.dxmtVersionId : undefined,
            dxmtPackagePath: shouldPrepareDxmt ? request.dxmtPackagePath : undefined,
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

    const env = create_wine_environment(
      bottlePath,
      preference.debugFlagMode,
      preference.loggingLevel,
      preference.wineDebugArgs,
      request.wineRuntimePath,
      launcherOptionsManifest,
    );

    apply_launch_options_to_env(env, launchOptions);

    const supportsSteamWebHelperArgs = is_launch_option_supported_by_manifest("steamWebHelperArgs", launcherOptionsManifest);

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
      await apply_wine_registry_launch_options(wineCommand, bottlePath, launchOptions, appLogger);
      const executableArgs = executable_args_with_launch_options(
        executablePath,
        request.executableArgs ?? [],
        launchOptions,
      );
      const launcherSessionKind = launcher_from_run_request(request, executablePath);
      const process = processManager.startProcess(processId, {
        command: wineCommand,
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
            request,
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
        wineCommand,
        executablePath,
        launchOptions,
      });
      this.logger.info("bottle executable started", {
        bottleId: request.bottleId,
        bottleName: request.bottleName,
        appId: request.appId,
        appName,
        wineVersionId: request.wineVersionId,
        wineCommand,
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
    const appId = `hoyo:${event.game}`;
    const appName = hoyo_game_display_name(event.game);
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
      executableArgs: event.stubArgs,
    };
    const eventLaunchOptions = filter_launch_options_by_manifest(
      resolve_launch_options_for_app(
        {
          id: appId,
          name: appName,
          source: "game",
          executablePath: event.targetWin,
        },
        context.request.launchOptions,
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
      wineCommand,
      processId,
      launchOptions,
      preference,
      gameKind,
    } = context;
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
      const wineRoot = resolve_wine_runtime_root(request.wineRuntimePath, wineCommand);
      assert_hoyo_overseer_supported_wine(request.wineRuntimePath, wineRoot);
      const gameWinPath = wine_z_path(gameHostPath);
      const gameHostDir = path.dirname(gameHostPath);
      const gameExe = path.basename(gameHostPath);
      const dataRootPath = expand_user_home_path(preference.dataRootPath);
      const env = create_wine_environment(
        gamePrefixPath,
        preference.debugFlagMode,
        preference.loggingLevel,
        preference.wineDebugArgs,
        request.wineRuntimePath,
      );

      apply_launch_options_to_env(env, {
        enableMsync: true,
        enableTimeoutFix: true,
        ...launchOptions,
      });
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
      });

      const dxmtRuntimePath = await resolve_dxmt_runtime_dir(
        request.dxmtPackagePath,
        request.dxmtVersionId,
        gamePrefixPath,
        appLogger,
      );
      const protonExtrasPath = resolve_protonextras_root(wineRoot);
      const dxmtConfigPath = path.join(dataRootPath, "dxmt.conf");

      if (dxmtConfigPath && existsSync(dxmtConfigPath)) {
        env.DXMT_CONFIG_FILE = dxmtConfigPath;

        if (!env.DXMT_CONFIG) {
          env.DXMT_CONFIG = dxmtConfigPath;
        }
      }

      env.DXMT_DIR = dxmtRuntimePath;
      env.PROTONEXTRAS = protonExtrasPath;

      mkdirSync(gamePrefixPath, { recursive: true });
      await this.bootstrapHoyoGamePrefix(request, wineCommand, gamePrefixPath, appLogger);
      await apply_wine_registry_launch_options(wineCommand, gamePrefixPath, launchOptions, appLogger);
      prepare_hoyo_zzz_runtime_files({
        dxmtRuntimePath,
        gamePrefixPath,
        protonExtrasPath,
        wineRoot,
      });
      await clear_hoyo_zzz_webview_override(wineCommand, gamePrefixPath, appLogger);

      const process = processManager.startProcess(processId, {
        command: wineCommand,
        args: [
          HOYO_STEAM_STUB_WIN_PATH,
          gameWinPath,
          ...(request.executableArgs ?? []),
        ],
        cwd: gameHostDir,
        env,
        onLog: (data) => appLogger.info("stdout", data.trim()),
        onError: (data) => appLogger.warn("stderr", data.trim()),
      });
      const prefixSessionProcessId = this.startPrefixSession(
        {
          ...request,
          bottlePath: gamePrefixPath,
        },
        {
          launcher: "hoyoplay",
          appId: request.appId ?? `hoyo:${gameKind}`,
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
        wineCommand,
        wineRoot,
        gamePrefixPath,
        gameHostPath,
        gameWinPath,
        dxmtRuntimePath,
        protonExtrasPath,
        launchOptions,
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
      wineCommand,
      processId,
      launchOptions,
      preference,
      gameKind,
    } = context;
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
      const wineRoot = resolve_wine_runtime_root(request.wineRuntimePath, wineCommand);

      assert_hoyo_overseer_supported_wine(request.wineRuntimePath, wineRoot);

      const dataRootPath = expand_user_home_path(preference.dataRootPath);
      const gameWinPath = wine_z_path(gameHostPath);
      const gameHostDir = path.dirname(gameHostPath);
      const gameExe = path.basename(gameHostPath);
      const jadeite = resolve_jadeite_runtime(dataRootPath, request.jadeiteRuntimePath);
      const dxmtRuntimePath = await resolve_dxmt_runtime_dir(
        request.dxmtPackagePath,
        request.dxmtVersionId,
        gamePrefixPath,
        appLogger,
      );
      const protonExtrasPath = resolve_protonextras_root(wineRoot);
      const env = create_wine_environment(
        gamePrefixPath,
        preference.debugFlagMode,
        preference.loggingLevel,
        preference.wineDebugArgs,
        request.wineRuntimePath,
      );
      const hsrLaunchOptions = {
        enableMsync: true,
        enableTimeoutFix: true,
        networkGate: true,
        networkGateSeconds: 15,
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
        WINEDLLOVERRIDES: env.WINEDLLOVERRIDES ?? "",
        WINE_ENABLE_TIMEOUT_FIX: env.WINE_ENABLE_TIMEOUT_FIX ?? "1",
        WINE_ENABLE_DISCONNECT: env.WINE_ENABLE_DISCONNECT ?? "1",
        WINE_HOYO_DISCONNECT_SECONDS: env.WINE_HOYO_DISCONNECT_SECONDS ?? "15",
        WINEMSYNC: env.WINEMSYNC ?? "1",
        DXMT_LOG_PATH: env.DXMT_LOG_PATH ?? dataRootPath,
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
      env.DXMT_DIR = dxmtRuntimePath;
      env.PROTONEXTRAS = protonExtrasPath;

      mkdirSync(gamePrefixPath, { recursive: true });
      await this.bootstrapHoyoGamePrefix(request, wineCommand, gamePrefixPath, appLogger);
      await apply_wine_registry_launch_options(wineCommand, gamePrefixPath, launchOptions, appLogger);
      prepare_hoyo_zzz_runtime_files({
        dxmtRuntimePath,
        gamePrefixPath,
        protonExtrasPath,
        wineRoot,
      });
      prepare_hoyo_kernel_shims(wineRoot, gamePrefixPath);
      await install_hoyoprotect_service(wineCommand, gamePrefixPath, gameHostDir, appLogger);

      const restoreGameDxmt = stash_game_local_dxmt_files(gameHostDir, gamePrefixPath, appLogger);
      const executableArgs = request.executableArgs && request.executableArgs.length > 0
        ? request.executableArgs
        : ["-disable-gpu-skinning"];
      const process = processManager.startProcess(processId, {
        command: wineCommand,
        args: [
          "jadeite.exe",
          gameWinPath,
          "--",
          ...executableArgs,
        ],
        cwd: jadeite.rootPath,
        env: without_env_keys(env, ["DXMT_CONFIG", "DXMT_CONFIG_FILE", "DXMT_ENABLE_NVEXT"]),
        onLog: (data) => appLogger.info("stdout", data.trim()),
        onError: (data) => appLogger.warn("stderr", data.trim()),
      });
      const prefixSessionProcessId = this.startPrefixSession(
        {
          ...request,
          bottlePath: gamePrefixPath,
        },
        {
          launcher: "hoyoplay",
          appId: request.appId ?? "hoyo:hsr",
          appName,
        },
        sender,
      );

      process.done.then(restoreGameDxmt, restoreGameDxmt);
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
        wineCommand,
        gamePrefixPath,
        gameHostPath,
        gameWinPath,
        jadeiteRootPath: jadeite.rootPath,
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
      wineCommand,
      processId,
      launchOptions,
      preference,
      gameKind,
    } = context;
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
      const wineRoot = resolve_wine_runtime_root(request.wineRuntimePath, wineCommand);

      assert_hoyo_overseer_supported_wine(request.wineRuntimePath, wineRoot);

      const dataRootPath = expand_user_home_path(preference.dataRootPath);
      const gameWinPath = wine_z_path(gameHostPath);
      const gameHostDir = path.dirname(gameHostPath);
      const gameExe = path.basename(gameHostPath);
      const dxmtRuntimePath = await resolve_dxmt_runtime_dir(
        request.dxmtPackagePath,
        request.dxmtVersionId,
        gamePrefixPath,
        appLogger,
      );
      const protonExtrasPath = resolve_protonextras_root(wineRoot);
      const env = create_wine_environment(
        gamePrefixPath,
        preference.debugFlagMode,
        preference.loggingLevel,
        preference.wineDebugArgs,
        request.wineRuntimePath,
      );
      const genshinArgs = ["-platform_type", "CLOUD_THIRD_PARTY_PC", "-is_cloud", "1"];

      apply_launch_options_to_env(env, {
        enableMsync: true,
        enableTimeoutFix: true,
        networkGate: false,
        ...launchOptions,
      });
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
        WINE_ENABLE_DISCONNECT: env.WINE_ENABLE_DISCONNECT ?? "0",
        WINEMSYNC: env.WINEMSYNC ?? "1",
        DXMT_LOG_PATH: env.DXMT_LOG_PATH ?? dataRootPath,
        WINE_HOYO_GENSHIN_ARGS: genshinArgs.join(" "),
        GST_PLUGIN_FEATURE_RANK: env.GST_PLUGIN_FEATURE_RANK ?? "atdec:MAX,avdec_h264:MAX",
        WINE_ALLOW_HOYOPROTECT_SERVICE: env.WINE_ALLOW_HOYOPROTECT_SERVICE ?? "1",
        WINE_BLOCK_HOYOPROTECT_SERVICE: env.WINE_BLOCK_HOYOPROTECT_SERVICE ?? "0",
      });
      env.DXMT_DIR = dxmtRuntimePath;
      env.PROTONEXTRAS = protonExtrasPath;

      mkdirSync(gamePrefixPath, { recursive: true });
      await this.bootstrapHoyoGamePrefix(request, wineCommand, gamePrefixPath, appLogger);
      await apply_wine_registry_launch_options(wineCommand, gamePrefixPath, launchOptions, appLogger);
      prepare_hoyo_zzz_runtime_files({
        dxmtRuntimePath,
        gamePrefixPath,
        protonExtrasPath,
        wineRoot,
      });
      prepare_hoyo_kernel_shims(wineRoot, gamePrefixPath);
      await install_hoyoprotect_service(wineCommand, gamePrefixPath, gameHostDir, appLogger);

      const restoreGameDxmt = stash_game_local_dxmt_files(gameHostDir, gamePrefixPath, appLogger);
      const executableArgs = append_missing_argument_sequence(request.executableArgs ?? [], genshinArgs);
      const process = processManager.startProcess(processId, {
        command: wineCommand,
        args: [
          gameWinPath,
          ...executableArgs,
        ],
        cwd: gameHostDir,
        env: without_env_keys(env, [
          "DXMT_CONFIG",
          "DXMT_CONFIG_FILE",
          "DXMT_ENABLE_NVEXT",
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
          "WINE_HOYO_GAME",
          "WINE_HOYO_SET_STEAM_ENV",
        ]),
        onLog: (data) => appLogger.info("stdout", data.trim()),
        onError: (data) => appLogger.warn("stderr", data.trim()),
      });
      const prefixSessionProcessId = this.startPrefixSession(
        {
          ...request,
          bottlePath: gamePrefixPath,
        },
        {
          launcher: "hoyoplay",
          appId: request.appId ?? "hoyo:genshin",
          appName,
        },
        sender,
      );

      process.done.then(restoreGameDxmt, restoreGameDxmt);
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
        wineCommand,
        gamePrefixPath,
        gameHostPath,
        gameWinPath,
        dxmtRuntimePath,
        launchOptions,
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
  ): Promise<void> {
    const system32Path = path.join(gamePrefixPath, "drive_c", "windows", "system32");
    const syswow64Path = path.join(gamePrefixPath, "drive_c", "windows", "syswow64");

    if (existsSync(system32Path) && existsSync(syswow64Path)) {
      return;
    }

    const winebootCommand = resolve_required_wine_tool(request.wineVersionId, request.wineRuntimePath, "wineboot");
    const baseEnv = {
      WINEPREFIX: gamePrefixPath,
      WINEDEBUG: "fixme-all,err-unwind,+timestamp",
    };

    appLogger.info("bootstrapping HoYo game prefix", { gamePrefixPath });
    await run_wine_command_best_effort(winebootCommand, ["-u"], gamePrefixPath, baseEnv, appLogger);
    await run_wine_command_best_effort(wineCommand, ["winecfg", "-v", "win10"], gamePrefixPath, baseEnv, appLogger);
    await stop_wine_prefix_best_effort(gamePrefixPath, request.wineRuntimePath, appLogger);
    mkdirSync(system32Path, { recursive: true });
    mkdirSync(syswow64Path, { recursive: true });
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

    if (
      request.launcher === "steam" &&
      is_launch_option_supported_by_manifest("steamWebHelperArgs", launcherOptionsManifest)
    ) {
      env.WINE_STEAMWEBHELPER_ARGS = STEAM_WEBHELPER_ARGUMENTS;
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
  return existsSync(path.join(bottlePath, "system.reg")) || existsSync(path.join(bottlePath, "user.reg"));
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
    throw new Error("DXMT runtime is required for Zenless Zone Zero. Download a DXMT version before launching.");
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

function prepare_hoyo_zzz_runtime_files(options: {
  dxmtRuntimePath: string;
  gamePrefixPath: string;
  protonExtrasPath: string;
  wineRoot: string;
}): void {
  const wineLibRoot = resolve_wine_lib_root(options.wineRoot);
  const system32Path = path.join(options.gamePrefixPath, "drive_c", "windows", "system32");
  const syswow64Path = path.join(options.gamePrefixPath, "drive_c", "windows", "syswow64");

  mkdirSync(system32Path, { recursive: true });
  mkdirSync(syswow64Path, { recursive: true });

  for (const name of ["d3d10core.dll", "d3d11.dll", "dxgi.dll", "winemetal.dll"]) {
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
  copy_required_file(
    path.join(options.dxmtRuntimePath, "x86_64-windows", "winemetal.dll"),
    path.join(system32Path, "winemetal.dll"),
    "DXMT winemetal.dll",
  );
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

function prepare_hoyo_kernel_shims(wineRoot: string, gamePrefixPath: string): void {
  const wineLibRoot = resolve_wine_lib_root(wineRoot);
  const system32Path = path.join(gamePrefixPath, "drive_c", "windows", "system32");
  const syswow64Path = path.join(gamePrefixPath, "drive_c", "windows", "syswow64");

  copy_required_file(
    path.join(wineLibRoot, "x86_64-windows", "ntoskrnl.exe"),
    path.join(system32Path, "ntoskrnl.exe"),
    "Wine x86_64 ntoskrnl.exe",
  );
  copy_required_file(
    path.join(wineLibRoot, "i386-windows", "ntoskrnl.exe"),
    path.join(syswow64Path, "ntoskrnl.exe"),
    "Wine i386 ntoskrnl.exe",
  );
  copy_required_file(
    path.join(wineLibRoot, "x86_64-windows", "wdfldr.sys"),
    path.join(system32Path, "wdfldr.sys"),
    "Wine x86_64 wdfldr.sys",
  );
  copy_required_file(
    path.join(wineLibRoot, "x86_64-windows", "wdfldr.sys"),
    path.join(system32Path, "drivers", "wdfldr.sys"),
    "Wine x86_64 wdfldr.sys",
  );
  copy_required_file(
    path.join(wineLibRoot, "i386-windows", "wdfldr.sys"),
    path.join(syswow64Path, "wdfldr.sys"),
    "Wine i386 wdfldr.sys",
  );
}

async function install_hoyoprotect_service(
  wineCommand: string,
  gamePrefixPath: string,
  gameHostDir: string,
  logger: ReturnType<typeof logManager.createLogger>,
): Promise<void> {
  const hoyoProtectSourcePath = path.join(gameHostDir, "HoYoKProtect.sys");

  if (!existsSync(hoyoProtectSourcePath)) {
    return;
  }

  const system32Path = path.join(gamePrefixPath, "drive_c", "windows", "system32");

  copy_required_file(
    hoyoProtectSourcePath,
    path.join(system32Path, "HoYoKProtect.sys"),
    "HoYoKProtect.sys",
  );

  const serviceKey = "HKLM\\System\\CurrentControlSet\\Services\\HoYoProtect";
  const registryWrites: string[][] = [
    ["/v", "DisplayName", "/t", "REG_SZ", "/d", "HoYoProtect"],
    ["/v", "ImagePath", "/t", "REG_EXPAND_SZ", "/d", "C:\\windows\\system32\\HoYoKProtect.sys"],
    ["/v", "Type", "/t", "REG_DWORD", "/d", "1"],
    ["/v", "Start", "/t", "REG_DWORD", "/d", "3"],
    ["/v", "ErrorControl", "/t", "REG_DWORD", "/d", "1"],
  ];

  for (const args of registryWrites) {
    await run_wine_command_best_effort(
      wineCommand,
      ["reg", "add", serviceKey, ...args, "/f"],
      gamePrefixPath,
      {
        WINEPREFIX: gamePrefixPath,
        WINEDEBUG: "fixme-all,err-unwind,+timestamp",
      },
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

function append_missing_argument_sequence(args: string[], sequence: string[]): string[] {
  const joinedArgs = args.join(" ");
  const joinedSequence = sequence.join(" ");

  return joinedArgs.includes(joinedSequence)
    ? args
    : [...args, ...sequence];
}

function without_env_keys(env: Record<string, string>, keys: string[]): Record<string, string> {
  const nextEnv = { ...env };

  for (const key of keys) {
    delete nextEnv[key];
  }

  return nextEnv;
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
    `Unsupported Wine runtime for HoYo ZZZ: this Wine build does not expose the lib/wine directories required to inject DXMT runtime files. Runtime: ${wineRoot}`,
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

function hoyo_game_display_name(game: HoyoGameKind): string {
  switch (game) {
    case "zzz":
      return "Zenless Zone Zero";
    case "hsr":
      return "Honkai: Star Rail";
    case "genshin":
      return "Genshin Impact";
  }
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
  // Steam uses its own launcher prefix and does not need the DXMT built-in
  // package to download or start SteamSetup.exe. Requiring DXMT here made Steam
  // installer downloads fail when a bottle recipe had a DXMT version selected
  // but that package had not been downloaded yet.
  return Boolean(request.dxmtVersionId && request.launcher !== "steam");
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

  return Boolean(hoyo_game_from_run_request(request, appName, executablePath));
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
