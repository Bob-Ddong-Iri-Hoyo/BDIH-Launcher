import { resolve_context_submenu_position } from "../../../src/Renderer/Logic/ContextMenuPosition";

describe("resolve_context_submenu_position", () => {
  it("opens a submenu to the right when space is available", () => {
    expect(resolve_context_submenu_position({
      anchorLeft: 100,
      anchorRight: 320,
      anchorTop: 120,
      menuWidth: 220,
      menuHeight: 160,
      viewportWidth: 900,
      viewportHeight: 700,
    })).toEqual({ x: 324, y: 120, side: "right" });
  });

  it("opens a submenu to the left near the right viewport edge", () => {
    expect(resolve_context_submenu_position({
      anchorLeft: 660,
      anchorRight: 880,
      anchorTop: 120,
      menuWidth: 220,
      menuHeight: 160,
      viewportWidth: 900,
      viewportHeight: 700,
    })).toEqual({ x: 436, y: 120, side: "left" });
  });

  it("clamps the submenu inside the bottom viewport edge", () => {
    expect(resolve_context_submenu_position({
      anchorLeft: 100,
      anchorRight: 320,
      anchorTop: 650,
      menuWidth: 220,
      menuHeight: 160,
      viewportWidth: 900,
      viewportHeight: 700,
    })).toEqual({ x: 324, y: 532, side: "right" });
  });
});
