import {
  command_runs_windows_executable,
  is_wine_host_process_command,
} from "../../../src/Main/Util/ManagedWineProcesses";

describe("managed Wine process discovery", () => {
  it.each([
    String.raw`C:\Program Files (x86)\Steam\steam.exe -silent`,
    String.raw`Z:\Users\player\Games\game.exe`,
    "/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin/wineserver -k",
    "/tmp/wine/bin/wine64-preloader C:\\windows\\explorer.exe",
    "/tmp/wine/bin/wineboot --init",
  ])("recognizes a Wine-hosted process command: %s", (command) => {
    expect(is_wine_host_process_command(command)).toBe(true);
  });

  it.each([
    "/Applications/BDIH Launcher.app/Contents/MacOS/BDIH Launcher",
    "/bin/zsh -l",
    "/usr/bin/node scripts/serve-update-test.mjs",
    "steamwebhelper --type=renderer",
  ])("does not classify an unrelated host process: %s", (command) => {
    expect(is_wine_host_process_command(command)).toBe(false);
  });

  it.each([
    String.raw`C:\Program Files\HoYoPlay\1.16.1.364\HYP.exe --in-process-gpu`,
    String.raw`C:\Program Files\HoYoPlay\HoYoPlay.exe`,
  ])("recognizes a primary HoYoPlay process: %s", (command) => {
    expect(command_runs_windows_executable(command, "HYP.exe")
      || command_runs_windows_executable(command, "HoYoPlay.exe")).toBe(true);
  });

  it.each([
    String.raw`C:\Program Files\HoYoPlay\1.16.1.364\HYPHelper --type=renderer`,
    String.raw`Z:\Downloads\HoYoPlaySetup.exe`,
    String.raw`C:\Program Files\HoYoPlay\1.16.1.364\HYP.exe.backup`,
  ])("does not mistake a helper or installer for the HoYoPlay launcher: %s", (command) => {
    expect(command_runs_windows_executable(command, "HYP.exe")).toBe(false);
    expect(command_runs_windows_executable(command, "HoYoPlay.exe")).toBe(false);
  });
});
