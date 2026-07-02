import React from "react";
import { Box } from "./Layout";
import { InlineText, Text } from "./Text";

export type ListDensity = "compact" | "comfortable";
export type ListItemTone = "default" | "selected" | "danger";

export interface ListProps extends React.HTMLAttributes<HTMLElement> {
  as?: React.ElementType;
}

export interface ListItemProps extends React.HTMLAttributes<HTMLElement> {
  as?: React.ElementType;
  density?: ListDensity;
  tone?: ListItemTone;
  interactive?: boolean;
  type?: React.ButtonHTMLAttributes<HTMLButtonElement>["type"];
  disabled?: boolean;
}

export interface ListItemIconProps extends React.HTMLAttributes<HTMLSpanElement> {}
export interface ListItemBodyProps extends React.HTMLAttributes<HTMLElement> {}
export interface ListItemTextProps extends React.HTMLAttributes<HTMLSpanElement> {}
export interface ListItemMetaProps extends React.HTMLAttributes<HTMLElement> {}
export interface ListItemActionsProps extends React.HTMLAttributes<HTMLElement> {}

const DENSITY_CLASSES: Record<ListDensity, string> = {
  compact: "min-h-12 px-3 py-2",
  comfortable: "min-h-16 px-3 py-3",
};

const TONE_CLASSES: Record<ListItemTone, string> = {
  default: "border-white/10 bg-white/[0.03] text-slate-400",
  selected: "accent-selection text-white",
  danger: "border-rose-300/30 bg-rose-500/10 text-rose-100",
};

function join_class_names(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/**
 * Primitive list container.
 *
 * Use `List` for vertical collections of repeated rows. It intentionally owns
 * only spacing and minimum width; scrolling, borders, and panel styling should
 * stay with the parent surface so the same list rows can be reused in dialogs,
 * sidebars, and full-page panels.
 */
export const List = React.forwardRef<HTMLElement, ListProps>(
  ({ as = "div", className = "", children, ...props }, ref) => (
    <Box ref={ref} as={as} className={join_class_names("flex min-w-0 flex-col gap-1", className)} {...props}>
      {children}
    </Box>
  ),
);

List.displayName = "List";

/**
 * Primitive list row surface.
 *
 * Use `ListItem` as the reusable shell for history rows, runtime rows, bottle
 * rows, and compact setting rows. It keeps row height, border, selected state,
 * overflow behavior, and hover treatment consistent while allowing callers to
 * choose the semantic element with `as`.
 */
export const ListItem = React.forwardRef<HTMLElement, ListItemProps>(
  ({
    as = "div",
    density = "comfortable",
    tone = "default",
    interactive = false,
    className = "",
    children,
    ...props
  }, ref) => (
    <Box
      ref={ref}
      as={as}
      className={join_class_names(
        "flex min-w-0 overflow-hidden rounded-md border text-left font-normal transition",
        DENSITY_CLASSES[density],
        TONE_CLASSES[tone],
        interactive && tone === "default" && "hover:border-white/20 hover:bg-white/[0.06] hover:text-slate-200",
        interactive && "cursor-pointer",
        className,
      )}
      {...props}
    >
      {children}
    </Box>
  ),
);

ListItem.displayName = "ListItem";

/**
 * Fixed-size icon slot for list rows.
 *
 * Use it for leading SVGs, status dots, thumbnails, or small app icons so row
 * text remains aligned even when some rows have no icon.
 */
export const ListItemIcon = React.forwardRef<HTMLSpanElement, ListItemIconProps>(
  ({ className = "", children, ...props }, ref) => (
    <span
      ref={ref}
      className={join_class_names("inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/[0.04] text-slate-300", className)}
      {...props}
    >
      {children}
    </span>
  ),
);

ListItemIcon.displayName = "ListItemIcon";

/**
 * Flexible body column for list rows.
 *
 * Use this around title, description, and detail text. It always applies
 * `min-w-0` so long file names and paths truncate instead of pushing metadata
 * or action buttons out of the row.
 */
export const ListItemBody = React.forwardRef<HTMLElement, ListItemBodyProps>(
  ({ className = "", children, ...props }, ref) => (
    <Box ref={ref} className={join_class_names("flex min-w-0 flex-1 flex-col justify-center gap-0.5", className)} {...props}>
      {children}
    </Box>
  ),
);

ListItemBody.displayName = "ListItemBody";

/** Primary one-line title for a list item. */
export const ListItemTitle = React.forwardRef<HTMLSpanElement, ListItemTextProps>(
  ({ className = "", children, ...props }, ref) => (
    <InlineText ref={ref} className={join_class_names("block min-w-0 truncate text-sm font-semibold text-slate-100", className)} {...props}>
      {children}
    </InlineText>
  ),
);

ListItemTitle.displayName = "ListItemTitle";

/** Secondary one-line description for a list item. */
export const ListItemDescription = React.forwardRef<HTMLSpanElement, ListItemTextProps>(
  ({ className = "", children, ...props }, ref) => (
    <InlineText ref={ref} className={join_class_names("block min-w-0 truncate text-xs leading-4 text-slate-500", className)} {...props}>
      {children}
    </InlineText>
  ),
);

ListItemDescription.displayName = "ListItemDescription";

/** Small metadata region, usually right-aligned. */
export const ListItemMeta = React.forwardRef<HTMLElement, ListItemMetaProps>(
  ({ className = "", children, ...props }, ref) => (
    <Box ref={ref} className={join_class_names("flex shrink-0 items-center justify-end gap-2 text-xs text-slate-400", className)} {...props}>
      {children}
    </Box>
  ),
);

ListItemMeta.displayName = "ListItemMeta";

/** Trailing action region for buttons, menus, badges, and counters. */
export const ListItemActions = React.forwardRef<HTMLElement, ListItemActionsProps>(
  ({ className = "", children, ...props }, ref) => (
    <Box ref={ref} className={join_class_names("flex shrink-0 items-center justify-end gap-2", className)} {...props}>
      {children}
    </Box>
  ),
);

ListItemActions.displayName = "ListItemActions";
