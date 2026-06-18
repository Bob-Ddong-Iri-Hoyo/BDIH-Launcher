import React from "react";
import { FolderOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { DirectExecutableRunnerController } from "../Hooks/UseDirectExecutableRunner";
import {
  Button,
  FieldLabel,
  FloatingLayer,
  Inline,
  InlineText,
  Input,
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
}: {
  runner: DirectExecutableRunnerController;
}) {
  return (
    <Stack gap="md">
      <Surface tone="deep" padding="md">
        <Stack gap="md">
          <RunnerHeader runner={runner} />
          <ExecutablePathField runner={runner} />
          <ExecutableArgumentsField runner={runner} />
        </Stack>
      </Surface>

      {runner.statusMessage ? (
        <StatusMessage>{runner.statusMessage}</StatusMessage>
      ) : null}
    </Stack>
  );
}

function RunnerHeader({ runner }: { runner: DirectExecutableRunnerController }) {
  const { t } = useTranslation();

  return (
    <Inline align="start" justify="between" wrap gap="md">
      <Stack gap="xs">
        <Text tone="strong" size="sm" weight="semibold">
          {t("main.runner.manualTitle")}
        </Text>
        <Text tone="muted" size="xs">
          {t("main.runner.manualDescription")}
        </Text>
      </Stack>
      <Button
        variant="glass"
        size="sm"
        icon={<FolderOpen size={14} />}
        onClick={() => void runner.browseExecutable()}
      >
        {t("main.runner.browseFile")}
      </Button>
    </Inline>
  );
}

function ExecutablePathField({ runner }: { runner: DirectExecutableRunnerController }) {
  const { t } = useTranslation();

  return (
    <Stack gap="sm">
      <RelativeBox>
        <Input
          ref={runner.pathInputRef}
          value={runner.executablePath}
          onChange={(event) => runner.setExecutablePathFromInput(event.target.value)}
          onKeyDown={(event) => void runner.handlePathKeyDown(event)}
          placeholder={t("main.runner.pathPlaceholder")}
          spellCheck={false}
          tone="mono"
        />
        {runner.isPathSuggestionOpen ? <PathSuggestionList runner={runner} /> : null}
      </RelativeBox>
      <Text tone="muted" size="xs">
        {t("main.runner.pathHint")} {t("main.runner.pathAutocompleteHint")}
        {runner.isPathSuggesting ? ` ${t("common.syncing")}` : ""}
      </Text>
    </Stack>
  );
}

function PathSuggestionList({ runner }: { runner: DirectExecutableRunnerController }) {
  return (
    <FloatingLayer>
      <Stack gap="xs">
        {runner.pathSuggestions.map((suggestion, index) => (
          <Button
            key={`${suggestion.path}-${index}`}
            variant="listbox"
            selected={index === runner.selectedSuggestionIndex}
            className="w-full justify-start text-left font-normal"
            icon={<FolderOpen size={13} className={suggestion.isDirectory ? "text-sky-300" : "text-slate-500"} />}
            onMouseDown={(event) => {
              event.preventDefault();
              runner.applyPathSuggestion(suggestion);
            }}
          >
            <InlineText tone="body" size="xs" truncate className="min-w-0 flex-1 font-mono">
              {suggestion.path}
            </InlineText>
          </Button>
        ))}
      </Stack>
    </FloatingLayer>
  );
}

function ExecutableArgumentsField({ runner }: { runner: DirectExecutableRunnerController }) {
  const { t } = useTranslation();

  return (
    <Stack gap="sm">
      <FieldLabel>{t("main.runner.argumentsLabel")}</FieldLabel>
      <Input
        ref={runner.argsInputRef}
        value={runner.executableArgs}
        onChange={(event) => runner.setExecutableArgs(event.target.value)}
        onKeyDown={(event) => void runner.handleArgsKeyDown(event)}
        placeholder={t("main.runner.argumentsPlaceholder")}
        spellCheck={false}
        tone="mono"
      />
      <Text tone="muted" size="xs">
        {t("main.runner.argumentsHint")}
      </Text>
    </Stack>
  );
}
