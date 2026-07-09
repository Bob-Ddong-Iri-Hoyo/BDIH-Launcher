import React from "react";
import { Download } from "lucide-react";
import { useTranslation } from "react-i18next";
import { HOYOPLAY_ICON_URL, STEAM_ICON_URL } from "../../Common/Constant/RuntimeSources";
import type { BottleLauncherKind } from "../../Common/Types/IPC";
import type { BottlePrefixMetadataPayload } from "../../Common/Types/IPC";
import type { Bottle } from "../Types/Bottle";
import { DirectExecutableAction } from "./DirectExecutableAction";
import { Dialog } from "./Dialog";
import { FaviconIcon } from "./FaviconIcon";
import { Box, Button, Inline, InlineText, Stack, Text } from "./Primitives";

/**
 * Quick action row for the currently selected bottle.
 *
 * Use this above or beside bottle metadata when the user needs launcher install
 * shortcuts and a direct executable launcher for the same bottle context.
 */
export function BottleActionBar({
  bottle,
  wineRuntimePath,
  dxmtPackagePath,
  onInstallBottleLauncher,
  onLaunchBottleApp,
  onRegisterBottleExecutable,
  onUpdateBottlePrefixes,
  onDeleteBottlePrefix,
}: {
  bottle: Bottle;
  wineRuntimePath?: string;
  dxmtPackagePath?: string;
  onInstallBottleLauncher?: (bottleId: string, launcher: BottleLauncherKind) => void;
  onLaunchBottleApp?: (bottleId: string, appId: string) => void;
  onRegisterBottleExecutable?: (bottleId: string, executablePath: string, prefixPath: string) => void;
  onUpdateBottlePrefixes?: (bottleId: string, prefixes: BottlePrefixMetadataPayload[]) => void;
  onDeleteBottlePrefix?: (bottleId: string, prefix: BottlePrefixMetadataPayload) => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const [isLauncherInstallOpen, setIsLauncherInstallOpen] = React.useState(false);
  const launcherKinds: BottleLauncherKind[] = ["steam", "hoyoplay"];
  const hasWorkingLauncherTask = launcherKinds.some((launcher) => {
    const task = bottle.launcherTasks?.[launcher];

    return task ? ["setup", "dxmt", "download", "install"].includes(task.stage) : false;
  });
  const readyLauncherCount = launcherKinds.filter((launcher) =>
    bottle.apps.some((app) => app.id === launcher) ||
    (
      bottle.launcherTasks?.[launcher]?.stage === "ready" &&
      (bottle.launcherTasks?.[launcher]?.progress ?? 0) >= 100
    ),
  ).length;

  return (
    <Box as="section" className="grid gap-2 rounded-lg border border-white/10 bg-[#0b1020]/70 p-2">
      <Stack className="gap-3 rounded-lg border border-white/10 bg-white/[0.035] p-3">
        <Stack className="gap-1">
          <Inline className="items-center justify-between gap-3">
            <Text className="min-w-0 truncate text-sm font-semibold text-slate-100">
              {t("main.installers.title")}
            </Text>
          <InlineText className={`shrink-0 rounded-md border px-2 py-1 text-[11px] font-semibold ${
            hasWorkingLauncherTask
              ? "border-sky-300/25 bg-sky-500/15 text-sky-100"
              : readyLauncherCount > 0
                ? "border-emerald-300/25 bg-emerald-500/15 text-emerald-100"
                : "border-white/10 bg-white/[0.04] text-slate-400"
          }`}>
            {hasWorkingLauncherTask
              ? t("main.installers.installing")
              : readyLauncherCount > 0
                ? t("main.installers.installedCount", { count: readyLauncherCount })
                : t("main.installers.notInstalled")}
          </InlineText>
          </Inline>
          <Text className="text-xs leading-5 text-slate-500">
            {t("main.installers.description")}
          </Text>
        </Stack>
        <Button
          type="button"
          variant="glass"
          size="md"
          className="w-full justify-center"
          icon={<Download size={15} />}
          onClick={() => setIsLauncherInstallOpen(true)}
        >
          {t("main.installers.openAction")}
        </Button>
      </Stack>
      <DirectExecutableAction
        bottle={bottle}
        wineRuntimePath={wineRuntimePath}
        dxmtPackagePath={dxmtPackagePath}
        onRegisterBottleExecutable={onRegisterBottleExecutable}
        onUpdateBottlePrefixes={onUpdateBottlePrefixes}
        onDeleteBottlePrefix={onDeleteBottlePrefix}
      />
      <Dialog
        open={isLauncherInstallOpen}
        title={t("main.installers.modalTitle")}
        description={t("main.installers.modalDescription")}
        tone={hasWorkingLauncherTask ? "info" : "neutral"}
        icon={Download}
        placement="center"
        widthClassName="max-w-xl"
        onClose={() => setIsLauncherInstallOpen(false)}
        actions={[
          {
            label: t("common.actions.close"),
            variant: "secondary",
            onClick: () => setIsLauncherInstallOpen(false),
          },
        ]}
      >
        <Box className="grid gap-3">
          <LauncherInstallIconButton
            bottle={bottle}
            launcher="steam"
            iconSrc={STEAM_ICON_URL}
            label={t("main.installers.steam.title")}
            onInstallBottleLauncher={onInstallBottleLauncher}
            onLaunchBottleApp={onLaunchBottleApp}
          />
          <LauncherInstallIconButton
            bottle={bottle}
            launcher="hoyoplay"
            iconSrc={HOYOPLAY_ICON_URL}
            label={t("main.installers.hoyoplay.title")}
            onInstallBottleLauncher={onInstallBottleLauncher}
            onLaunchBottleApp={onLaunchBottleApp}
          />
        </Box>
      </Dialog>
    </Box>
  );
}

function LauncherInstallIconButton({
  bottle,
  launcher,
  iconSrc,
  label,
  onInstallBottleLauncher,
  onLaunchBottleApp,
}: {
  bottle: Bottle;
  launcher: BottleLauncherKind;
  iconSrc: string;
  label: string;
  onInstallBottleLauncher?: (bottleId: string, launcher: BottleLauncherKind) => void;
  onLaunchBottleApp?: (bottleId: string, appId: string) => void;
}) {
  const { t } = useTranslation();
  const task = bottle.launcherTasks?.[launcher];
  const isWorking = task ? ["setup", "dxmt", "download", "install"].includes(task.stage) : false;
  const launcherApp = bottle.apps.find((app) => app.id === launcher);
  const isInstallerDownloaded = Boolean(task && !isWorking && task.stage === "ready" && task.progress >= 100);
  const isReady = Boolean(launcherApp) || isInstallerDownloaded;
  const isError = task?.stage === "error";
  const progress = Math.max(0, Math.min(100, task?.progress ?? 0));
  const displayProgress = Math.round(progress);
  const statusLabel = launcher_status_label({
    stage: task?.stage,
    progress: displayProgress,
    isWorking,
    isReady,
    isError,
    translate: t,
  });
  const title = isWorking
    ? `${label} ${t(`main.installers.stage.${task?.stage ?? "install"}`)}`
    : `${label} ${statusLabel}`;

  function handle_launcher_click() {
    if (isReady && launcherApp) {
      onLaunchBottleApp?.(bottle.id, launcherApp.id);
      return;
    }

    onInstallBottleLauncher?.(bottle.id, launcher);
  }

  return (
    <Button
      type="button"
      disabled={isWorking}
      title={title}
      onClick={handle_launcher_click}
      className={`launcher-action-button group grid h-14 min-w-0 shrink-0 grid-cols-[2.75rem_minmax(0,1fr)_7.25rem] items-center gap-2 overflow-hidden rounded-xl border px-3 text-left transition active:scale-95 ${
        isReady
          ? "accent-border bg-white/[0.07] text-slate-100 hover:bg-white/[0.1]"
        : isError
          ? "border-rose-400/35 bg-rose-500/10 text-rose-100 hover:bg-rose-500/15"
          : isWorking
            ? "border-white/10 bg-white/[0.035] text-slate-300 hover:border-white/15 hover:bg-white/[0.05]"
            : "border-white/10 bg-white/[0.025] text-slate-500 grayscale hover:border-white/15 hover:bg-white/[0.04]"
      } ${isWorking ? "cursor-wait disabled:cursor-wait" : ""}`}
    >
      <Box
        className={`launcher-action-icon relative grid h-10 w-10 place-items-center justify-self-center rounded-full ${isWorking ? "launcher-action-icon-working" : ""} ${isError ? "launcher-action-icon-error" : ""} ${isReady ? "launcher-action-icon-ready" : ""}`}
        style={{ "--launcher-progress": `${displayProgress}%` } as React.CSSProperties}
      >
        <FaviconIcon src={iconSrc} label={label} />
        {isWorking ? (
          <Box className="pointer-events-none absolute inset-[-5px] rounded-full launcher-action-progress-ring" />
        ) : null}
      </Box>
      <InlineText className={isReady ? "min-w-0 truncate text-left text-xs font-semibold text-slate-200" : "min-w-0 truncate text-left text-xs font-semibold text-slate-500"}>
        {label}
      </InlineText>
      <Inline className="min-w-0 justify-end">
        <InlineText className={`inline-flex h-7 w-28 items-center justify-center truncate rounded-full border px-2 text-center text-[10px] font-black ${
          launcher_status_tone_class({ isWorking, isReady, isError })
        }`}>
          {statusLabel}
        </InlineText>
      </Inline>
    </Button>
  );
}

function launcher_status_label({
  stage,
  progress,
  isWorking,
  isReady,
  isError,
  translate,
}: {
  stage?: string;
  progress: number;
  isWorking: boolean;
  isReady: boolean;
  isError: boolean;
  translate: (key: string) => string;
}) {
  if (isError) {
    return translate("main.installers.stage.error");
  }

  if (isWorking) {
    if (stage === "download") {
      return `${translate("main.installers.downloading")} ${progress}%`;
    }

    return translate(`main.installers.stage.${stage ?? "install"}`);
  }

  if (isReady) {
    return translate("main.installers.stage.ready");
  }

  return translate("common.actions.download");
}

function launcher_status_tone_class({
  isWorking,
  isReady,
  isError,
}: {
  isWorking: boolean;
  isReady: boolean;
  isError: boolean;
}) {
  if (isError) {
    return "border-rose-300/30 bg-rose-500/15 text-rose-100";
  }

  if (isWorking) {
    return "border-sky-300/25 bg-sky-500/15 text-sky-100";
  }

  if (isReady) {
    return "border-emerald-300/25 bg-emerald-500/15 text-emerald-100";
  }

  return "border-white/10 bg-white/[0.04] text-slate-400";
}
