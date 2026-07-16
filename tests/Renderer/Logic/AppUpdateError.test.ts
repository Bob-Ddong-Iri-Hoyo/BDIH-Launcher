import { classify_app_update_failure } from "../../../src/Renderer/Logic/AppUpdateError";

describe("AppUpdateError", () => {
  it("classifies Chromium connection-refused errors and preserves the raw code", () => {
    expect(classify_app_update_failure("Error: net::ERR_CONNECTION_REFUSED")).toEqual({
      reason: "connectionRefused",
      details: "Error: net::ERR_CONNECTION_REFUSED",
      code: "net::ERR_CONNECTION_REFUSED",
    });
  });

  it("classifies Node connection-refused errors", () => {
    expect(classify_app_update_failure("connect ECONNREFUSED 127.0.0.1:45678")).toEqual({
      reason: "connectionRefused",
      details: "connect ECONNREFUSED 127.0.0.1:45678",
      code: "ECONNREFUSED",
    });
  });

  it.each([
    "net::ERR_INTERNET_DISCONNECTED",
    "net::ERR_NAME_NOT_RESOLVED",
    "connect ETIMEDOUT",
    "TypeError: fetch failed",
  ])("classifies %s as a network problem", (error) => {
    expect(classify_app_update_failure(error).reason).toBe("network");
  });

  it("leaves an unrecognized updater failure as unknown", () => {
    expect(classify_app_update_failure("Invalid update metadata")).toEqual({
      reason: "unknown",
      details: "Invalid update metadata",
      code: undefined,
    });
  });
});
