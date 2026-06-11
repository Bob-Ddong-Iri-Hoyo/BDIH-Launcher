import { WebContents } from "electron";
import { spawn } from "child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "fs";
import { request as httpsRequest } from "https";
import os from "os";
import path from "path";
import { HOYOPLAY_WINDOWS_INSTALLER_URL, STEAM_WEBHELPER_ARGUMENTS, STEAM_WINDOWS_INSTALLER_URL } from "../../Common/Constant/RuntimeSources";
import {
  BottleLauncherKind,
  BottleTaskResultPayload,
  BottleTaskStatusPayload,
  IPC_CHANNELS,
  InstallBottleLauncherPayload,
  RunBottleExecutablePayload,
  RunBottleExecutableResultPayload,
  SetupBottlePrefixPayload,
} from "../../Common/Types/IPC";
import { downloadManager } from "./DownloadManager";
import { processManager } from "./ProcessManager";
import { logManager } from "./LogManager";
import { preferenceManager } from "./PreferenceManager";

export class BottleExecutionManager {
  private readonly logger = logManager.createLogger({ file: "wine", source: "bottle" });
  private readonly activeWinePrefixes = new Map<string, {
    bottleName: string;
    wineRuntimePath?: string;
  }>();

  async setupPrefix(
    request: SetupBottlePrefixPayload,
    sender?: WebContents,
  ): Promise<BottleTaskResultPayload> {
    const bottlePath = expand_user_home_path(request.bottlePath);
    this.trackWinePrefix(request);

    try {
      mkdirSync(bottlePath, { recursive: true });
      this.sendStatus(sender, {
        bottleId: request.bottleId,
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
      );

      this.sendStatus(sender, {
        bottleId: request.bottleId,
        stage: "dxmt",
        progress: 82,
        message: request.dxmtVersionId
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
        stage: "ready",
        progress: 100,
        message: `${request.bottleName} is ready.`,
      });

      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.sendStatus(sender, {
        bottleId: request.bottleId,
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
          message: `${installer.label} installer downloaded. Click again to run it in Wine.`,
        });

        return { ok: true };
      } else {
        this.sendStatus(sender, {
          bottleId: request.bottleId,
          launcher: request.launcher,
          stage: "download",
          progress: 70,
          message: `${installer.label} installer is ready. Starting in Wine.`,
        });
      }

      this.sendStatus(sender, {
        bottleId: request.bottleId,
        launcher: request.launcher,
        stage: "install",
        progress: 72,
        message: `${installer.label} installer is starting in Wine.`,
      });

      await this.launchInstallerExecutable(request, installerPath, installer.label);

      this.sendStatus(sender, {
        bottleId: request.bottleId,
        launcher: request.launcher,
        stage: "ready",
        progress: 100,
        message: `${installer.label} installer launched in Wine. Complete setup in the installer window.`,
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
    this.trackWinePrefix(request);
    const appName = request.appName?.trim() || app_name_from_executable_path(executablePath);
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
    const env: Record<string, string> = {
      WINEPREFIX: bottlePath,
    };
    const wineDebug = resolve_wine_debug_env(preference.debugFlagMode, preference.loggingLevel, preference.wineDebugArgs);

    if (wineDebug) {
      env.WINEDEBUG = wineDebug;
    }

    if (should_apply_steam_webhelper_args(request)) {
      env.WINE_STEAMWEBHELPER_ARGS = STEAM_WEBHELPER_ARGUMENTS;
    }

    try {
      const wineCommand = resolve_wine_tool(request.wineRuntimePath, "wine64");
      const process = processManager.startProcess(processId, {
        command: wineCommand,
        args: [
          normalize_executable_path(executablePath),
          ...(request.executableArgs ?? []),
        ],
        cwd: get_process_cwd(executablePath, bottlePath),
        env,
        onLog: (data) => appLogger.info("stdout", data.trim()),
        onError: (data) => appLogger.warn("stderr", data.trim()),
      });
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
      });
      this.logger.info("bottle executable started", {
        bottleId: request.bottleId,
        bottleName: request.bottleName,
        appId: request.appId,
        appName,
        wineVersionId: request.wineVersionId,
        wineCommand,
        executablePath,
      });

      const earlyExit = await wait_for_early_process_exit(process.done, 1200);

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
        processId,
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

  private async launchInstallerExecutable(
    request: InstallBottleLauncherPayload,
    executablePath: string,
    installerLabel: string,
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
    const command = resolve_wine_tool(request.wineRuntimePath, "wine64");
    const processId = `bottle:${request.bottleId}:installer:${request.launcher}:${Date.now().toString(36)}`;
    const env = create_wine_environment(
      bottlePath,
      preference.debugFlagMode,
      preference.loggingLevel,
      preference.wineDebugArgs,
    );

    if (request.launcher === "steam") {
      env.WINE_STEAMWEBHELPER_ARGS = STEAM_WEBHELPER_ARGUMENTS;
    }

    const process = processManager.startProcess(processId, {
      command,
      args: [normalize_executable_path(executablePath)],
      cwd: bottlePath,
      env,
      onLog: (data) => appLogger.info("stdout", data.trim()),
      onError: (data) => appLogger.warn("stderr", data.trim()),
    });

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
  }

  async stopAllWineProcesses(): Promise<void> {
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

  async stopProcess(processId: string): Promise<void> {
    await processManager.stopProcess(processId);
  }

  private trackWinePrefix(request: Pick<SetupBottlePrefixPayload, "bottlePath" | "bottleName" | "wineRuntimePath">): void {
    const bottlePath = expand_user_home_path(request.bottlePath);

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
    const command = resolve_wine_tool(request.wineRuntimePath, toolName);
    const bottlePath = expand_user_home_path(request.bottlePath);
    const preference = await preferenceManager.getPreference();
    const processId = `bottle:${request.bottleId}:${toolName}:${Date.now().toString(36)}`;
    const env = create_wine_environment(
      bottlePath,
      preference.debugFlagMode,
      preference.loggingLevel,
      preference.wineDebugArgs,
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
              progress: Math.min(70, Math.max(2, progress * 0.7)),
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

function is_wine_prefix_ready(bottlePath: string): boolean {
  return existsSync(path.join(bottlePath, "system.reg")) || existsSync(path.join(bottlePath, "user.reg"));
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
): Record<string, string> {
  const env: Record<string, string> = {
    WINEPREFIX: bottlePath,
  };
  const wineDebug = resolve_wine_debug_env(debugFlagMode, loggingLevel, wineDebugArgs);

  if (wineDebug) {
    env.WINEDEBUG = wineDebug;
  }

  return env;
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
    return wineDebugArgs.trim() || undefined;
  }

  if (loggingLevel === "off") {
    return "-all";
  }

  return undefined;
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
  return `wine-${safe_log_file_part(bottleName, bottleId)}__${safe_log_file_part(appName, appId ?? "app")}.log`;
}

function safe_log_file_part(value: string, fallback = "unknown"): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (normalized) {
    return normalized;
  }

  return fallback
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
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

function expand_user_home_path(targetPath: string): string {
  if (targetPath === "~") {
    return os.homedir();
  }

  if (targetPath.startsWith("~/")) {
    return path.join(os.homedir(), targetPath.slice(2));
  }

  return targetPath;
}

export const bottleExecutionManager = new BottleExecutionManager();
