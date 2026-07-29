import {
  bottle_storage_hash,
  create_bottle_storage_path,
  create_bottle_storage_path_preview,
  normalize_bottle_prefix_root,
} from "../../../src/Common/Util/BottlePath";

describe("BottlePath", () => {
  it("creates a stable storage path from the initial display name and bottle id", () => {
    const bottleId = "nahida-mrt2mdu6";
    const suffix = bottle_storage_hash(bottleId);

    expect(suffix).toMatch(/^[a-z0-9]{5}$/);
    expect(create_bottle_storage_path("/tmp/Bottles", "Nahida", bottleId))
      .toBe(`/tmp/Bottles/nahida-${suffix}`);
    expect(create_bottle_storage_path("/tmp/Bottles", "Nahida", bottleId))
      .toBe(create_bottle_storage_path("/tmp/Bottles", "Nahida", bottleId));
  });

  it("shows the storage suffix without exposing it as part of the display name", () => {
    expect(create_bottle_storage_path_preview("/tmp/Bottles", "Nahida"))
      .toBe("/tmp/Bottles/nahida-xxxxx");
  });

  it("recognizes a generated bottle directory as a child of the selected root", () => {
    expect(normalize_bottle_prefix_root("/tmp/Bottles/nahida-a1b2c", "Nahida"))
      .toBe("/tmp/Bottles");
  });
});
