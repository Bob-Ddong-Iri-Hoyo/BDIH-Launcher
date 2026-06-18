import type { PathSuggestionItemPayload } from "../../Common/Types/IPC";

const EXECUTABLE_PATH_PATTERN = /\.(exe|msi|bat|cmd)$/i;

export type DirectExecutableAutocompleteAction =
  | { kind: "apply-suggestion"; suggestion: PathSuggestionItemPayload; continueAutocomplete: boolean }
  | { kind: "focus-arguments" }
  | { kind: "request-suggestions" }
  | { kind: "move-selection"; direction: "next" | "previous" }
  | { kind: "run" }
  | { kind: "close" }
  | { kind: "none" };

export function is_executable_path_target(
  path: string,
  isDirectory = false,
): boolean {
  return !isDirectory && EXECUTABLE_PATH_PATTERN.test(path.trim());
}

export function should_continue_path_autocomplete(
  suggestion: PathSuggestionItemPayload,
): boolean {
  return !is_executable_path_target(suggestion.path, suggestion.isDirectory);
}

export function resolve_direct_executable_autocomplete_action({
  key,
  executablePath,
  pathSuggestions,
  selectedSuggestionIndex,
  isPathSuggestionOpen,
}: {
  key: string;
  executablePath: string;
  pathSuggestions: PathSuggestionItemPayload[];
  selectedSuggestionIndex: number;
  isPathSuggestionOpen: boolean;
}): DirectExecutableAutocompleteAction {
  const selectedSuggestion = pathSuggestions[selectedSuggestionIndex] ?? pathSuggestions[0];

  if (key === "Tab") {
    if (isPathSuggestionOpen && selectedSuggestion) {
      if (
        selectedSuggestion.path === executablePath.trim() &&
        is_executable_path_target(executablePath, selectedSuggestion.isDirectory)
      ) {
        return { kind: "focus-arguments" };
      }

      return {
        kind: "apply-suggestion",
        suggestion: selectedSuggestion,
        continueAutocomplete: should_continue_path_autocomplete(selectedSuggestion),
      };
    }

    if (is_executable_path_target(executablePath)) {
      return { kind: "focus-arguments" };
    }

    return { kind: "request-suggestions" };
  }

  if (key === "ArrowDown" && isPathSuggestionOpen && pathSuggestions.length > 0) {
    return { kind: "move-selection", direction: "next" };
  }

  if (key === "ArrowUp" && isPathSuggestionOpen && pathSuggestions.length > 0) {
    return { kind: "move-selection", direction: "previous" };
  }

  if (key === "Enter") {
    if (isPathSuggestionOpen && selectedSuggestion) {
      return {
        kind: "apply-suggestion",
        suggestion: selectedSuggestion,
        continueAutocomplete: should_continue_path_autocomplete(selectedSuggestion),
      };
    }

    return { kind: "run" };
  }

  if (key === "Escape" && isPathSuggestionOpen) {
    return { kind: "close" };
  }

  return { kind: "none" };
}
