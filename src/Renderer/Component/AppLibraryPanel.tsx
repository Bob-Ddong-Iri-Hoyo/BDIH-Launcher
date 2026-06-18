import React from "react";
import { ExternalLink, FileText, Settings, Square, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { split_executable_args } from "../../Common/Util/ExecutablePath";
import { IPC_CHANNELS } from "../../Common/Types/IPC";
import type { LauncherLogEntryPayload, LauncherLogSnapshotPayload } from "../../Common/Types/IPC";
import type { Bottle } from "../Types/Bottle";
import { ContextMenu, ContextMenuItem, ContextMenuPosition } from "./ContextMenu";
import { Dialog } from "./Dialog";
import { ImageButton } from "./ImageButton";
import { Box, CodeBlock, Inline, Stack, Text } from "./Primitives";
import { StatusBadge } from "./StatusBadge";

export function AppLibraryPanel({
  bottle,
  selectedWineVersionId,
  appLogoSrc,
  onLaunchBottleApp,
  onLaunchBottleAppWithArgs,
  onStopBottleApp,
  onDeleteBottleApp,
}: {
  bottle: Bottle;
  selectedWineVersionId: string;
  appLogoSrc: string;
  onLaunchBottleApp?: (bottleId: string, appId: string) => void;
  onLaunchBottleAppWithArgs?: (bottleId: string, appId: string, executableArgs: string[]) => void;
  onStopBottleApp?: (bottleId: string, appId: string) => void;
  onDeleteBottleApp?: (bottleId: string, appId: string) => void;
}) {
  const { t } = useTranslation();
  const [contextMenuState, setContextMenuState] = React.useState<{
    position: ContextMenuPosition;
    appId: string;
  } | null>(null);
  const [selectedLogAppId, setSelectedLogAppId] = React.useState<string | null>(null);
  const [appLogText, setAppLogText] = React.useState("");
  const [isAppLogLoading, setIsAppLogLoading] = React.useState(false);
  const contextApp = bottle.apps.find((app) => app.id === contextMenuState?.appId);
  const selectedLogApp = bottle.apps.find((app) => app.id === selectedLogAppId);
  const appContextMenuItems = React.useMemo<ContextMenuItem[]>(() => {
    if (!contextApp) {
      return [];
    }

    return [
      {
        id: "run",
        label: t("main.appContext.run"),
        icon: ExternalLink,
        onSelect: () => onLaunchBottleApp?.(bottle.id, contextApp.id),
      },
      {
        id: "run-with-args",
        label: t("main.appContext.runWithArgs"),
        icon: Settings,
        onSelect: () => {
          const rawArgs = window.prompt(t("main.appContext.argumentsPrompt"), contextApp.executableArgs?.join(" ") ?? "");

          if (rawArgs === null) {
            return;
          }

          onLaunchBottleAppWithArgs?.(bottle.id, contextApp.id, split_executable_args(rawArgs));
        },
      },
      {
        id: "stop",
        label: t("main.appContext.stop"),
        icon: Square,
        disabled: !contextApp.processId,
        onSelect: () => onStopBottleApp?.(bottle.id, contextApp.id),
      },
      {
        id: "show-logs",
        label: t("main.appContext.showLogs"),
        icon: FileText,
        separatorBefore: true,
        onSelect: () => void open_app_log_dialog(contextApp.id),
      },
      {
        id: "delete",
        label: t("main.appContext.delete"),
        icon: Trash2,
        danger: true,
        onSelect: () => {
          if (window.confirm(t("main.appContext.deleteConfirm", { name: contextApp.name }))) {
            onDeleteBottleApp?.(bottle.id, contextApp.id);
          }
        },
      },
    ];
  }, [bottle.id, contextApp, onDeleteBottleApp, onLaunchBottleApp, onLaunchBottleAppWithArgs, onStopBottleApp, t]);

  async function open_app_log_dialog(appId: string) {
    const app = bottle.apps.find((candidateApp) => candidateApp.id === appId);

    if (!app) {
      return;
    }

    setSelectedLogAppId(appId);
    setIsAppLogLoading(true);
    setAppLogText(t("main.appContext.loadingLogs"));

    try {
      const snapshot = (await window.BTIH_API?.invoke(
        IPC_CHANNELS.APP.GET_LOG_SNAPSHOT.channelName,
        undefined as never,
      )) as LauncherLogSnapshotPayload | undefined;
      const entries = app_log_entries_from_snapshot(snapshot, bottle, app);

      setAppLogText(entries.length > 0
        ? entries.slice(-400).map(format_compact_log_entry).join("\n")
        : t("main.appContext.noLogs"));
    } catch (error) {
      setAppLogText(error instanceof Error ? error.message : String(error));
    } finally {
      setIsAppLogLoading(false);
    }
  }

  function open_app_context_menu(event: React.MouseEvent, appId: string) {
    event.preventDefault();
    setContextMenuState({
      appId,
      position: {
        x: event.clientX,
        y: event.clientY,
      },
    });
  }

  return (
    <>
      <Box as="section" className="min-h-[18rem] rounded-xl border border-white/10 bg-white/[0.04] p-4">
        <Inline className="mb-4 items-center justify-between gap-3">
          <Stack className="gap-1">
            <Box as="h3" className="text-base font-semibold text-white">
              {t("main.bottleGames")}
            </Box>
            <Text className="text-xs text-slate-500">
              {t("main.bottleApps", { count: bottle.apps.length })}
            </Text>
          </Stack>
        </Inline>
        {bottle.apps.length === 0 ? (
          <Box className="flex min-h-44 items-center justify-center rounded-xl border border-dashed border-white/10 bg-[#0b1020] px-6 text-center text-sm leading-6 text-slate-500">
            {t("main.bottleAppsEmpty")}
          </Box>
        ) : (
          <Box className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {bottle.apps.map((app) => (
              <ImageButton
                key={app.id}
                src={app.iconSrc || appLogoSrc}
                name={app.name}
                subtitle={app.launchError ? `${t("main.appContext.launchFailed")}: ${app.launchError}` : `${app.subtitle} · ${app.lastPlayedKey ? t(app.lastPlayedKey) : app.lastPlayed}`}
                isActive={app.wineVersionId === selectedWineVersionId}
                isRunning={Boolean(app.processId)}
                hasError={Boolean(app.launchError)}
                actionLabel={
                  app.status === "needs-prefix"
                    ? t("common.actions.createPrefix")
                    : t("common.actions.run")
                }
                onClick={() => onLaunchBottleApp?.(bottle.id, app.id)}
                onContextMenu={(event) => open_app_context_menu(event, app.id)}
              />
            ))}
          </Box>
        )}
        <ContextMenu
          open={Boolean(contextMenuState && contextApp)}
          position={contextMenuState?.position}
          items={appContextMenuItems}
          onClose={() => setContextMenuState(null)}
        />
      </Box>

      <Dialog
        open={Boolean(selectedLogAppId)}
        title={t("main.appContext.appLogsTitle", { name: selectedLogApp?.name ?? "App" })}
        description={t("main.appContext.appLogsDescription")}
        tone={isAppLogLoading ? "info" : "neutral"}
        icon={FileText}
        placement="center"
        widthClassName="max-w-4xl"
        onClose={() => {
          setSelectedLogAppId(null);
          setAppLogText("");
        }}
        actions={[
          {
            label: t("common.actions.close"),
            variant: "secondary",
            onClick: () => {
              setSelectedLogAppId(null);
              setAppLogText("");
            },
          },
        ]}
      >
        <Stack className="gap-3">
          <Inline className="flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
            <Text className="min-w-0 truncate text-xs text-slate-500">
              {selectedLogApp?.name ?? "-"} · {bottle.name}
            </Text>
            <StatusBadge
              label={isAppLogLoading ? t("common.syncing") : t("common.ready")}
              tone={isAppLogLoading ? "info" : "success"}
            />
          </Inline>
          <CodeBlock className="max-h-[60vh] min-h-80 overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-[#050914] p-4 font-mono text-xs leading-5 text-slate-200 shadow-inner shadow-black/30">
            {appLogText || t("main.appContext.noLogs")}
          </CodeBlock>
        </Stack>
      </Dialog>
    </>
  );
}

function app_log_entries_from_snapshot(
  snapshot: LauncherLogSnapshotPayload | undefined,
  bottle: Bottle,
  app: Bottle["apps"][number],
): LauncherLogEntryPayload[] {
  if (!snapshot) {
    return [];
  }

  const bottleTokens = build_log_tokens([bottle.id, bottle.name]);
  const appTokens = build_log_tokens([app.id, app.name]);
  const matchingSessionIds = new Set(
    snapshot.sessions
      .filter((session) => {
        if (session.kind !== "bottle") {
          return false;
        }

        const sessionText = build_log_search_text([
          session.id,
          session.label,
          session.logFileName,
          session.bottleId,
          session.bottleName,
        ]);

        return log_text_matches_any_token(sessionText, bottleTokens)
          && log_text_matches_any_token(sessionText, appTokens);
      })
      .map((session) => session.id),
  );

  return snapshot.entries.filter((entry) => {
    if (entry.category !== "wine") {
      return false;
    }

    if (matchingSessionIds.has(entry.sessionId)) {
      return true;
    }

    const entryText = build_log_search_text([
      entry.sessionId,
      entry.source,
      entry.bottleId,
      entry.bottleName,
      entry.message,
    ]);

    return log_text_matches_any_token(entryText, bottleTokens)
      && log_text_matches_any_token(entryText, appTokens);
  });
}

function build_log_tokens(values: Array<string | undefined>): string[] {
  const tokens = new Set<string>();

  values.forEach((value) => {
    const rawValue = value?.trim().toLowerCase();

    if (!rawValue) {
      return;
    }

    tokens.add(rawValue);

    const slug = normalize_log_slug(rawValue);

    if (slug) {
      tokens.add(slug);
    }
  });

  return Array.from(tokens);
}

function build_log_search_text(values: Array<string | undefined>): string {
  return values
    .flatMap((value) => {
      const rawValue = value?.trim().toLowerCase();

      if (!rawValue) {
        return [];
      }

      const slug = normalize_log_slug(rawValue);

      return slug ? [rawValue, slug] : [rawValue];
    })
    .join(" ");
}

function normalize_log_slug(value: string): string {
  return value
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function log_text_matches_any_token(text: string, tokens: string[]): boolean {
  return tokens.some((token) => token.length > 0 && text.includes(token));
}

function format_compact_log_entry(entry: LauncherLogEntryPayload): string {
  const source = entry.source ? ` [${entry.source}]` : "";

  return `${format_compact_log_time(entry.timestamp)} [${entry.level.toUpperCase()}]${source} ${entry.message}`;
}

function format_compact_log_time(timestamp: string): string {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}
