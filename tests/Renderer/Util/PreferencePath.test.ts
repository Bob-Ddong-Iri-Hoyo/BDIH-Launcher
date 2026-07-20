import {
  normalize_preference_path,
  preference_storage_paths_equal,
  type PreferenceStoragePathDraft,
} from "../../../src/Renderer/Util/PreferencePath";

const STORAGE_PATHS: PreferenceStoragePathDraft = {
  dataRootPath: "/tmp/bdih",
  installPath: "/tmp/bdih/Wine",
  bottlePrefixPath: "/tmp/bdih/Bottles",
  dxmtCachePath: "/tmp/bdih/DXMT",
  gameInstallPath: "/tmp/bdih/Games",
};

describe("preference storage path comparison", () => {
  it("treats a shared G: folder change as an unsaved storage change", () => {
    expect(preference_storage_paths_equal(STORAGE_PATHS, {
      ...STORAGE_PATHS,
      gameInstallPath: "/Volumes/Games",
    })).toBe(false);
  });

  it("ignores whitespace and trailing slashes for saved path comparisons", () => {
    expect(normalize_preference_path("  /tmp/bdih/Games///  ")).toBe("/tmp/bdih/Games");
  });
});
