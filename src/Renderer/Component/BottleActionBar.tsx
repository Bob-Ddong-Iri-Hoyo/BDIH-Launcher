import React from "react";
import { useTranslation } from "react-i18next";
import { HOYOPLAY_ICON_URL, STEAM_ICON_URL } from "../../Common/Constant/RuntimeSources";
import type { BottleLauncherKind } from "../../Common/Types/IPC";
import type { Bottle } from "../Types/Bottle";
import { DirectExecutableAction } from "./DirectExecutableAction";
import { FaviconIcon } from "./FaviconIcon";
import { Box, Button, InlineText } from "./Primitives";

/**
 * Quick action row for the currently selected bottle.
 *
 * Use this above or beside bottle metadata when the user needs launcher install
 * shortcuts and a direct executable launcher for the same bottle context.
 */
export function BottleActionBar({
  bottle,
  wineRuntimePath,
  onInstallBottleLauncher,
  onRegisterBottleExecutable,
}: {
  bottle: Bottle;
  wineRuntimePath?: string;
  onInstallBottleLauncher?: (bottleId: string, launcher: BottleLauncherKind) => void;
  onRegisterBottleExecutable?: (bottleId: string, executablePath: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <Box as="section" className="flex flex-wrap items-center justify-end gap-2 rounded-lg border border-white/10 bg-[#0b1020]/70 p-2">
      <LauncherInstallIconButton
        bottle={bottle}
        launcher="steam"
        iconSrc={STEAM_ICON_URL}
        label={t("main.installers.steam.title")}
        actionLabel={t("main.installers.installSteam")}
        onInstallBottleLauncher={onInstallBottleLauncher}
      />
      <LauncherInstallIconButton
        bottle={bottle}
        launcher="hoyoplay"
        iconSrc={HOYOPLAY_ICON_URL}
        label={t("main.installers.hoyoplay.title")}
        actionLabel={t("main.installers.installHoyoplay")}
        onInstallBottleLauncher={onInstallBottleLauncher}
      />
      <DirectExecutableAction
        bottle={bottle}
        wineRuntimePath={wineRuntimePath}
        onRegisterBottleExecutable={onRegisterBottleExecutable}
      />
    </Box>
  );
}

function LauncherInstallIconButton({
  bottle,
  launcher,
  iconSrc,
  label,
  actionLabel,
  onInstallBottleLauncher,
}: {
  bottle: Bottle;
  launcher: BottleLauncherKind;
  iconSrc: string;
  label: string;
  actionLabel: string;
  onInstallBottleLauncher?: (bottleId: string, launcher: BottleLauncherKind) => void;
}) {
  const { t } = useTranslation();
  const task = bottle.launcherTasks?.[launcher];
  const isWorking = task ? ["setup", "dxmt", "download", "install"].includes(task.stage) : false;
  const isTaskComplete = Boolean(task && !isWorking && task.stage !== "error" && task.progress >= 100);
  const progress = Math.max(0, Math.min(100, task?.progress ?? 0));

  return (
    <Button
      type="button"
      disabled={isWorking}
      title={isWorking ? `${label} ${t(`main.installers.stage.${task?.stage ?? "install"}`)}` : actionLabel}
      onClick={() => onInstallBottleLauncher?.(bottle.id, launcher)}
      className={`group relative inline-flex h-10 min-w-24 shrink-0 items-center justify-center gap-2 overflow-hidden rounded-lg border border-white/10 bg-[#0b1020] px-3 transition hover:border-white/20 hover:bg-white/[0.08] disabled:opacity-80 ${isWorking ? "disabled:cursor-wait" : "disabled:cursor-not-allowed"}`}
    >
      <FaviconIcon src={iconSrc} label={label} />
      <InlineText className="max-w-24 truncate text-xs font-semibold text-slate-300">{label}</InlineText>
      <InlineText className="pointer-events-none absolute inset-x-2 bottom-1 translate-y-3 rounded-md bg-black/75 px-2 py-1 text-center text-[10px] font-semibold text-white opacity-0 shadow-lg transition group-hover:translate-y-0 group-hover:opacity-100">
        {isWorking ? t("main.installers.installing") : actionLabel}
      </InlineText>
      {task && !isTaskComplete ? (
        <Box className="absolute inset-x-2 top-2 h-1 overflow-hidden rounded-full bg-white/10">
          <Box
            className={`progress-wave block h-full rounded-full ${task.stage === "error" ? "bg-rose-400" : "bg-emerald-400"}`}
            style={{ width: `${progress}%` }}
          />
        </Box>
      ) : null}
    </Button>
  );
}
