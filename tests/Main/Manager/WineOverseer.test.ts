import {
  attach_hoyo_overseer_connection,
  wine_unhandled_page_fault_message,
} from "../../../src/Main/Manager/WineOverseer";

describe("WineOverseer connection environment", () => {
  it("preserves the execution environment and adds only the active FIFO binding", () => {
    const executionEnvironment = {
      WINEPREFIX: "/tmp/hoyo-prefix",
      DXMT_CONFIG: "d3d11.preferredMaxFrameRate=60;",
      WINE_HOYO_CHILD_STUB: "1",
      WINE_HOYO_EVENT_PIPE: "stale-pipe",
      WINE_HOYO_EVENT_SESSION: "stale-session",
    };

    const connectedEnvironment = attach_hoyo_overseer_connection(
      executionEnvironment,
      "/tmp/hoyo-prefix/.cache/overseer/session/hoyo.fifo",
      "session-123",
    );

    expect(connectedEnvironment).toEqual({
      ...executionEnvironment,
      WINE_HOYO_EVENT_PIPE: "Z:\\tmp\\hoyo-prefix\\.cache\\overseer\\session\\hoyo.fifo",
      WINE_HOYO_EVENT_SESSION: "session-123",
    });
    expect(executionEnvironment.WINE_HOYO_EVENT_PIPE).toBe("stale-pipe");
    expect(executionEnvironment.WINE_HOYO_EVENT_SESSION).toBe("stale-session");
  });
});

describe("WineOverseer fatal output detection", () => {
  it("extracts an unhandled page fault so a Wine debugger cannot look like a running launcher", () => {
    expect(wine_unhandled_page_fault_message(
      "0120:err:seh:NtRaiseException Unhandled exception\n" +
      "wine: Unhandled page fault on read access to 00000000000008A0 at address 00006FFFFFD16E56 (thread 0120), starting debugger...\n",
    )).toBe(
      "wine: Unhandled page fault on read access to 00000000000008A0 at address 00006FFFFFD16E56 (thread 0120), starting debugger...",
    );
  });

  it("does not classify ordinary Wine diagnostics as a fatal crash", () => {
    expect(wine_unhandled_page_fault_message(
      "wine: configuration in L'/tmp/prefix' has been updated.",
    )).toBeUndefined();
  });
});
