import { PathSuggestionItemPayload } from "@common/Types/IPC";

/**
 *
 * @param partialPath
 * @returns
 *
 * @description
 * first time(empty states), it suggests two type of paths:
 * Window path lik e C, Z, or Unix root / or user home directory ~
 * If User selects C:, Z: (Window-like Path), then it suggests subdirectories under wine prefixs
 * Else if user selects / or ~ (Unix-like Path), then it suggests subdirectories under the selected path.
 * User don't need to understand the concept of wine prefix, they can just navigate to the game executable like normal file navigation. The launcher will automatically detect if it's a valid wine prefix and handle it accordingly.
 *
 */
export function requestPathSuggestions(
  partialPath: string,
): Promise<PathSuggestionItemPayload[]> {
  // TODO: We can optimize this by caching the directory structure of wine prefixes, and only fetch the subdirectories when user navigates into a new wine prefix. This will reduce the number of IPC calls and improve the responsiveness of path suggestions.

  
  return window.electron.invoke("get-path-suggestions", partialPath);
}
