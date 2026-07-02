import React from "react";
import { createPortal } from "react-dom";
import { LucideIcon } from "lucide-react";
import { Box, InlineText, List, ListItem, ListItemIcon } from "./Primitives";

/**
 * Screen-space position for a context menu anchor.
 *
 * Values should come from mouse or pointer client coordinates so the menu can
 * clamp itself inside the visible viewport.
 */
export interface ContextMenuPosition {
  x: number;
  y: number;
}

/**
 * Declarative context menu item definition.
 *
 * Use this shape to keep menu rendering independent from the feature that owns
 * each action, including disabled, danger, and separator states.
 */
export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: LucideIcon;
  trailingIcon?: LucideIcon;
  iconTone?: "default" | "success" | "info" | "warning" | "danger" | "violet";
  iconFill?: boolean;
  disabled?: boolean;
  danger?: boolean;
  separatorBefore?: boolean;
  onSelect: () => void;
}

/**
 * Props for a floating context menu.
 *
 * Provide `open`, a viewport position, and a stable item list. The menu owns
 * outside-click and escape handling, while the caller owns action side effects.
 */
export interface ContextMenuProps {
  open: boolean;
  position?: ContextMenuPosition;
  items: ContextMenuItem[];
  onClose: () => void;
  width?: number;
  className?: string;
}

const MENU_MARGIN = 8;
const DEFAULT_WIDTH = 220;
const ICON_TONE_CLASS_MAP: Required<Record<NonNullable<ContextMenuItem["iconTone"]>, string>> = {
  default: "bg-white/[0.04] text-slate-300 ring-white/10",
  success: "bg-emerald-400/15 text-emerald-300 ring-emerald-300/25",
  info: "bg-sky-400/15 text-sky-300 ring-sky-300/25",
  warning: "bg-amber-400/15 text-amber-300 ring-amber-300/25",
  danger: "bg-rose-500/15 text-rose-300 ring-rose-300/25",
  violet: "bg-violet-400/15 text-violet-300 ring-violet-300/25",
};
const ICON_TEXT_TONE_CLASS_MAP: Required<Record<NonNullable<ContextMenuItem["iconTone"]>, string>> = {
  default: "text-slate-300",
  success: "text-emerald-300",
  info: "text-sky-300",
  warning: "text-amber-300",
  danger: "text-rose-300",
  violet: "text-violet-300",
};

/**
 * Floating right-click menu used by bottle and app cards.
 *
 * Use this when an interaction needs quick secondary actions without opening a
 * full dialog. Keep destructive work in the item callback so confirmation can
 * stay feature-specific.
 */
export function ContextMenu({
  open,
  position,
  items,
  onClose,
  width = DEFAULT_WIDTH,
  className = "",
}: ContextMenuProps) {
  const menuRef = React.useRef<HTMLElement>(null);
  const [resolvedPosition, setResolvedPosition] = React.useState<ContextMenuPosition>(position ?? { x: 0, y: 0 });

  React.useLayoutEffect(() => {
    if (!open || !position) {
      return;
    }

    const menu = menuRef.current;
    const menuWidth = menu?.offsetWidth ?? width;
    const menuHeight = menu?.offsetHeight ?? 0;
    const maxX = Math.max(MENU_MARGIN, window.innerWidth - menuWidth - MENU_MARGIN);
    const maxY = Math.max(MENU_MARGIN, window.innerHeight - menuHeight - MENU_MARGIN);

    setResolvedPosition({
      x: Math.min(Math.max(MENU_MARGIN, position.x), maxX),
      y: Math.min(Math.max(MENU_MARGIN, position.y), maxY),
    });
  }, [open, position, width, items]);

  React.useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handle_pointer_down = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        onClose();
      }
    };
    const handle_key_down = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    const handle_scroll = () => onClose();

    window.addEventListener("pointerdown", handle_pointer_down);
    window.addEventListener("keydown", handle_key_down);
    window.addEventListener("scroll", handle_scroll, true);

    return () => {
      window.removeEventListener("pointerdown", handle_pointer_down);
      window.removeEventListener("keydown", handle_key_down);
      window.removeEventListener("scroll", handle_scroll, true);
    };
  }, [open, onClose]);

  if (!open || !position) {
    return null;
  }

  const menu = (
    <List
      ref={menuRef}
      role="menu"
      className={`fixed z-[110] rounded-lg border border-white/10 bg-[#0f172a] p-1 text-slate-100 shadow-2xl shadow-black/45 ring-1 ring-black/20 ${className}`}
      style={{ left: resolvedPosition.x, top: resolvedPosition.y, width }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const TrailingIcon = item.trailingIcon;
        const iconTone = item.danger ? "danger" : item.iconTone ?? "default";
        const iconClassName = `${item.iconFill ? "fill-current stroke-[2.4]" : "stroke-[2.2]"} shrink-0`;

        return (
          <React.Fragment key={item.id}>
            {item.separatorBefore ? <Box className="my-1 h-px bg-white/10" role="separator" /> : null}
            <ListItem
              as="button"
              type="button"
              density="compact"
              tone={item.danger ? "danger" : "default"}
              interactive={!item.disabled}
              role="menuitem"
              disabled={item.disabled}
              className={`w-full items-center gap-2 px-2.5 text-sm ${item.disabled ? "cursor-not-allowed opacity-50" : ""}`}
              onClick={() => {
                if (item.disabled) {
                  return;
                }

                item.onSelect();
                onClose();
              }}
            >
              <ListItemIcon className={`h-7 w-7 ring-1 ${ICON_TONE_CLASS_MAP[iconTone]}`}>
                {Icon ? <Icon size={15} className={iconClassName} /> : null}
              </ListItemIcon>
              <InlineText className="min-w-0 flex-1 truncate">{item.label}</InlineText>
              {TrailingIcon ? (
                <TrailingIcon
                  size={15}
                  className={`ml-auto shrink-0 ${ICON_TEXT_TONE_CLASS_MAP[iconTone]} ${item.iconFill ? "fill-current" : ""}`}
                />
              ) : null}
            </ListItem>
          </React.Fragment>
        );
      })}
    </List>
  );

  return createPortal(menu, document.body);
}
