import React from "react";
import { createPortal } from "react-dom";
import { FolderOpen } from "lucide-react";
import { IPC_CHANNELS } from "../../Common/Types/IPC";
import type { PathSuggestionItemPayload } from "../../Common/Types/IPC";
import {
  FloatingLayer,
  Input,
  List,
  ListItem,
  ListItemBody,
  ListItemIcon,
  ListItemTitle,
  RelativeBox,
} from "./Primitives";

export interface PathAutocompleteInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
  value: string;
  defaultPath?: string;
  directoryOnly?: boolean;
  suggestionLimit?: number;
  onChange?: (value: string) => void;
}

/**
 * Path input with launcher-backed filesystem suggestions.
 *
 * Use this for macOS/local folder path fields in settings and bottle creation.
 * Tab opens or cycles suggestions, Shift+Tab cycles backward, Enter applies the
 * highlighted suggestion, and Escape closes the suggestion list.
 */
export function PathAutocompleteInput({
  value,
  defaultPath,
  directoryOnly = true,
  suggestionLimit = 80,
  onChange,
  className,
  title,
  onKeyDown,
  ...props
}: PathAutocompleteInputProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const anchorRef = React.useRef<HTMLElement>(null);
  const [suggestions, setSuggestions] = React.useState<PathSuggestionItemPayload[]>([]);
  const [isOpen, setIsOpen] = React.useState(false);
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [isSuggesting, setIsSuggesting] = React.useState(false);
  const requestIdRef = React.useRef(0);
  const floatingPosition = useAnchoredFloatingPosition(isOpen, anchorRef);

  async function request_suggestions(nextValue = value) {
    const requestId = requestIdRef.current + 1;

    requestIdRef.current = requestId;
    setIsSuggesting(true);

    try {
      const result = await window.BTIH_API?.invoke(IPC_CHANNELS.APP.SUGGEST_PATHS.channelName, {
        value: nextValue || defaultPath || "",
        defaultPath,
        limit: suggestionLimit,
      });
      const nextSuggestions = (result?.suggestions ?? [])
        .filter((suggestion) => !directoryOnly || suggestion.isDirectory);

      if (requestId !== requestIdRef.current) {
        return;
      }

      setSuggestions(nextSuggestions);
      setSelectedIndex(0);
      setIsOpen(nextSuggestions.length > 0);
    } catch {
      if (requestId === requestIdRef.current) {
        setSuggestions([]);
        setIsOpen(false);
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setIsSuggesting(false);
      }
    }
  }

  function apply_suggestion(suggestion: PathSuggestionItemPayload) {
    onChange?.(suggestion.path);
    setIsOpen(false);
    setSelectedIndex(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function move_selection(direction: 1 | -1) {
    if (suggestions.length === 0) {
      return;
    }

    setSelectedIndex((currentIndex) => (currentIndex + direction + suggestions.length) % suggestions.length);
  }

  function handle_key_down(event: React.KeyboardEvent<HTMLInputElement>) {
    onKeyDown?.(event);

    if (event.defaultPrevented) {
      return;
    }

    if (event.key === "Escape" && isOpen) {
      event.preventDefault();
      setIsOpen(false);
      return;
    }

    if (event.key === "Enter" && isOpen && suggestions[selectedIndex]) {
      event.preventDefault();
      apply_suggestion(suggestions[selectedIndex]);
      return;
    }

    if (event.key === "ArrowDown" && isOpen) {
      event.preventDefault();
      move_selection(1);
      return;
    }

    if (event.key === "ArrowUp" && isOpen) {
      event.preventDefault();
      move_selection(-1);
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();

      if (isOpen && suggestions.length > 0) {
        move_selection(event.shiftKey ? -1 : 1);
        return;
      }

      void request_suggestions(value);
    }
  }

  const inputClassName = className
    ? ["w-full min-w-0", className].filter(Boolean).join(" ")
    : "h-10 w-full min-w-0 rounded-lg border border-white/10 bg-[#0b1020] px-3 font-mono text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-[rgb(var(--accent-rgb)/0.55)]";

  return (
    <RelativeBox
      ref={anchorRef}
      className="min-w-0 flex-1 cursor-text"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          event.preventDefault();
          inputRef.current?.focus();
        }
      }}
    >
      <Input
        {...props}
        ref={inputRef}
        value={value}
        title={title ?? value}
        spellCheck={false}
        aria-busy={isSuggesting}
        onChange={(event) => onChange?.(event.target.value)}
        onKeyDown={handle_key_down}
        className={inputClassName}
      />
      {isOpen && floatingPosition && typeof document !== "undefined"
        ? createPortal(
            <FloatingLayer strategy="fixed" className="z-[1500]" style={floatingPosition.style}>
              <List
                className="overflow-auto rounded-lg border border-white/10 bg-[#0f172a] p-1 shadow-2xl shadow-black/40"
                style={{
                  maxHeight: floatingPosition.maxHeight,
                  maxWidth: "calc(100vw - 24px)",
                }}
              >
                {suggestions.map((suggestion, index) => (
                  <ListItem
                    as="button"
                    type="button"
                    key={`${suggestion.path}-${index}`}
                    density="compact"
                    tone={index === selectedIndex ? "selected" : "default"}
                    interactive
                    className="min-w-max items-center gap-2"
                    onMouseEnter={() => setSelectedIndex(index)}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      apply_suggestion(suggestion);
                    }}
                  >
                    <ListItemIcon className="h-7 w-7 bg-transparent">
                      <FolderOpen size={13} className="text-sky-300" />
                    </ListItemIcon>
                    <ListItemBody className="min-w-0">
                      <ListItemTitle className="block min-w-0 whitespace-nowrap font-mono text-xs font-normal leading-5">
                        {suggestion.path}
                      </ListItemTitle>
                    </ListItemBody>
                  </ListItem>
                ))}
              </List>
            </FloatingLayer>,
            document.body,
          )
        : null}
    </RelativeBox>
  );
}

interface AnchoredFloatingPosition {
  style: React.CSSProperties;
  maxHeight: number;
}

function useAnchoredFloatingPosition(
  open: boolean,
  anchorRef: React.RefObject<HTMLElement | null>,
): AnchoredFloatingPosition | null {
  const [position, setPosition] = React.useState<AnchoredFloatingPosition | null>(null);

  React.useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return undefined;
    }

    function update_position() {
      const anchor = anchorRef.current;

      if (!anchor) {
        setPosition(null);
        return;
      }

      const rect = anchor.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const gap = 8;
      const margin = 12;
      const spaceBelow = viewportHeight - rect.bottom - gap - margin;
      const spaceAbove = rect.top - gap - margin;
      const showAbove = spaceBelow < 220 && spaceAbove > spaceBelow;
      const availableHeight = Math.max(160, showAbove ? spaceAbove : spaceBelow);
      const width = Math.max(260, Math.min(rect.width, viewportWidth - margin * 2));
      const left = Math.min(Math.max(margin, rect.left), viewportWidth - width - margin);

      setPosition({
        maxHeight: Math.min(420, availableHeight),
        style: {
          left,
          width,
          top: showAbove ? undefined : rect.bottom + gap,
          bottom: showAbove ? viewportHeight - rect.top + gap : undefined,
        },
      });
    }

    update_position();
    window.addEventListener("resize", update_position);
    window.addEventListener("scroll", update_position, true);

    return () => {
      window.removeEventListener("resize", update_position);
      window.removeEventListener("scroll", update_position, true);
    };
  }, [anchorRef, open]);

  return position;
}
