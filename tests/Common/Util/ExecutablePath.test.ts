import {
  manual_app_id_from_executable_path,
} from "../../../src/Common/Util/ExecutablePath";

describe("ExecutablePath", () => {
  it("uses the same stable identity for a manual route regardless of path case", () => {
    expect(manual_app_id_from_executable_path(
      "/tmp/Bottle/manual-prefix",
      String.raw`C:\Games\Demo.exe`,
    )).toBe(manual_app_id_from_executable_path(
      "/TMP/BOTTLE/MANUAL-PREFIX",
      String.raw`c:\games\demo.EXE`,
    ));
  });

  it("keeps identical executables in different Prefixes as separate targets", () => {
    expect(manual_app_id_from_executable_path(
      "/tmp/Bottle/prefix-a",
      String.raw`C:\Games\Demo.exe`,
    )).not.toBe(manual_app_id_from_executable_path(
      "/tmp/Bottle/prefix-b",
      String.raw`C:\Games\Demo.exe`,
    ));
  });
});
