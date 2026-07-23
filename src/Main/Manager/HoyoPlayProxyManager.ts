import path from "path";
import type { HoyoOverseerGame } from "./WineOverseer";
import type {
  WineProcessEvent,
  WineProcessSnapshot,
} from "./WineProcessMonitor";
import { logManager } from "./LogManager";
import { runProgram } from "../Program/ChildProgram";

interface RegisterHoyoPlayProxyRouteRequest {
  bottleId: string;
  game: HoyoOverseerGame;
  launcherPrefixPath: string;
  gamePrefixPath: string;
  wineCommand: string;
  sourceWinePid?: number;
  stubPath?: string;
  targetWin: string;
  launcherSnapshot: WineProcessSnapshot;
  gameSnapshot: WineProcessSnapshot;
}

export type RegisterHoyoPlayProxyRouteResult =
  | {
      status: "accepted";
      bindingId: string;
    }
  | {
      status: "duplicate";
      bindingId: string;
      activeBindingId?: string;
      targetUnixPids: number[];
    };

interface HoyoPlayProxyBinding {
  id: string;
  routeKey: string;
  accepted: boolean;
  bottleId: string;
  game: HoyoOverseerGame;
  launcherPrefixPath: string;
  gamePrefixPath: string;
  wineCommand: string;
  sourceWinePid?: number;
  targetExecutableName: string;
  proxyWinePid?: number;
  gameSessionProcessId?: string;
  targetProcessSeen: boolean;
  targetWinePids: Set<number>;
  targetUnixPidsByWinePid: Map<number, number>;
  targetWinePidsAtRegistration: Set<number>;
  shouldTerminate: boolean;
  terminationReason?: string;
  terminating: boolean;
  createdAt: number;
}

interface TerminateHoyoPlayProxyRequest {
  wineCommand: string;
  launcherPrefixPath: string;
  proxyWinePid: number;
}

type TerminateHoyoPlayProxy = (
  request: TerminateHoyoPlayProxyRequest,
) => Promise<number>;

const logger = logManager.createLogger({ file: "wine", source: "hoyoplay-proxy" });
const HOYOPLAY_PROXY_EXECUTABLE = "hoyoplay-proxy.exe";

/**
 * Correlates HoYoPlay's launcher-prefix proxy with the real game process in a
 * dedicated game prefix. The proxy has no timeout of its own; BDIH terminates
 * it after the exact routed target executable has started and all matching
 * Wine processes have exited.
 */
export class HoyoPlayProxyManager {
  private readonly bindings = new Map<string, HoyoPlayProxyBinding>();
  private readonly bindingIdByProxy = new Map<string, string>();
  private readonly bindingIdsByGameSession = new Map<string, Set<string>>();
  private readonly activeBindingIdByRouteKey = new Map<string, string>();
  private readonly targetOwnerBindingIdByProcess = new Map<string, string>();
  private nextId = 0;

  constructor(
    private readonly terminateProxy: TerminateHoyoPlayProxy = terminate_hoyoplay_proxy,
  ) {}

  registerRoute(
    request: RegisterHoyoPlayProxyRouteRequest,
  ): RegisterHoyoPlayProxyRouteResult | undefined {
    if (windows_executable_name(request.stubPath) !== HOYOPLAY_PROXY_EXECUTABLE) {
      return undefined;
    }

    const targetExecutableName = windows_executable_name(request.targetWin);
    if (!targetExecutableName) {
      return undefined;
    }

    const launcherPrefixPath = normalize_prefix_path(request.launcherPrefixPath);
    const gamePrefixPath = normalize_prefix_path(request.gamePrefixPath);
    const routeKey = route_key(
      request.bottleId,
      request.game,
      gamePrefixPath,
      targetExecutableName,
    );
    const activeBindingId = this.activeBindingIdByRouteKey.get(routeKey);
    const activeBinding = activeBindingId
      ? this.bindings.get(activeBindingId)
      : undefined;
    const existingTargetProcesses = request.gameSnapshot.processes.filter((process) =>
      process.type === "start"
      && windows_executable_name(process.imagePath) === targetExecutableName
    );
    const duplicate = Boolean(activeBinding || existingTargetProcesses.length > 0);
    const id = `hoyoplay-proxy:${request.bottleId}:${request.game}:${Date.now().toString(36)}:${++this.nextId}`;
    const binding: HoyoPlayProxyBinding = {
      id,
      routeKey,
      accepted: !duplicate,
      bottleId: request.bottleId,
      game: request.game,
      launcherPrefixPath,
      gamePrefixPath,
      wineCommand: request.wineCommand,
      sourceWinePid: request.sourceWinePid,
      targetExecutableName,
      targetProcessSeen: false,
      targetWinePids: new Set(),
      targetUnixPidsByWinePid: new Map(),
      targetWinePidsAtRegistration: new Set(existingTargetProcesses.map((process) => process.winePid)),
      shouldTerminate: duplicate,
      terminationReason: duplicate
        ? "duplicate game route was rejected"
        : undefined,
      terminating: false,
      createdAt: Date.now(),
    };

    this.bindings.set(id, binding);
    if (!duplicate) {
      this.activeBindingIdByRouteKey.set(routeKey, id);
    }
    this.adoptProxyFromSnapshot(binding, request.launcherSnapshot);
    const targetUnixPids = unique_process_ids([
      ...existingTargetProcesses.map((process) => process.unixPid),
      ...(activeBinding ? activeBinding.targetUnixPidsByWinePid.values() : []),
    ]);
    logger.info(
      duplicate
        ? "Duplicate HoYoPlay game route rejected"
        : "HoYoPlay proxy route registered",
      {
      bindingId: id,
      activeBindingId: activeBinding?.id,
      bottleId: request.bottleId,
      game: request.game,
      sourceWinePid: request.sourceWinePid,
      proxyWinePid: binding.proxyWinePid,
      targetExecutableName,
      targetUnixPids,
    });

    return duplicate
      ? {
          status: "duplicate",
          bindingId: id,
          activeBindingId: activeBinding?.id,
          targetUnixPids,
        }
      : {
          status: "accepted",
          bindingId: id,
        };
  }

  attachGameSession(
    bindingId: string,
    gameSessionProcessId: string,
    snapshot: WineProcessSnapshot,
  ): void {
    const binding = this.bindings.get(bindingId);
    if (!binding) {
      return;
    }

    binding.gameSessionProcessId = gameSessionProcessId;
    const bindingIds = this.bindingIdsByGameSession.get(gameSessionProcessId)
      ?? new Set<string>();
    bindingIds.add(bindingId);
    this.bindingIdsByGameSession.set(gameSessionProcessId, bindingIds);
    for (const process of snapshot.processes) {
      this.adoptTargetProcess(binding, process);
    }
    this.stopProxyIfTargetEnded(binding, "target process already exited before session attachment");
  }

  failRoute(bindingId: string, reason: string): void {
    const binding = this.bindings.get(bindingId);
    if (!binding) {
      return;
    }

    binding.shouldTerminate = true;
    binding.terminationReason = reason;
    this.requestProxyStop(binding, reason);
  }

  observeLauncherProcess(prefixPath: string, event: WineProcessEvent): void {
    const normalizedPrefixPath = normalize_prefix_path(prefixPath);

    if (event.type === "start" && windows_executable_name(event.imagePath) === HOYOPLAY_PROXY_EXECUTABLE) {
      const binding = [...this.bindings.values()]
        .filter((candidate) =>
          !candidate.proxyWinePid
          && candidate.launcherPrefixPath === normalizedPrefixPath
          && (
            candidate.sourceWinePid === undefined
            || candidate.sourceWinePid === event.parentWinePid
          ))
        .sort((left, right) => left.createdAt - right.createdAt)[0];

      if (binding) {
        this.bindProxyProcess(binding, event.winePid);
      }
      return;
    }

    if (event.type === "exit") {
      const bindingId = this.bindingIdByProxy.get(proxy_process_key(normalizedPrefixPath, event.winePid));
      if (bindingId) {
        this.cleanupBinding(bindingId);
      }
    }
  }

  observeGameProcess(prefixPath: string, event: WineProcessEvent): void {
    const normalizedPrefixPath = normalize_prefix_path(prefixPath);

    const processKey = target_process_key(normalizedPrefixPath, event.winePid);
    if (event.type === "exit") {
      const bindingId = this.targetOwnerBindingIdByProcess.get(processKey);
      const binding = bindingId ? this.bindings.get(bindingId) : undefined;

      if (binding?.targetWinePids.delete(event.winePid)) {
        binding.targetUnixPidsByWinePid.delete(event.winePid);
        this.targetOwnerBindingIdByProcess.delete(processKey);
        this.stopProxyIfTargetEnded(binding, "routed target process exited");
      }
      return;
    }

    if (this.targetOwnerBindingIdByProcess.has(processKey)) {
      return;
    }

    const executableName = windows_executable_name(event.imagePath);
    const binding = [...this.bindings.values()]
      .filter((candidate) =>
        candidate.accepted
        && !candidate.shouldTerminate
        && candidate.gamePrefixPath === normalizedPrefixPath
        && candidate.targetExecutableName === executableName
        && !candidate.targetWinePidsAtRegistration.has(event.winePid)
        && this.activeBindingIdByRouteKey.get(candidate.routeKey) === candidate.id
      )
      .sort((left, right) => left.createdAt - right.createdAt)[0];

    if (binding) {
      this.adoptTargetProcess(binding, event);
    }
  }

  finishGameSession(gameSessionProcessId: string): void {
    const bindingIds = this.bindingIdsByGameSession.get(gameSessionProcessId);
    if (!bindingIds) {
      return;
    }

    for (const bindingId of bindingIds) {
      const binding = this.bindings.get(bindingId);
      if (binding) {
        binding.shouldTerminate = true;
        binding.terminationReason = "game prefix session ended";
        this.requestProxyStop(binding, "game prefix session ended");
      }
    }
  }

  finishLauncherPrefix(prefixPath: string): void {
    const normalizedPrefixPath = normalize_prefix_path(prefixPath);

    for (const binding of [...this.bindings.values()]) {
      if (binding.launcherPrefixPath === normalizedPrefixPath) {
        this.cleanupBinding(binding.id);
      }
    }
  }

  private adoptProxyFromSnapshot(
    binding: HoyoPlayProxyBinding,
    snapshot: WineProcessSnapshot,
  ): void {
    const candidate = [...snapshot.processes]
      .filter((process) =>
        windows_executable_name(process.imagePath) === HOYOPLAY_PROXY_EXECUTABLE
        && !this.bindingIdByProxy.has(proxy_process_key(binding.launcherPrefixPath, process.winePid))
        && (
          binding.sourceWinePid === undefined
          || binding.sourceWinePid === process.parentWinePid
        ))
      .sort((left, right) => right.sequence - left.sequence)[0];

    if (candidate) {
      this.bindProxyProcess(binding, candidate.winePid);
    }
  }

  private bindProxyProcess(binding: HoyoPlayProxyBinding, winePid: number): void {
    binding.proxyWinePid = winePid;
    this.bindingIdByProxy.set(proxy_process_key(binding.launcherPrefixPath, winePid), binding.id);
    logger.info("HoYoPlay proxy process adopted", {
      bindingId: binding.id,
      bottleId: binding.bottleId,
      game: binding.game,
      proxyWinePid: winePid,
      sourceWinePid: binding.sourceWinePid,
    });

    if (binding.shouldTerminate) {
      this.requestProxyStop(
        binding,
        binding.terminationReason ?? "proxy appeared after routed game already ended",
      );
    }
  }

  private adoptTargetProcess(
    binding: HoyoPlayProxyBinding,
    process: WineProcessEvent,
  ): void {
    if (
      process.type === "exit"
      || windows_executable_name(process.imagePath) !== binding.targetExecutableName
      || binding.targetWinePidsAtRegistration.has(process.winePid)
      || binding.targetWinePids.has(process.winePid)
    ) {
      return;
    }

    const processKey = target_process_key(binding.gamePrefixPath, process.winePid);
    const ownerBindingId = this.targetOwnerBindingIdByProcess.get(processKey);
    if (ownerBindingId && ownerBindingId !== binding.id) {
      return;
    }

    this.targetOwnerBindingIdByProcess.set(processKey, binding.id);
    binding.targetProcessSeen = true;
    binding.targetWinePids.add(process.winePid);
    binding.targetUnixPidsByWinePid.set(process.winePid, process.unixPid);
    logger.info("HoYoPlay routed target process adopted", {
      bindingId: binding.id,
      bottleId: binding.bottleId,
      game: binding.game,
      winePid: process.winePid,
      imagePath: process.imagePath,
    });
  }

  private stopProxyIfTargetEnded(binding: HoyoPlayProxyBinding, reason: string): void {
    if (!binding.targetProcessSeen || binding.targetWinePids.size > 0) {
      return;
    }

    binding.shouldTerminate = true;
    binding.terminationReason = reason;
    this.requestProxyStop(binding, reason);
  }

  private requestProxyStop(binding: HoyoPlayProxyBinding, reason: string): void {
    if (!binding.proxyWinePid || binding.terminating) {
      return;
    }

    binding.terminating = true;
    const proxyWinePid = binding.proxyWinePid;
    logger.info("Stopping HoYoPlay proxy for routed game", {
      bindingId: binding.id,
      bottleId: binding.bottleId,
      game: binding.game,
      proxyWinePid,
      reason,
    });

    void this.terminateProxy({
      wineCommand: binding.wineCommand,
      launcherPrefixPath: binding.launcherPrefixPath,
      proxyWinePid,
    }).then((code) => {
      if (code !== 0) {
        binding.terminating = false;
        logger.warn("HoYoPlay proxy taskkill exited with non-zero code", {
          bindingId: binding.id,
          proxyWinePid,
          code,
        });
        return;
      }

      this.cleanupBinding(binding.id);
    }).catch((error) => {
      binding.terminating = false;
      logger.warn("Failed to stop HoYoPlay proxy", {
        bindingId: binding.id,
        proxyWinePid,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  private cleanupBinding(bindingId: string): void {
    const binding = this.bindings.get(bindingId);
    if (!binding) {
      return;
    }

    if (binding.proxyWinePid) {
      this.bindingIdByProxy.delete(proxy_process_key(binding.launcherPrefixPath, binding.proxyWinePid));
    }
    if (binding.gameSessionProcessId) {
      const bindingIds = this.bindingIdsByGameSession.get(binding.gameSessionProcessId);
      bindingIds?.delete(binding.id);
      if (bindingIds?.size === 0) {
        this.bindingIdsByGameSession.delete(binding.gameSessionProcessId);
      }
    }
    if (this.activeBindingIdByRouteKey.get(binding.routeKey) === binding.id) {
      this.activeBindingIdByRouteKey.delete(binding.routeKey);
    }
    for (const winePid of binding.targetWinePids) {
      const processKey = target_process_key(binding.gamePrefixPath, winePid);
      if (this.targetOwnerBindingIdByProcess.get(processKey) === binding.id) {
        this.targetOwnerBindingIdByProcess.delete(processKey);
      }
    }
    this.bindings.delete(bindingId);
  }
}

async function terminate_hoyoplay_proxy(
  request: TerminateHoyoPlayProxyRequest,
): Promise<number> {
  const process = runProgram({
    command: request.wineCommand,
    args: [
      "C:\\windows\\system32\\taskkill.exe",
      "/PID",
      String(request.proxyWinePid),
      "/T",
      "/F",
    ],
    cwd: request.launcherPrefixPath,
    env: {
      WINEPREFIX: request.launcherPrefixPath,
      WINEDEBUG: "-all",
    },
    onLog: (data) => logger.debug("HoYoPlay proxy taskkill stdout", data.trim()),
    onError: (data) => logger.warn("HoYoPlay proxy taskkill stderr", data.trim()),
  });

  return process.done;
}

function windows_executable_name(value: string | undefined): string {
  if (!value) {
    return "";
  }

  const normalized = value.replace(/\\/g, "/");
  return normalized.slice(normalized.lastIndexOf("/") + 1).toLowerCase();
}

function normalize_prefix_path(prefixPath: string): string {
  return path.resolve(prefixPath);
}

function proxy_process_key(prefixPath: string, winePid: number): string {
  return `${normalize_prefix_path(prefixPath)}:${winePid}`;
}

function target_process_key(prefixPath: string, winePid: number): string {
  return `${normalize_prefix_path(prefixPath)}:${winePid}`;
}

function route_key(
  bottleId: string,
  game: HoyoOverseerGame,
  gamePrefixPath: string,
  targetExecutableName: string,
): string {
  return [
    bottleId,
    game,
    normalize_prefix_path(gamePrefixPath),
    targetExecutableName,
  ].join(":");
}

function unique_process_ids(pids: Iterable<number>): number[] {
  return [...new Set([...pids].filter((pid) => Number.isSafeInteger(pid) && pid > 1))];
}

export const hoyoPlayProxyManager = new HoyoPlayProxyManager();
