import {
  is_executable_path_target,
  resolve_direct_executable_autocomplete_action,
  should_continue_path_autocomplete,
} from "../../../src/Renderer/Logic/DirectExecutableAutocomplete";

const directorySuggestion = {
  path: "C:\\Program Files\\Steam\\",
  name: "Steam",
  isDirectory: true,
};

const executableSuggestion = {
  path: "C:\\Program Files\\Steam\\steam.exe",
  name: "steam.exe",
  isDirectory: false,
};

describe("DirectExecutableAutocomplete", () => {
  it("keeps autocomplete alive for directories", () => {
    expect(should_continue_path_autocomplete(directorySuggestion)).toBe(true);
    expect(is_executable_path_target(directorySuggestion.path, directorySuggestion.isDirectory)).toBe(false);
  });

  it("stops autocomplete when an executable target is reached", () => {
    expect(should_continue_path_autocomplete(executableSuggestion)).toBe(false);
    expect(is_executable_path_target(executableSuggestion.path, executableSuggestion.isDirectory)).toBe(true);
  });

  it("applies a selected directory on Tab and keeps requesting candidates", () => {
    expect(resolve_direct_executable_autocomplete_action({
      key: "Tab",
      executablePath: "C:\\Program Files\\St",
      pathSuggestions: [directorySuggestion],
      selectedSuggestionIndex: 0,
      isPathSuggestionOpen: true,
    })).toEqual({
      kind: "apply-suggestion",
      suggestion: directorySuggestion,
      continueAutocomplete: true,
    });
  });

  it("moves to arguments when Tab is pressed on a completed executable path", () => {
    expect(resolve_direct_executable_autocomplete_action({
      key: "Tab",
      executablePath: executableSuggestion.path,
      pathSuggestions: [executableSuggestion],
      selectedSuggestionIndex: 0,
      isPathSuggestionOpen: true,
    })).toEqual({ kind: "focus-arguments" });
  });

  it("closes suggestions only through Escape", () => {
    expect(resolve_direct_executable_autocomplete_action({
      key: "Escape",
      executablePath: directorySuggestion.path,
      pathSuggestions: [directorySuggestion],
      selectedSuggestionIndex: 0,
      isPathSuggestionOpen: true,
    })).toEqual({ kind: "close" });
  });
});
