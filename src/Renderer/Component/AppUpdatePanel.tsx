import React from "react";
import { AlertTriangle, CheckCircle2, Download, RefreshCw, RotateCw, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppUpdateStatusPayload } from "../../Common/Types/IPC";
import { Dialog } from "./Dialog";
import { ProgressBar } from "./ProgressBar";
import { Box, Button, Checkbox, IconSlot, Inline, InlineText, Stack, Text } from "./Primitives";
import { StatusBadge, StatusTone } from "./StatusBadge";

/**
 * Props for the app update preference panel.
 *
 * The parent owns update checks and auto-update persistence; this component only
 * renders current status and exposes user intent through callbacks.
 */
export interface AppUpdatePanelProps {
  autoUpdateEnabled: boolean;
  status?: AppUpdateStatusPayload;
  onAutoUpdateChange?: (enabled: boolean) => void;
  onCheckForUpdates?: () => void;
}

const STATUS_TONE_MAP: Record<AppUpdateStatusPayload["status"], StatusTone> = {
  idle: "neutral",
  disabled: "neutral",
  checking: "info",
  available: "warning",
  "not-available": "success",
  downloading: "info",
  downloaded: "success",
  error: "danger",
};

function icon_from_status(status?: AppUpdateStatusPayload["status"]) {
  if (status === "error") {
    return AlertTriangle;
  }

  if (status === "available" || status === "downloading" || status === "downloaded") {
    return Download;
  }

  if (status === "not-available") {
    return CheckCircle2;
  }

  return ShieldCheck;
}

function dialog_tone_from_status(status?: AppUpdateStatusPayload["status"]) {
  if (status === "error") {
    return "danger";
  }

  if (status === "available" || status === "downloading") {
    return "warning";
  }

  return "info";
}

/**
 * App update status and manual check panel.
 *
 * Use it inside preferences when users need to enable startup checks, trigger a
 * manual check, and read the result in a modal without leaving the settings UI.
 */
export function AppUpdatePanel({
  autoUpdateEnabled,
  status,
  onAutoUpdateChange,
  onCheckForUpdates,
}: AppUpdatePanelProps) {
  const { t } = useTranslation();
  const [isResultDialogOpen, setIsResultDialogOpen] = React.useState(false);
  const [dialogStatus, setDialogStatus] = React.useState<AppUpdateStatusPayload | undefined>();
  const statusKey = status?.status ?? "idle";
  const dialogStatusKey = dialogStatus?.status ?? "checking";
  const Icon = icon_from_status(status?.status);
  const DialogIcon = icon_from_status(dialogStatus?.status);
  const isChecking = status?.status === "checking";
  const isDownloading = status?.status === "downloading";
  const isDialogWorking = dialogStatus?.status === "checking" || dialogStatus?.status === "downloading";
  const progress = Math.round(status?.progress ?? 0);
  const dialogProgress = Math.round(dialogStatus?.progress ?? 0);

  React.useEffect(() => {
    if (!isResultDialogOpen || !status) {
      return;
    }

    setDialogStatus(status);
  }, [isResultDialogOpen, status]);

  function handle_check_for_updates() {
    setDialogStatus({
      status: "checking",
      message: t("preferences.appUpdate.dialog.checking.description"),
    });
    setIsResultDialogOpen(true);
    onCheckForUpdates?.();
  }

  return (
    <>
      <Box className="rounded-lg border border-white/10 bg-[#0b1020] p-4">
        <Stack className="gap-4 md:flex-row md:items-start md:justify-between">
          <Inline className="min-w-0 gap-3">
            <IconSlot className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-white/10 bg-white/[0.04]">
              <Icon size={19} className={status?.status === "error" ? "text-red-300" : "accent-text"} />
            </IconSlot>
            <Stack className="min-w-0 gap-1">
              <Inline className="flex-wrap items-center gap-2">
                <Text className="text-sm font-semibold text-slate-100">{t("preferences.appUpdate.title")}</Text>
                <StatusBadge label={t(`preferences.appUpdate.status.${statusKey}`)} tone={STATUS_TONE_MAP[statusKey]} />
              </Inline>
              <Text className="text-xs leading-5 text-slate-500">
                {status?.message ?? t("preferences.appUpdate.description")}
              </Text>
              {status?.version ? (
                <Text className="text-xs text-slate-400">{t("preferences.appUpdate.version", { version: status.version })}</Text>
              ) : null}
              {status?.error ? <Text className="text-xs text-red-300">{status.error}</Text> : null}
            </Stack>
          </Inline>

          <Inline className="shrink-0 items-center gap-2">
            <Checkbox
              checked={autoUpdateEnabled}
              onCheckedChange={(checked) => onAutoUpdateChange?.(checked)}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 text-xs font-semibold text-slate-200"
              label={t("preferences.appUpdate.autoCheck")}
            />
            <Button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-md border border-white/10 px-3 text-xs font-semibold text-slate-200 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isChecking || isDownloading}
              onClick={handle_check_for_updates}
            >
              <RefreshCw size={14} className={isChecking ? "animate-spin" : ""} />
              {t("preferences.appUpdate.check")}
            </Button>
          </Inline>
        </Stack>

        {isDownloading ? (
          <ProgressBar
            className="mt-4"
            progressValue={progress}
            showValue
            size="sm"
            tone="blue"
            descriptionText={t("preferences.appUpdate.downloading")}
          />
        ) : null}

        {status?.status === "downloaded" ? (
          <Inline className="mt-4 inline-flex items-center gap-2 rounded-md border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-200">
            <RotateCw size={14} />
            <InlineText>{t("preferences.appUpdate.restartHint")}</InlineText>
          </Inline>
        ) : null}
      </Box>

      <Dialog
        open={isResultDialogOpen}
        title={t(`preferences.appUpdate.dialog.${dialogStatusKey}.title`)}
        description={t(`preferences.appUpdate.dialog.${dialogStatusKey}.description`)}
        tone={dialog_tone_from_status(dialogStatus?.status)}
        icon={isDialogWorking ? undefined : DialogIcon}
        placement="center"
        widthClassName="max-w-lg"
        onClose={() => setIsResultDialogOpen(false)}
        actions={[
          {
            label: t("common.actions.close"),
            variant: "secondary",
            onClick: () => setIsResultDialogOpen(false),
          },
        ]}
      >
        <Stack className="gap-3">
          <Inline className="items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
            <Inline className="items-center gap-2">
              {isDialogWorking ? <RefreshCw size={14} className="animate-spin text-sky-300" /> : null}
              <InlineText className="text-xs font-semibold text-slate-400">
                {t("preferences.appUpdate.title")}
              </InlineText>
            </Inline>
            <StatusBadge label={t(`preferences.appUpdate.status.${dialogStatusKey}`)} tone={STATUS_TONE_MAP[dialogStatusKey]} />
          </Inline>

          {dialogStatus?.version ? (
            <Text className="rounded-lg border border-white/10 bg-[#050914] px-3 py-2 text-xs text-slate-300">
              {t("preferences.appUpdate.version", { version: dialogStatus.version })}
            </Text>
          ) : null}

          {dialogStatus?.error ? (
            <Text className="rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-200">
              {dialogStatus.error}
            </Text>
          ) : null}

          {dialogStatus?.status === "downloading" ? (
            <ProgressBar
              progressValue={dialogProgress}
              showValue
              size="sm"
              tone="blue"
              descriptionText={t("preferences.appUpdate.downloading")}
            />
          ) : null}

          {dialogStatus?.status === "downloaded" ? (
            <Text className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs font-semibold leading-5 text-emerald-200">
              {t("preferences.appUpdate.restartHint")}
            </Text>
          ) : null}
        </Stack>
      </Dialog>
    </>
  );
}
