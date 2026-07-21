import { isCloseWindowShortcut, WindowShortcutInput } from "../../../src/Main/Util/WindowShortcut";

function keyboardInput(overrides: Partial<WindowShortcutInput> = {}): WindowShortcutInput {
  return {
    type: "keyDown",
    key: "w",
    alt: false,
    control: false,
    meta: true,
    shift: false,
    ...overrides,
  };
}

describe("isCloseWindowShortcut", () => {
  it("matches Command+W on macOS", () => {
    expect(isCloseWindowShortcut(keyboardInput(), "darwin")).toBe(true);
    expect(isCloseWindowShortcut(keyboardInput({ key: "W" }), "darwin")).toBe(true);
  });

  it("does not intercept Command+Q or modified Command+W shortcuts", () => {
    expect(isCloseWindowShortcut(keyboardInput({ key: "q" }), "darwin")).toBe(false);
    expect(isCloseWindowShortcut(keyboardInput({ shift: true }), "darwin")).toBe(false);
    expect(isCloseWindowShortcut(keyboardInput({ alt: true }), "darwin")).toBe(false);
  });

  it("does not intercept the shortcut on other platforms", () => {
    expect(isCloseWindowShortcut(keyboardInput(), "win32")).toBe(false);
  });
});
