import React from "react";
import { createPortal } from "react-dom";
import { LucideIcon } from "lucide-react";

export interface ContextMenuPosition {
  x: number;
  y: number;
}

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: LucideIcon;
  disabled?: boolean;
  danger?: boolean;
  separatorBefore?: boolean;
  onSelect: () => void;
}

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

export function ContextMenu({
  open,
  position,
  items,
  onClose,
  width = DEFAULT_WIDTH,
  className = "",
}: ContextMenuProps) {
  const menuRef = React.useRef<HTMLDivElement>(null);
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
    <div
      ref={menuRef}
      role="menu"
      className={`fixed z-[110] rounded-lg border border-white/10 bg-[#0f172a] p-1 text-slate-100 shadow-2xl shadow-black/45 ring-1 ring-black/20 ${className}`}
      style={{ left: resolvedPosition.x, top: resolvedPosition.y, width }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item) => {
        const Icon = item.icon;

        return (
          <React.Fragment key={item.id}>
            {item.separatorBefore ? <div className="my-1 h-px bg-white/10" role="separator" /> : null}
            <button
              type="button"
              role="menuitem"
              disabled={item.disabled}
              className={`flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-45 ${
                item.danger
                  ? "text-red-100 hover:bg-red-500/15"
                  : "text-slate-200 hover:bg-white/[0.07] hover:text-white"
              }`}
              onClick={() => {
                if (item.disabled) {
                  return;
                }

                item.onSelect();
                onClose();
              }}
            >
              {Icon ? <Icon size={15} className="shrink-0" /> : <span className="h-[15px] w-[15px] shrink-0" />}
              <span className="min-w-0 truncate">{item.label}</span>
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );

  return createPortal(menu, document.body);
}
