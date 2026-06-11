import React from "react";
import { Check, ChevronDown, Search, Star, StarOff } from "lucide-react";
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuPosition,
} from "./ContextMenu";

export interface SelectMenuOption {
  value: string;
  label: string;
  description?: string;
  swatchColor?: string;
}

export interface SelectMenuProps {
  value: string;
  options: SelectMenuOption[];
  onChange: (value: string) => void;
  label?: string;
  enableFavorites?: boolean;
  favoriteValues?: string[];
  onFavoriteValuesChange?: (values: string[]) => void;
  searchPlaceholder?: string;
  className?: string;
}

export function SelectMenu({
  value,
  options,
  onChange,
  label,
  enableFavorites = false,
  favoriteValues,
  onFavoriteValuesChange,
  searchPlaceholder = "Search options",
  className = "",
}: SelectMenuProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [searchValue, setSearchValue] = React.useState("");
  const [localFavoriteValues, setLocalFavoriteValues] = React.useState<string[]>([]);
  const [contextMenuState, setContextMenuState] = React.useState<{
    option: SelectMenuOption;
    position: ContextMenuPosition;
  } | null>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const selectedOption = options.find((option) => option.value === value) ?? options[0];
  const activeFavoriteValues = favoriteValues ?? localFavoriteValues;
  const favoriteOptions = activeFavoriteValues
    .map((favoriteValue) => options.find((option) => option.value === favoriteValue))
    .filter((option): option is SelectMenuOption => Boolean(option));
  const filteredOptions = React.useMemo(() => {
    const normalizedSearch = searchValue.trim().toLowerCase();

    if (!normalizedSearch) {
      return options;
    }

    return options.filter((option) =>
      [option.label, option.description, option.value]
        .filter((text): text is string => Boolean(text))
        .some((text) => text.toLowerCase().includes(normalizedSearch)),
    );
  }, [options, searchValue]);

  React.useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handle_pointer_down = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handle_key_down = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("pointerdown", handle_pointer_down);
    window.addEventListener("keydown", handle_key_down);

    return () => {
      window.removeEventListener("pointerdown", handle_pointer_down);
      window.removeEventListener("keydown", handle_key_down);
    };
  }, [isOpen]);

  React.useEffect(() => {
    if (!isOpen) {
      setSearchValue("");
      return;
    }

    requestAnimationFrame(() => searchRef.current?.focus());
  }, [isOpen]);

  const handle_select = (nextValue: string) => {
    onChange(nextValue);
    setIsOpen(false);
    setContextMenuState(null);
  };

  const change_favorites = (nextValues: string[]) => {
    if (favoriteValues === undefined) {
      setLocalFavoriteValues(nextValues);
    }

    onFavoriteValuesChange?.(nextValues);
  };

  const add_favorite = (nextValue: string) => {
    if (activeFavoriteValues.includes(nextValue)) {
      return;
    }

    change_favorites([...activeFavoriteValues, nextValue]);
  };

  const remove_favorite = (nextValue: string) => {
    change_favorites(activeFavoriteValues.filter((favoriteValue) => favoriteValue !== nextValue));
  };

  const toggle_favorite = (nextValue: string) => {
    if (activeFavoriteValues.includes(nextValue)) {
      remove_favorite(nextValue);
      return;
    }

    add_favorite(nextValue);
  };

  const open_favorite_context_menu = (
    event: React.MouseEvent,
    option: SelectMenuOption,
  ) => {
    event.preventDefault();
    setContextMenuState({
      option,
      position: { x: event.clientX, y: event.clientY },
    });
  };

  const contextMenuItems: ContextMenuItem[] = contextMenuState
    ? [
        {
          id: "remove-favorite",
          label: "Remove favorite",
          icon: StarOff,
          onSelect: () => remove_favorite(contextMenuState.option.value),
        },
      ]
    : [];

  const render_option_content = (option: SelectMenuOption) => {
    return (
      <span className="flex min-w-0 items-center gap-2">
        {option.swatchColor && (
          <span
            className="h-4 w-4 shrink-0 rounded-full ring-2 ring-white/10"
            style={{ backgroundColor: option.swatchColor }}
          />
        )}
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{option.label}</span>
          {option.description && <span className="block truncate text-xs text-slate-500">{option.description}</span>}
        </span>
      </span>
    );
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {enableFavorites && (
        <div
          className={`grid transition-[grid-template-rows] duration-200 ease-out ${
            favoriteOptions.length > 0 ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          }`}
        >
          <div className="overflow-hidden">
            <div className="mb-2 flex min-w-0 gap-2 overflow-x-auto">
              {favoriteOptions.map((option) => (
                <button
                  key={`favorite-${option.value}`}
                  type="button"
                  onClick={() => handle_select(option.value)}
                  onContextMenu={(event) => open_favorite_context_menu(event, option)}
                  className={`flex h-9 min-w-36 shrink-0 items-center justify-between gap-2 rounded-md border px-3 text-left text-sm transition ${
                    option.value === value
                      ? "accent-selection text-white"
                      : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Star size={14} className="shrink-0 fill-current text-amber-300" />
                    <span className="truncate font-semibold">{option.label}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={label}
        onClick={() => setIsOpen((open) => !open)}
        className="flex h-11 w-full items-center justify-between gap-3 rounded-lg border border-white/10 bg-[#0b1020] px-3 text-left text-sm text-slate-100 outline-none transition hover:border-white/20 hover:bg-white/[0.05] focus:border-white/20"
      >
        <span className="flex min-w-0 items-center gap-2">
          {selectedOption?.swatchColor && (
            <span
              className="h-4 w-4 shrink-0 rounded-full ring-2 ring-white/10"
              style={{ backgroundColor: selectedOption.swatchColor }}
            />
          )}
          <span className="min-w-0">
            <span className="block truncate font-semibold">{selectedOption?.label}</span>
            {selectedOption?.description && <span className="block truncate text-xs text-slate-500">{selectedOption.description}</span>}
          </span>
        </span>
        <ChevronDown size={16} className={`shrink-0 text-slate-500 transition ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div
          className="absolute left-0 right-0 z-50 mt-2 rounded-lg border border-white/10 bg-[#0f172a] p-1 shadow-2xl shadow-black/40"
        >
          <label className="relative mb-1 block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              ref={searchRef}
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder={searchPlaceholder}
              className="h-9 w-full rounded-md border border-white/10 bg-[#0b1020] pl-9 pr-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-[rgb(var(--accent-rgb))] focus:ring-2 focus:ring-[rgb(var(--accent-rgb)/0.22)]"
            />
          </label>
          <div role="listbox" className="max-h-72 overflow-y-auto">
            {filteredOptions.map((option) => {
              const isSelected = option.value === value;
              const isFavorite = activeFavoriteValues.includes(option.value);

              return (
                <div
                  key={option.value}
                  role="option"
                  aria-selected={isSelected}
                  className={`flex w-full items-center gap-1 rounded-md transition ${
                    isSelected ? "accent-selection text-white" : "text-slate-300 hover:bg-white/[0.06] hover:text-white"
                  }`}
                >
                  {enableFavorites && (
                    <button
                      type="button"
                      aria-label={
                        isFavorite
                          ? `Remove ${option.label} from favorites`
                          : `Add ${option.label} to favorites`
                      }
                      onClick={() => toggle_favorite(option.value)}
                      className="grid h-7 w-7 shrink-0 place-items-center rounded text-slate-500 transition hover:bg-white/[0.06] hover:text-amber-200"
                    >
                      <Star
                        size={15}
                        className={
                          isFavorite ? "fill-current text-amber-300" : ""
                        }
                      />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handle_select(option.value)}
                    className="flex min-w-0 flex-1 items-center justify-between gap-3 px-2 py-2.5 text-left"
                  >
                    {render_option_content(option)}
                    {isSelected && <Check size={16} className="shrink-0 accent-text" />}
                  </button>
                </div>
              );
            })}
            {filteredOptions.length === 0 && (
              <div className="px-3 py-4 text-sm text-slate-500">
                No options found.
              </div>
            )}
          </div>
        </div>
      )}
      <ContextMenu
        open={Boolean(contextMenuState)}
        position={contextMenuState?.position}
        items={contextMenuItems}
        onClose={() => setContextMenuState(null)}
      />
    </div>
  );
}
