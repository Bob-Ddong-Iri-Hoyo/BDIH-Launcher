import {
  PromiseTimeoutError,
  with_promise_timeout,
} from "../../../src/Main/Util/PromiseTimeout";

describe("with_promise_timeout", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("rejects a Promise that never settles after the configured deadline", async () => {
    jest.useFakeTimers();
    const operation = new Promise<void>(() => undefined);
    const result = with_promise_timeout(operation, 25, "test cleanup");
    const rejection = expect(result).rejects.toEqual(
      expect.objectContaining({
        name: "PromiseTimeoutError",
        operation: "test cleanup",
        timeoutMs: 25,
      }),
    );

    await jest.advanceTimersByTimeAsync(25);
    await rejection;
  });

  it("returns the operation result and clears its deadline timer", async () => {
    jest.useFakeTimers();

    await expect(
      with_promise_timeout(Promise.resolve("done"), 25, "quick cleanup"),
    ).resolves.toBe("done");
    expect(jest.getTimerCount()).toBe(0);
  });

  it("uses a distinct error type so quit cleanup can invoke Guardian fallback", async () => {
    await expect(
      with_promise_timeout(Promise.resolve(), 0, "invalid deadline"),
    ).rejects.toBeInstanceOf(PromiseTimeoutError);
  });
});
