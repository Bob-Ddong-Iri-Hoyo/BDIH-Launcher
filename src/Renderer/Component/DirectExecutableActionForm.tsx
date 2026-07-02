import React from "react";
import { createPortal } from "react-dom";
import { FolderOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { DirectExecutableRunnerController } from "../Hooks/UseDirectExecutableRunner";
import {
  Button,
  FieldLabel,
  FloatingLayer,
  Inline,
  Input,
  List,
  ListItem,
  ListItemBody,
  ListItemIcon,
  ListItemTitle,
  RelativeBox,
  Stack,
  StatusMessage,
  Surface,
  Text,
} from "./Primitives";

/**
 * Form body for direct executable launching.
 *
 * Use this inside the direct launch dialog. It owns path entry, argument entry,
 * browse/autocomplete interactions, and validation presentation for executable
 * paths while leaving launch side effects to the parent.
 */
export function DirectExecutableActionForm({
  runner,
  mode = "run",
}: {
  runner: DirectExecutableRunnerController;
  mode?: "run" | "register";
}) {
  const shouldShowArguments = mode === "run";

  return (
    <Stack className="gap-3">
      <Surface tone="deep" padding="md">
        <Stack className="gap-3">
          <RunnerHeader runner={runner} mode={mode} />
          <ExecutablePathField runner={runner} mode={mode} />
          {shouldShowArguments ? <ExecutableArgumentsField runner={runner} /> : null}
        </Stack>
      </Surface>

      {runner.statusMessage ? (
        <StatusMessage>{runner.statusMessage}</StatusMessage>
      ) : null}
    </Stack>
  );
}

function RunnerHeader({
  runner,
  mode,
}: {
  runner: DirectExecutableRunnerController;
  mode: "run" | "register";
}) {
  const { t } = useTranslation();
  const isRegisterMode = mode === "register";

  return (
    <Inline className="flex-wrap items-start justify-between gap-3">
      <Stack className="gap-1">
        <Text className="text-sm font-semibold text-slate-100">
          {t(isRegisterMode ? "main.runner.manualAddTitle" : "main.runner.manualTitle")}
        </Text>
        <Text className="text-xs text-slate-500">
          {t(isRegisterMode ? "main.runner.manualAddFormDescription" : "main.runner.manualDescription")}
        </Text>
      </Stack>
      <Button
        variant="glass"
        size="sm"
        onClick={() => void runner.browseExecutable()}
      >
        <FolderOpen size={14} />
        {t("main.runner.browseFile")}
      </Button>
    </Inline>
  );
}

function ExecutablePathField({
  runner,
  mode,
}: {
  runner: DirectExecutableRunnerController;
  mode: "run" | "register";
}) {
  const { t } = useTranslation();
  const fieldRef = React.useRef<HTMLElement>(null);
  const suggestionPosition = useAnchoredFloatingPosition(runner.isPathSuggestionOpen, fieldRef);
  const isRegisterMode = mode === "register";

  return (
    <Stack className="gap-2">
      <RelativeBox ref={fieldRef}>
        <Input
          ref={runner.pathInputRef}
          value={runner.executablePath}
          onChange={(event) => runner.setExecutablePathFromInput(event.target.value)}
          onKeyDown={(event) => void runner.handlePathKeyDown(event)}
          placeholder={t("main.runner.pathPlaceholder")}
          spellCheck={false}
          className="h-10 w-full rounded-lg border border-white/10 bg-[#0b1020] px-3 font-mono text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-[rgb(var(--accent-rgb)/0.55)]"
        />
      </RelativeBox>
      {runner.isPathSuggestionOpen && suggestionPosition && typeof document !== "undefined"
        ? createPortal(
            <PathSuggestionList runner={runner} position={suggestionPosition} />,
            document.body,
          )
        : null}
      <Text className="text-xs text-slate-500">
        {t(isRegisterMode ? "main.runner.registerPathHint" : "main.runner.pathHint")} {t(isRegisterMode ? "main.runner.pathAutocompleteRegisterHint" : "main.runner.pathAutocompleteHint")}
        {runner.isPathSuggesting ? ` ${t("common.syncing")}` : ""}
      </Text>
    </Stack>
  );
}

interface AnchoredFloatingPosition {
  style: React.CSSProperties;
  maxHeight: number;
}

function PathSuggestionList({
  runner,
  position,
}: {
  runner: DirectExecutableRunnerController;
  position: AnchoredFloatingPosition;
}) {
  return (
    <FloatingLayer strategy="fixed" className="z-[1400]" style={position.style}>
      <List
        className="overflow-y-auto rounded-lg border border-white/10 bg-[#0f172a] p-1 shadow-2xl shadow-black/40"
        style={{ maxHeight: position.maxHeight }}
      >
        {runner.pathSuggestions.map((suggestion, index) => (
          <ListItem
            as="button"
            type="button"
            key={`${suggestion.path}-${index}`}
            density="compact"
            tone={index === runner.selectedSuggestionIndex ? "selected" : "default"}
            interactive
            className="w-full items-center gap-2"
            onMouseEnter={() => runner.selectPathSuggestion?.(index)}
            onMouseDown={(event) => {
              event.preventDefault();
              runner.applyPathSuggestion(suggestion);
            }}
          >
            <ListItemIcon className="h-7 w-7 bg-transparent">
              <FolderOpen size={13} className={suggestion.isDirectory ? "text-sky-300" : "text-slate-500"} />
            </ListItemIcon>
            <ListItemBody>
              <ListItemTitle className="font-mono text-xs font-normal">{suggestion.path}</ListItemTitle>
            </ListItemBody>
          </ListItem>
        ))}
      </List>
    </FloatingLayer>
  );
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

function ExecutableArgumentsField({ runner }: { runner: DirectExecutableRunnerController }) {
  const { t } = useTranslation();

  return (
    <Stack className="gap-2">
      <FieldLabel>{t("main.runner.argumentsLabel")}</FieldLabel>
      <Input
        ref={runner.argsInputRef}
        value={runner.executableArgs}
        onChange={(event) => runner.setExecutableArgs(event.target.value)}
        onKeyDown={(event) => void runner.handleArgsKeyDown(event)}
        placeholder={t("main.runner.argumentsPlaceholder")}
        spellCheck={false}
        className="h-10 w-full rounded-lg border border-white/10 bg-[#0b1020] px-3 font-mono text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-[rgb(var(--accent-rgb)/0.55)]"
      />
      <Text className="text-xs text-slate-500">
        {t("main.runner.argumentsHint")}
      </Text>
    </Stack>
  );
}
