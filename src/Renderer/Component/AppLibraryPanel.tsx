import React from "react";
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, FileText, GripVertical, Play, Plus, Settings, Square, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { IPC_CHANNELS } from "../../Common/Types/IPC";
import type { BottleLaunchOptionsPayload, BottlePrefixMetadataPayload, LauncherLogEntryPayload, LauncherLogSnapshotPayload } from "../../Common/Types/IPC";
import type { WineLauncherOptionsManifest } from "../../Common/Types/Wine";
import type { Bottle } from "../Types/Bottle";
import { useDirectExecutableRunner } from "../Hooks/UseDirectExecutableRunner";
import { ContextMenu, ContextMenuItem, ContextMenuPosition } from "./ContextMenu";
import { Dialog } from "./Dialog";
import { DirectExecutableActionForm } from "./DirectExecutableActionForm";
import { ImageButton } from "./ImageButton";
import { LaunchOptionsDialog } from "./LaunchOptionsDialog";
import { Box, Button, CodeBlock, IconSlot, Inline, Stack, Text } from "./Primitives";
import { StatusBadge } from "./StatusBadge";

function SortableBottleApp({
  app,
  appLogoSrc,
  selectedWineVersionId,
  isEditing,
  isApplyingOrder,
  editingActionLabel,
  onLaunch,
  onContextMenu,
}: {
  app: Bottle["apps"][number];
  appLogoSrc: string;
  selectedWineVersionId: string;
  isEditing: boolean;
  isApplyingOrder: boolean;
  editingActionLabel: string;
  onLaunch: () => void;
  onContextMenu: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: app.id,
    disabled: !isEditing || isApplyingOrder,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 20 : undefined,
      }}
      className={`relative h-full w-full ${isDragging ? "opacity-55" : ""}`}
    >
      <ImageButton
        preset="desktop"
        src={app.iconSrc || appLogoSrc}
        name={app.name}
        subtitle={app.launchError ? `${t("main.appContext.launchFailed")}: ${app.launchError}` : `${app.subtitle} · ${app.lastPlayedKey ? t(app.lastPlayedKey) : app.lastPlayed}`}
        isActive={app.wineVersionId === selectedWineVersionId}
        isRunning={Boolean(app.processId)}
        isLaunching={isEditing ? false : Boolean(app.isLaunching)}
        hasError={Boolean(app.launchError)}
        actionLabel={isEditing
          ? editingActionLabel
          : app.status === "needs-prefix"
            ? t("common.actions.createPrefix")
            : app.isLaunching
              ? t("main.appContext.launching")
              : t("common.actions.run")}
        className={isEditing
          ? "accent-selection cursor-grab active:cursor-grabbing"
          : ""}
        dragHandleProps={isEditing ? { ...attributes, ...listeners } : undefined}
        onClick={isEditing ? undefined : onLaunch}
        onContextMenu={(event) => {
          if (isEditing) {
            event.preventDefault();
            return;
          }

          onContextMenu(event);
        }}
      />
      {isEditing ? (
        <IconSlot className="pointer-events-none absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-black/70 text-slate-200 shadow-lg">
          <GripVertical size={14} />
        </IconSlot>
      ) : null}
    </div>
  );
}

/**
 * Bottle-scoped application grid.
 *
 * Use this inside a selected bottle detail view to show discovered launchers and
 * games, launch apps, open per-app context actions, and inspect compact app
 * logs without mixing bottle metadata controls into the app grid.
 */
export function AppLibraryPanel({
  bottle,
  selectedWineVersionId,
  launcherOptionsManifest,
  appLogoSrc,
  onLaunchBottleApp,
  onStopBottleApp,
  onDeleteBottleApp,
  onDeleteBottleAppFiles,
  onReorderBottleApps,
  onRegisterBottleExecutable,
  onUpdateBottlePrefixes,
  onDeleteBottlePrefix,
  onChangeBottleAppLaunchOptions,
}: {
  bottle: Bottle;
  selectedWineVersionId: string;
  launcherOptionsManifest?: WineLauncherOptionsManifest;
  appLogoSrc: string;
  onLaunchBottleApp?: (bottleId: string, appId: string) => void;
  onStopBottleApp?: (bottleId: string, appId: string) => void;
  onDeleteBottleApp?: (bottleId: string, appId: string) => void;
  onDeleteBottleAppFiles?: (bottleId: string, appId: string) => void;
  onReorderBottleApps?: (bottleId: string, orderedAppIds: string[]) => Promise<void> | void;
  onRegisterBottleExecutable?: (bottleId: string, executablePath: string, prefixPath: string, launchOptions?: BottleLaunchOptionsPayload) => void;
  onUpdateBottlePrefixes?: (bottleId: string, prefixes: BottlePrefixMetadataPayload[]) => void;
  onDeleteBottlePrefix?: (bottleId: string, prefix: BottlePrefixMetadataPayload) => Promise<void> | void;
  onChangeBottleAppLaunchOptions?: (bottleId: string, appId: string, launchOptions: BottleLaunchOptionsPayload) => void;
}) {
  const { t } = useTranslation();
  const [contextMenuState, setContextMenuState] = React.useState<{
    position: ContextMenuPosition;
    appId: string;
  } | null>(null);
  const [selectedLogAppId, setSelectedLogAppId] = React.useState<string | null>(null);
  const [selectedLaunchOptionsAppId, setSelectedLaunchOptionsAppId] = React.useState<string | null>(null);
  const [isManualAddOpen, setIsManualAddOpen] = React.useState(false);
  const [isEditingOrder, setIsEditingOrder] = React.useState(false);
  const [isApplyingOrder, setIsApplyingOrder] = React.useState(false);
  const [draftAppOrder, setDraftAppOrder] = React.useState<string[]>(() => bottle.apps.map((app) => app.id));
  const draftAppOrderRef = React.useRef(draftAppOrder);
  const [confirmAction, setConfirmAction] = React.useState<{
    type: "stop" | "remove" | "delete";
    appId: string;
  } | null>(null);
  const [appLogText, setAppLogText] = React.useState("");
  const [isAppLogLoading, setIsAppLogLoading] = React.useState(false);
  const appLogPanelRef = React.useRef<HTMLPreElement>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const manualAddRunner = useDirectExecutableRunner({
    bottle,
    launcherOptionsManifest,
    onRegisterBottleExecutable,
    onUpdateBottlePrefixes,
    onDeleteBottlePrefix,
  });
  const contextApp = bottle.apps.find((app) => app.id === contextMenuState?.appId);
  const selectedLogApp = bottle.apps.find((app) => app.id === selectedLogAppId);
  const selectedLaunchOptionsApp = bottle.apps.find((app) => app.id === selectedLaunchOptionsAppId);
  const confirmApp = bottle.apps.find((app) => app.id === confirmAction?.appId);
  const orderedApps = React.useMemo(() => {
    if (!isEditingOrder) {
      return bottle.apps;
    }

    const appsById = new Map(bottle.apps.map((app) => [app.id, app]));
    return draftAppOrder
      .map((appId) => appsById.get(appId))
      .filter((app): app is Bottle["apps"][number] => Boolean(app));
  }, [bottle.apps, draftAppOrder, isEditingOrder]);

  React.useEffect(() => {
    const nextOrder = bottle.apps.map((app) => app.id);
    draftAppOrderRef.current = nextOrder;
    setDraftAppOrder(nextOrder);
    setIsEditingOrder(false);
    setIsApplyingOrder(false);
  }, [bottle.id]);

  React.useEffect(() => {
    const appIds = bottle.apps.map((app) => app.id);
    const appIdSet = new Set(appIds);
    const nextOrder = [
      ...draftAppOrderRef.current.filter((appId) => appIdSet.has(appId)),
      ...appIds.filter((appId) => !draftAppOrderRef.current.includes(appId)),
    ];

    if (
      nextOrder.length === draftAppOrderRef.current.length &&
      nextOrder.every((appId, index) => appId === draftAppOrderRef.current[index])
    ) {
      return;
    }

    draftAppOrderRef.current = nextOrder;
    setDraftAppOrder(nextOrder);
  }, [bottle.apps]);

  React.useEffect(() => {
    if (selectedLaunchOptionsAppId && !selectedLaunchOptionsApp) {
      setSelectedLaunchOptionsAppId(null);
    }
  }, [selectedLaunchOptionsApp, selectedLaunchOptionsAppId]);

  const close_app_log_dialog = React.useCallback(() => {
    setSelectedLogAppId(null);
    setAppLogText("");
    setIsAppLogLoading(false);
  }, []);

  React.useEffect(() => {
    if (!selectedLogAppId || isAppLogLoading) return;

    const animationFrame = window.requestAnimationFrame(() => {
      const logPanel = appLogPanelRef.current;
      if (logPanel) {
        logPanel.scrollTop = logPanel.scrollHeight;
      }
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [appLogText, isAppLogLoading, selectedLogAppId]);

  const appContextMenuItems = React.useMemo<ContextMenuItem[]>(() => {
    if (!contextApp) {
      return [];
    }

    const menuItems: ContextMenuItem[] = contextApp.processId ? [
      {
        id: "stop",
        label: t("main.appContext.stop"),
        icon: Square,
        trailingIcon: Square,
        iconTone: "danger",
        iconFill: true,
        danger: true,
        onSelect: () => setConfirmAction({ type: "stop", appId: contextApp.id }),
      },
    ] : contextApp.isLaunching ? [
      {
        id: "launching",
        label: t("main.appContext.launching"),
        icon: Play,
        iconTone: "info",
        disabled: true,
        onSelect: () => undefined,
      },
    ] : [
      {
        id: "run",
        label: t("main.appContext.run"),
        icon: Play,
        iconTone: "success",
        iconFill: true,
        onSelect: () => onLaunchBottleApp?.(bottle.id, contextApp.id),
      },
    ];

    menuItems.push(
      {
        id: "launch-options",
        label: t("main.appContext.launchOptions"),
        icon: Settings,
        iconTone: "violet",
        separatorBefore: true,
        onSelect: () => setSelectedLaunchOptionsAppId(contextApp.id),
      },
      {
        id: "show-logs",
        label: t("main.appContext.showLogs"),
        icon: FileText,
        iconTone: "warning",
        onSelect: () => void open_app_log_dialog(contextApp.id),
      },
      {
        id: "remove-from-list",
        label: t("main.appContext.removeFromList"),
        icon: Trash2,
        iconTone: "danger",
        danger: true,
        separatorBefore: true,
        onSelect: () => setConfirmAction({ type: "remove", appId: contextApp.id }),
      },
      {
        id: "delete-app-files",
        label: t("main.appContext.deleteFiles"),
        icon: Trash2,
        iconTone: "danger",
        danger: true,
        onSelect: () => setConfirmAction({ type: "delete", appId: contextApp.id }),
      },
    );

    return menuItems;
  }, [bottle.id, contextApp, onLaunchBottleApp, t]);

  function confirm_pending_action() {
    if (!confirmAction || !confirmApp) {
      setConfirmAction(null);
      return;
    }

    if (confirmAction.type === "stop") {
      onStopBottleApp?.(bottle.id, confirmApp.id);
    }

    if (confirmAction.type === "remove") {
      onDeleteBottleApp?.(bottle.id, confirmApp.id);
    }

    if (confirmAction.type === "delete") {
      onDeleteBottleAppFiles?.(bottle.id, confirmApp.id);
    }

    setConfirmAction(null);
  }

  function confirm_action_title(): string {
    if (!confirmAction || !confirmApp) {
      return "";
    }

    if (confirmAction.type === "stop") {
      return t("main.appContext.stopConfirmTitle", { name: confirmApp.name });
    }

    if (confirmAction.type === "remove") {
      return t("main.appContext.removeFromListTitle", { name: confirmApp.name });
    }

    return t("main.appContext.deleteFilesTitle", { name: confirmApp.name });
  }

  function confirm_action_description(): string {
    if (!confirmAction || !confirmApp) {
      return "";
    }

    if (confirmAction.type === "stop") {
      return t("main.appContext.stopConfirmDescription", { name: confirmApp.name });
    }

    if (confirmAction.type === "remove") {
      return t("main.appContext.removeFromListConfirm", { name: confirmApp.name });
    }

    return t("main.appContext.deleteFilesConfirm", { name: confirmApp.name });
  }

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

  function begin_app_order_edit() {
    const nextOrder = bottle.apps.map((app) => app.id);
    draftAppOrderRef.current = nextOrder;
    setDraftAppOrder(nextOrder);
    setContextMenuState(null);
    setIsEditingOrder(true);
  }

  function cancel_app_order_edit() {
    const originalOrder = bottle.apps.map((app) => app.id);
    draftAppOrderRef.current = originalOrder;
    setDraftAppOrder(originalOrder);
    setIsEditingOrder(false);
  }

  async function apply_app_order() {
    if (isApplyingOrder) {
      return;
    }

    setIsApplyingOrder(true);

    try {
      await onReorderBottleApps?.(bottle.id, draftAppOrderRef.current);
      setIsEditingOrder(false);
    } catch (error) {
      console.error("Failed to persist bottle app order:", error);
    } finally {
      setIsApplyingOrder(false);
    }
  }

  function finish_app_drag({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) {
      return;
    }

    const currentOrder = draftAppOrderRef.current;
    const sourceIndex = currentOrder.indexOf(String(active.id));
    const targetIndex = currentOrder.indexOf(String(over.id));

    if (sourceIndex < 0 || targetIndex < 0) {
      return;
    }

    const nextOrder = arrayMove(currentOrder, sourceIndex, targetIndex);
    draftAppOrderRef.current = nextOrder;
    setDraftAppOrder(nextOrder);
  }

  return (
    <>
      <Box as="section" className="min-h-[18rem] rounded-xl border border-white/10 bg-white/[0.035] p-4">
        <Inline className="mb-4 items-center justify-between gap-3">
          <Stack className="gap-1">
            <Box as="h3" className="text-base font-semibold text-white">
              {t("main.bottleGames")}
            </Box>
            <Text className="text-xs text-slate-500">
              {t("main.bottleApps", { count: bottle.apps.length })}
            </Text>
          </Stack>
          <Inline className="flex-wrap items-center justify-end gap-2">
            {isEditingOrder ? (
              <Stack className="w-36 gap-1">
                <Button
                  type="button"
                  aria-pressed="true"
                  disabled
                  className="accent-selection inline-flex h-8 w-full cursor-default items-center justify-center gap-2 rounded-lg border px-3 text-xs font-semibold text-white disabled:opacity-100"
                >
                  <GripVertical size={14} />
                  {t("main.appEditing")}
                </Button>
                <Inline className="gap-1">
                  <Button
                    type="button"
                    onClick={cancel_app_order_edit}
                    disabled={isApplyingOrder}
                    className="inline-flex h-7 flex-1 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] px-2 text-[11px] font-semibold text-slate-300 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
                  >
                    {t("main.bottleEditCancel")}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => void apply_app_order()}
                    disabled={isApplyingOrder}
                    className="accent-primary inline-flex h-7 flex-1 items-center justify-center gap-1 rounded-md px-2 text-[11px] font-semibold disabled:cursor-wait disabled:opacity-60"
                  >
                    <Check size={12} />
                    {t("main.bottleEditApply")}
                  </Button>
                </Inline>
              </Stack>
            ) : (
              <Button
                type="button"
                variant="glass"
                size="sm"
                icon={<GripVertical size={14} />}
                disabled={bottle.apps.length < 2}
                onClick={begin_app_order_edit}
              >
                {t("main.appEdit")}
              </Button>
            )}
            <Button
              type="button"
              variant="glass"
              size="sm"
              icon={<Plus size={14} />}
              disabled={isEditingOrder}
              onClick={() => setIsManualAddOpen(true)}
            >
              {t("main.runner.addManualApp")}
            </Button>
          </Inline>
        </Inline>
        {isEditingOrder ? (
          <Text className="mb-4 rounded-lg border border-[rgb(var(--accent-rgb)/0.25)] bg-[rgb(var(--accent-rgb)/0.08)] px-3 py-2 text-xs text-[rgb(var(--accent-soft-text-rgb))]">
            {t("main.appEditHint")}
          </Text>
        ) : null}
        {bottle.apps.length === 0 ? (
          <Box className="flex min-h-44 items-center justify-center rounded-xl border border-dashed border-white/10 bg-[#0b1020] px-6 text-center text-sm leading-6 text-slate-500">
            {t("main.bottleAppsEmpty")}
          </Box>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={finish_app_drag}
          >
            <SortableContext
              items={orderedApps.map((app) => app.id)}
              strategy={rectSortingStrategy}
            >
              <Box className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] justify-items-center gap-x-5 gap-y-6">
                {orderedApps.map((app) => (
                  <SortableBottleApp
                    key={app.id}
                    app={app}
                    appLogoSrc={appLogoSrc}
                    selectedWineVersionId={selectedWineVersionId}
                    isEditing={isEditingOrder}
                    isApplyingOrder={isApplyingOrder}
                    editingActionLabel={t("main.appEditing")}
                    onLaunch={() => onLaunchBottleApp?.(bottle.id, app.id)}
                    onContextMenu={(event) => open_app_context_menu(event, app.id)}
                  />
                ))}
              </Box>
            </SortableContext>
          </DndContext>
        )}
        <ContextMenu
          open={Boolean(contextMenuState && contextApp)}
          position={contextMenuState?.position}
          items={appContextMenuItems}
          onClose={() => setContextMenuState(null)}
        />
      </Box>

      <Dialog
        open={isManualAddOpen}
        title={t("main.runner.addManualApp")}
        description={t("main.runner.addManualAppDescription")}
        tone="info"
        icon={Plus}
        placement="center"
        widthClassName="max-w-2xl"
        onClose={() => setIsManualAddOpen(false)}
        actions={[
          {
            label: t("common.actions.cancel"),
            variant: "secondary",
            onClick: () => setIsManualAddOpen(false),
          },
          {
            label: t("main.runner.register"),
            icon: Plus,
            variant: "primary",
            disabled: !manualAddRunner.canRun,
            onClick: () => {
              if (manualAddRunner.registerExecutable()) {
                setIsManualAddOpen(false);
              }
            },
          },
        ]}
      >
        <DirectExecutableActionForm runner={manualAddRunner} mode="register" />
      </Dialog>

      <Dialog
        open={Boolean(selectedLogAppId)}
        title={t("main.appContext.appLogsTitle", { name: selectedLogApp?.name ?? "App" })}
        description={t("main.appContext.appLogsDescription")}
        tone={isAppLogLoading ? "info" : "neutral"}
        icon={FileText}
        placement="center"
        widthClassName="max-w-4xl"
        onClose={close_app_log_dialog}
        actions={[
          {
            label: t("common.actions.close"),
            variant: "secondary",
            onClick: close_app_log_dialog,
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
          <CodeBlock ref={appLogPanelRef} className="max-h-[60vh] min-h-80 overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-[#050914] p-4 font-mono text-xs leading-5 text-slate-200 shadow-inner shadow-black/30">
            {appLogText || t("main.appContext.noLogs")}
          </CodeBlock>
        </Stack>
      </Dialog>

      <LaunchOptionsDialog
        open={Boolean(selectedLaunchOptionsAppId)}
        bottle={bottle}
        initialAppId={selectedLaunchOptionsAppId ?? undefined}
        launcherOptionsManifest={launcherOptionsManifest}
        onClose={() => setSelectedLaunchOptionsAppId(null)}
        onSave={onChangeBottleAppLaunchOptions}
      />

      <Dialog
        open={Boolean(confirmAction && confirmApp)}
        title={confirm_action_title()}
        description={confirm_action_description()}
        tone={confirmAction?.type === "remove" ? "warning" : "danger"}
        icon={confirmAction?.type === "stop" ? Square : Trash2}
        placement="center"
        widthClassName="max-w-lg"
        onClose={() => setConfirmAction(null)}
        actions={[
          {
            label: t("common.actions.cancel"),
            variant: "secondary",
            onClick: () => setConfirmAction(null),
          },
          {
            label: confirmAction?.type === "stop" ? t("main.appContext.stop") : t("common.actions.delete"),
            variant: "danger",
            onClick: confirm_pending_action,
          },
        ]}
      />
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
  const matchingSessions = snapshot.sessions
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
    .sort((left, right) => log_timestamp(right.startedAt) - log_timestamp(left.startedAt));
  const latestSession = matchingSessions[0];

  if (latestSession) {
    const latestSessionEntries = snapshot.entries.filter((entry) =>
      entry.category === "wine" && entry.sessionId === latestSession.id,
    );
    if (latestSessionEntries.length > 0) {
      return latestSessionEntries;
    }
  }

  const matchingEntries = snapshot.entries.filter((entry) => {
    if (entry.category !== "wine") {
      return false;
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

  const latestFallbackEntry = matchingEntries.reduce<LauncherLogEntryPayload | undefined>(
    (latest, entry) => !latest || log_timestamp(entry.timestamp) > log_timestamp(latest.timestamp) ? entry : latest,
    undefined,
  );
  return latestFallbackEntry?.sessionId
    ? matchingEntries.filter((entry) => entry.sessionId === latestFallbackEntry.sessionId)
    : matchingEntries;
}

function log_timestamp(value: string): number {
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
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
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
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
