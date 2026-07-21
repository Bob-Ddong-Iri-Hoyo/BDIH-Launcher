import React from "react";
import { createPortal } from "react-dom";
import { LucideIcon, Triangle } from "lucide-react";
import { resolve_context_submenu_position } from "../Logic/ContextMenuPosition";
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
  children?: ContextMenuItem[];
  onSelect?: () => void;
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
const SUBMENU_GAP = 4;
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
  const layerRef = React.useRef<HTMLElement>(null);
  const menuRef = React.useRef<HTMLElement>(null);
  const submenuRef = React.useRef<HTMLElement>(null);
  const itemRefs = React.useRef(new Map<string, HTMLElement>());
  const submenuId = React.useId();
  const [resolvedPosition, setResolvedPosition] = React.useState<ContextMenuPosition>(position ?? { x: 0, y: 0 });
  const [openSubmenuItemId, setOpenSubmenuItemId] = React.useState<string>();
  const [submenuPosition, setSubmenuPosition] = React.useState<ContextMenuPosition>({ x: 0, y: 0 });
  const openSubmenuItem = items.find((item) => item.id === openSubmenuItemId && item.children?.length);

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

  React.useLayoutEffect(() => {
    if (!open || !openSubmenuItem) {
      return;
    }

    const anchor = itemRefs.current.get(openSubmenuItem.id)?.getBoundingClientRect();
    const submenu = submenuRef.current;

    if (!anchor || !submenu) {
      return;
    }

    setSubmenuPosition(resolve_context_submenu_position({
      anchorLeft: anchor.left,
      anchorRight: anchor.right,
      anchorTop: anchor.top,
      menuWidth: submenu.offsetWidth || width,
      menuHeight: submenu.offsetHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      margin: MENU_MARGIN,
      gap: SUBMENU_GAP,
    }));
  }, [open, openSubmenuItem, resolvedPosition, width]);

  React.useEffect(() => {
    if (!open || (openSubmenuItemId && !openSubmenuItem)) {
      setOpenSubmenuItemId(undefined);
    }
  }, [open, openSubmenuItem, openSubmenuItemId]);

  React.useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handle_pointer_down = (event: PointerEvent) => {
      if (!layerRef.current?.contains(event.target as Node)) {
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

  function render_menu_item(item: ContextMenuItem, isSubmenuItem = false) {
    const Icon = item.icon;
    const TrailingIcon = item.trailingIcon;
    const iconTone = item.danger ? "danger" : item.iconTone ?? "default";
    const iconClassName = `${item.iconFill ? "fill-current stroke-[2.4]" : "stroke-[2.2]"} shrink-0`;
    const hasChildren = !isSubmenuItem && Boolean(item.children?.length);
    const isSubmenuOpen = hasChildren && openSubmenuItemId === item.id;

    return (
      <React.Fragment key={item.id}>
        {item.separatorBefore ? <Box className="my-1 h-px bg-white/10" role="separator" /> : null}
        <ListItem
          ref={isSubmenuItem ? undefined : (element) => {
            if (element) {
              itemRefs.current.set(item.id, element);
            } else {
              itemRefs.current.delete(item.id);
            }
          }}
          as="button"
          type="button"
          density="compact"
          tone={item.danger ? "danger" : "default"}
          interactive={!item.disabled}
          role="menuitem"
          aria-haspopup={hasChildren ? "menu" : undefined}
          aria-expanded={hasChildren ? isSubmenuOpen : undefined}
          aria-controls={hasChildren && isSubmenuOpen ? submenuId : undefined}
          disabled={item.disabled}
          className={`w-full items-center gap-2 px-2.5 text-sm ${item.disabled ? "cursor-not-allowed opacity-50" : ""}`}
          onPointerEnter={() => {
            if (!item.disabled && !isSubmenuItem) {
              setOpenSubmenuItemId(hasChildren ? item.id : undefined);
            }
          }}
          onFocus={() => {
            if (!item.disabled && !isSubmenuItem) {
              setOpenSubmenuItemId(hasChildren ? item.id : undefined);
            }
          }}
          onKeyDown={(event) => {
            if (hasChildren && event.key === "ArrowRight") {
              event.preventDefault();
              setOpenSubmenuItemId(item.id);
            } else if (!isSubmenuItem && event.key === "ArrowLeft" && openSubmenuItemId) {
              event.preventDefault();
              setOpenSubmenuItemId(undefined);
            } else if (isSubmenuItem && event.key === "ArrowLeft") {
              event.preventDefault();
              setOpenSubmenuItemId(undefined);
              itemRefs.current.get(openSubmenuItemId ?? "")?.focus();
            }
          }}
          onClick={() => {
            if (item.disabled) {
              return;
            }

            if (hasChildren) {
              setOpenSubmenuItemId(item.id);
              return;
            }

            item.onSelect?.();
            onClose();
          }}
        >
          <ListItemIcon className={`h-7 w-7 ring-1 ${ICON_TONE_CLASS_MAP[iconTone]}`}>
            {Icon ? <Icon size={15} className={iconClassName} /> : null}
          </ListItemIcon>
          <InlineText className="min-w-0 flex-1 truncate">{item.label}</InlineText>
          {hasChildren ? (
            <Triangle
              size={10}
              aria-hidden="true"
              className={`ml-auto shrink-0 rotate-90 fill-current ${ICON_TEXT_TONE_CLASS_MAP[iconTone]}`}
            />
          ) : TrailingIcon ? (
            <TrailingIcon
              size={15}
              className={`ml-auto shrink-0 ${ICON_TEXT_TONE_CLASS_MAP[iconTone]} ${item.iconFill ? "fill-current" : ""}`}
            />
          ) : null}
        </ListItem>
      </React.Fragment>
    );
  }

  const menu = (
    <Box ref={layerRef} className="contents">
      <List
        ref={menuRef}
        role="menu"
        className={`fixed z-[110] rounded-lg border border-white/10 bg-[#0f172a] p-1 text-slate-100 shadow-2xl shadow-black/45 ring-1 ring-black/20 ${className}`}
        style={{ left: resolvedPosition.x, top: resolvedPosition.y, width }}
        onContextMenu={(event) => event.preventDefault()}
      >
        {items.map((item) => render_menu_item(item))}
      </List>

      {openSubmenuItem?.children?.length ? (
        <List
          id={submenuId}
          ref={submenuRef}
          role="menu"
          aria-label={openSubmenuItem.label}
          className="fixed z-[111] rounded-lg border border-white/10 bg-[#0f172a] p-1 text-slate-100 shadow-2xl shadow-black/45 ring-1 ring-black/20"
          style={{ left: submenuPosition.x, top: submenuPosition.y, width }}
          onContextMenu={(event) => event.preventDefault()}
        >
          {openSubmenuItem.children.map((item) => render_menu_item(item, true))}
        </List>
      ) : null}
    </Box>
  );

  return createPortal(menu, document.body);
}
