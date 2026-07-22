import { app } from "electron";
import { create_app_data_compatibility_contract } from "../../Common/Constant/DataSchema";
import type {
  ChannelTransitionRequest,
  ChannelTransitionResult,
  StableReturnPoint,
} from "../../Common/Types/Compatibility";
import { is_nightly_launcher_build, is_staging_launcher_build } from "../Environment/AppPaths";
import { bottleManager, BottleManager } from "./BottleManager";
import { compatibilityManager, CompatibilityManager } from "./CompatibilityManager";
import { preferenceManager, PreferenceManager } from "./PreferenceManager";
import { snapshotManager, SnapshotManager } from "./SnapshotManager";

type PublicChannel = "stable" | "beta";

/**
 * Coordinates channel intent, Stable return-point creation, and compatibility
 * checks. It never restores metadata automatically: normal Stable returns keep
 * user-selected Wine/DXMT versions and other user state.
 */
export class ChannelTransitionManager {
  private operationQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly preferences: PreferenceManager,
    private readonly bottles: BottleManager,
    private readonly snapshots: SnapshotManager,
    private readonly compatibility: CompatibilityManager,
    private readonly getAppVersion: () => string = () => app.getVersion(),
  ) {}

  changeChannel(request: ChannelTransitionRequest): Promise<ChannelTransitionResult> {
    return this.runExclusive(() => this.changeChannelUnlocked(request));
  }

  private async changeChannelUnlocked(request: ChannelTransitionRequest): Promise<ChannelTransitionResult> {
    const preference = await this.preferences.getPreference();
    const previousChannel = public_channel(preference.updateChannel);
    const channel = request.channel;

    if (channel !== "stable" && channel !== "beta") {
      return {
        ok: false,
        applied: false,
        previousChannel,
        channel: previousChannel,
        error: "Unsupported update channel.",
      };
    }

    if (is_nightly_launcher_build()) {
      return {
        ok: false,
        applied: false,
        previousChannel,
        channel,
        error: "Nightly builds cannot change their update channel.",
      };
    }

    if (previousChannel === channel) {
      return {
        ok: true,
        applied: true,
        previousChannel,
        channel,
        returnPoint: summarize_return_point(await this.snapshots.getActiveReturnPoint()),
      };
    }

    if (previousChannel === "stable" && channel === "beta") {
      const returnPoint = await this.prepareStableReturnPoint(preference.dataRootPath);

      await this.preferences.updatePreference({ updateChannel: "beta" });
      return {
        ok: true,
        applied: true,
        previousChannel,
        channel,
        returnPoint: summarize_return_point(returnPoint),
      };
    }

    const returnPoint = await this.snapshots.getActiveReturnPoint();
    const compatibility = returnPoint
      ? await this.compatibility.checkStableReturn(returnPoint, preference.dataRootPath)
      : this.compatibility.missingReturnPointReport();
    const requiresConfirmation = compatibility.status !== "compatible";

    if (requiresConfirmation && !request.allowUnsafe) {
      return {
        ok: true,
        applied: false,
        previousChannel,
        channel,
        requiresConfirmation: true,
        returnPoint: summarize_return_point(returnPoint),
        compatibility,
      };
    }

    await this.preferences.updatePreference({ updateChannel: "stable" });
    await this.snapshots.markReturnRequested();

    return {
      ok: true,
      applied: true,
      previousChannel,
      channel,
      returnPoint: summarize_return_point(returnPoint),
      compatibility,
    };
  }

  async reconcileStartup(): Promise<void> {
    const preference = await this.preferences.getPreference();
    const returnPoint = await this.snapshots.getActiveReturnPoint();

    if (
      returnPoint?.returnRequestedAt
      && public_channel(preference.updateChannel) === "stable"
      && is_stable_return_version(this.getAppVersion())
    ) {
      await this.snapshots.completeReturnPoint();
    }
  }

  private async prepareStableReturnPoint(dataRootPath: string): Promise<StableReturnPoint | undefined> {
    const appVersion = this.getAppVersion();
    const existing = await this.snapshots.getActiveReturnPoint();

    if (!is_stable_return_version(appVersion)) {
      return existing;
    }

    // Drain both metadata queues before copying the emergency recovery files.
    await this.preferences.savePreference(await this.preferences.getPreference());
    await this.bottles.getBottleList(true);

    return this.snapshots.createStableReturnPoint({
      stableVersion: appVersion,
      dataRootPath,
      contract: create_app_data_compatibility_contract(appVersion),
    });
  }

  private runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.then(operation, operation);

    this.operationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

function is_stable_return_version(version: string): boolean {
  const normalized = version.trim();

  if (/^\d+\.\d+\.\d+(?:\+[0-9A-Za-z.-]+)?$/.test(normalized)) {
    return true;
  }

  return is_staging_launcher_build()
    && /^\d+\.\d+\.\d+-rc\.[1-9]\d*(?:\+[0-9A-Za-z.-]+)?$/.test(normalized);
}

function public_channel(channel: string | undefined): PublicChannel {
  return channel === "beta" ? "beta" : "stable";
}

function summarize_return_point(
  returnPoint: StableReturnPoint | undefined,
): ChannelTransitionResult["returnPoint"] {
  return returnPoint
    ? {
        id: returnPoint.id,
        stableVersion: returnPoint.stableVersion,
        createdAt: returnPoint.createdAt,
      }
    : undefined;
}

export const channelTransitionManager = new ChannelTransitionManager(
  preferenceManager,
  bottleManager,
  snapshotManager,
  compatibilityManager,
);
