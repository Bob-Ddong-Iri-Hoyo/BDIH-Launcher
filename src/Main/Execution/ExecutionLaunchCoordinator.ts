export type ExecutionLaunchDisposition = "started" | "joined" | "reused";

export interface CoordinatedExecutionLaunch<T> {
  disposition: ExecutionLaunchDisposition;
  result: Promise<T>;
}

/**
 * Coalesces concurrent launch requests for one logical execution target.
 *
 * Running-target ownership remains with the caller because its lifecycle is
 * normally backed by a Prefix session or provider telemetry. This coordinator
 * owns only the short launching interval before that durable state exists.
 */
export class ExecutionLaunchCoordinator<T> {
  private readonly pendingLaunches = new Map<string, Promise<T>>();

  coordinate(
    targetKey: string,
    findExisting: () => T | undefined,
    launch: () => T | Promise<T>,
  ): CoordinatedExecutionLaunch<T> {
    const existing = findExisting();

    if (existing !== undefined) {
      return {
        disposition: "reused",
        result: Promise.resolve(existing),
      };
    }

    const pending = this.pendingLaunches.get(targetKey);

    if (pending) {
      return {
        disposition: "joined",
        result: pending,
      };
    }

    // Defer the launch body to a microtask so the reservation is installed
    // synchronously before any caller-controlled asynchronous work begins.
    const result = Promise.resolve().then(launch);
    this.pendingLaunches.set(targetKey, result);

    const release = () => {
      if (this.pendingLaunches.get(targetKey) === result) {
        this.pendingLaunches.delete(targetKey);
      }
    };
    void result.then(release, release);

    return {
      disposition: "started",
      result,
    };
  }

  hasPending(targetKey: string): boolean {
    return this.pendingLaunches.has(targetKey);
  }
}
