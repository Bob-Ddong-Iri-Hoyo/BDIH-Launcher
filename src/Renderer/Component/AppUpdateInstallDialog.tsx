import React from "react";
import { Download, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AppUpdateInstallProgressPayload, AppUpdateInstallStage } from "../../Common/Types/IPC";
import { Dialog } from "./Dialog";
import { ProgressBar } from "./ProgressBar";
import { Inline, Stack, Text } from "./Primitives";

const UPDATE_STAGE_MESSAGE_KEYS: Record<AppUpdateInstallStage, string> = {
  "checking-processes": "updateInstall.stages.checkingProcesses",
  "saving-state": "updateInstall.stages.savingState",
  "stopping-processes": "updateInstall.stages.stoppingProcesses",
  downloading: "updateInstall.stages.downloading",
  installing: "updateInstall.stages.installing",
};

export interface AppUpdateInstallDialogProps {
  progress?: AppUpdateInstallProgressPayload;
}

/**
 * Non-dismissible update progress displayed over the main launcher view.
 *
 * Keeping this workflow in the main window avoids switching from the startup
 * splash to a second update window before the updater relaunches the app.
 */
export function AppUpdateInstallDialog({ progress }: AppUpdateInstallDialogProps) {
  const { t } = useTranslation();
  const progressValue = Math.min(Math.max(progress?.progress ?? 0, 0), 100);
  const stageMessage = progress
    ? t(UPDATE_STAGE_MESSAGE_KEYS[progress.stage])
    : "";

  return (
    <Dialog
      open={Boolean(progress)}
      title={t("updateInstall.title")}
      description={t("updateInstall.description")}
      tone="info"
      icon={Download}
      placement="center"
      widthClassName="max-w-lg"
      closeOnBackdrop={false}
      showCloseButton={false}
      actions={[]}
    >
      <Stack className="gap-4">
        <Inline className="items-center gap-3 rounded-lg border border-sky-400/20 bg-sky-400/[0.08] px-3 py-3">
          <RefreshCw size={16} className="shrink-0 animate-spin text-sky-300" />
          <Text className="text-sm font-medium text-sky-100">
            {stageMessage}
          </Text>
        </Inline>

        <ProgressBar
          progressValue={progressValue}
          showValue
          size="sm"
          tone="blue"
          animated={progressValue < 100}
        />

        <Text className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs leading-5 text-slate-400">
          {t("updateInstall.restartNotice")}
        </Text>
      </Stack>
    </Dialog>
  );
}
