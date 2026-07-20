export interface PreferenceStoragePathDraft {
  dataRootPath: string;
  installPath: string;
  bottlePrefixPath: string;
  dxmtCachePath: string;
  gameInstallPath: string;
}

export function normalize_preference_path(targetPath: string): string {
  return targetPath.trim().replace(/\/+$/, "");
}

export function preference_storage_paths_equal(
  left: PreferenceStoragePathDraft,
  right: PreferenceStoragePathDraft,
): boolean {
  return normalize_preference_path(left.dataRootPath) === normalize_preference_path(right.dataRootPath)
    && normalize_preference_path(left.installPath) === normalize_preference_path(right.installPath)
    && normalize_preference_path(left.bottlePrefixPath) === normalize_preference_path(right.bottlePrefixPath)
    && normalize_preference_path(left.dxmtCachePath) === normalize_preference_path(right.dxmtCachePath)
    && normalize_preference_path(left.gameInstallPath) === normalize_preference_path(right.gameInstallPath);
}
