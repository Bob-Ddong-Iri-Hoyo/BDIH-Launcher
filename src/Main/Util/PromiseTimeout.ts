export class PromiseTimeoutError extends Error {
  constructor(
    readonly operation: string,
    readonly timeoutMs: number,
  ) {
    super(`${operation} timed out after ${timeoutMs}ms.`);
    this.name = "PromiseTimeoutError";
  }
}

export function with_promise_timeout<T>(
  operation: PromiseLike<T>,
  timeoutMs: number,
  operationName: string,
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return Promise.reject(new PromiseTimeoutError(operationName, timeoutMs));
  }

  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      reject(new PromiseTimeoutError(operationName, timeoutMs));
    }, timeoutMs);
  });

  return Promise.race([
    Promise.resolve(operation),
    timeoutPromise,
  ]).finally(() => {
    if (timeout) {
      clearTimeout(timeout);
    }
  });
}
