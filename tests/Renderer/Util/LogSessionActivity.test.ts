import {
  initial_running_state_for_live_log_entry,
  running_state_after_live_log_entry,
} from "../../../src/Renderer/Util/LogSessionActivity";

describe("log session runtime activity", () => {
  it("does not treat the first Bottle log line as proof of a running process", () => {
    expect(initial_running_state_for_live_log_entry("bottle")).toBe(false);
  });

  it("does not resurrect an ended Bottle session when a late exit log arrives", () => {
    expect(running_state_after_live_log_entry("bottle", false)).toBe(false);
  });

  it("keeps an explicitly active Bottle session active while logs arrive", () => {
    expect(running_state_after_live_log_entry("bottle", true)).toBe(true);
  });

  it("keeps launcher-wide live log sessions active", () => {
    expect(initial_running_state_for_live_log_entry("app")).toBe(true);
    expect(running_state_after_live_log_entry("app", false)).toBe(true);
  });
});
