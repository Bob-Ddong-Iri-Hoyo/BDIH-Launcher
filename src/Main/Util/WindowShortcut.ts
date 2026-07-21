export interface WindowShortcutInput {
  type: string;
  key: string;
  alt: boolean;
  control: boolean;
  meta: boolean;
  shift: boolean;
}

export function isCloseWindowShortcut(
  input: WindowShortcutInput,
  platform: NodeJS.Platform = process.platform,
): boolean {
  return platform === "darwin"
    && input.type === "keyDown"
    && input.meta
    && !input.alt
    && !input.control
    && !input.shift
    && input.key.toLowerCase() === "w";
}
