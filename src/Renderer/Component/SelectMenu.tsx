export { Select, SelectMenu } from "./Primitives/Select";
/**
 * Backward-compatible SelectMenu export.
 *
 * Prefer importing SelectMenu from `./Primitives` in new Component code. Keep
 * this file for older imports while the Component layer migrates gradually.
 */
export type { SelectOption, SelectProps, SelectMenuOption, SelectMenuProps } from "./Primitives/Select";
