import React from "react";
import { AlertTriangle, Check, CheckCircle2, Copy, Download, RefreshCw, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppUpdateStatusPayload } from "../../Common/Types/IPC";
import dialogCheckUpdateImage from "../../../resouces/app/images/update/dialog-check-update.png";
import dialogLatestReleaseImage from "../../../resouces/app/images/update/dialog-latest-release.png";
import dialogUpdateFailedImage from "../../../resouces/app/images/update/dialog-update-failed.png";
import dialogUpdateProgressImage from "../../../resouces/app/images/update/dialog-update-progress.png";
import errorResultImage from "../../../resouces/app/images/update/error-result.png";
import latestReleaseImage from "../../../resouces/app/images/update/latest-release.png";
import updateAvailableImage from "../../../resouces/app/images/update/update-available.png";
import { classify_app_update_failure } from "../Logic/AppUpdateError";
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
  onCheckForUpdates?: () => boolean | void | Promise<boolean | void>;
  onInstallUpdate?: () => void;
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

const STATUS_ICON_SLOT_CLASS_MAP: Record<StatusTone, string> = {
  neutral: "border-white/10 bg-white/[0.05]",
  info: "border-sky-400/25 bg-sky-400/10",
  success: "border-emerald-400/25 bg-emerald-400/10",
  warning: "border-amber-400/25 bg-amber-400/10",
  danger: "border-red-400/25 bg-red-400/10",
};

function panel_artwork_from_status(status?: AppUpdateStatusPayload["status"]): string {
  if (status === "available" || status === "downloading" || status === "downloaded") {
    return updateAvailableImage;
  }

  if (status === "error") {
    return errorResultImage;
  }

  return latestReleaseImage;
}

function dialog_artwork_from_status(status?: AppUpdateStatusPayload["status"]): string | undefined {
  if (status === "checking") {
    return dialogCheckUpdateImage;
  }

  if (status === "not-available") {
    return dialogLatestReleaseImage;
  }

  if (status === "available") {
    return updateAvailableImage;
  }

  if (status === "downloading" || status === "downloaded") {
    return dialogUpdateProgressImage;
  }

  if (status === "error") {
    return dialogUpdateFailedImage;
  }

  return undefined;
}

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

interface AppUpdateErrorDetailsProps {
  error: string;
}

async function copy_text_to_clipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Electron file pages may expose the Clipboard API but reject writes.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  let copied = false;

  try {
    textarea.select();
    copied = document.execCommand("copy");
  } finally {
    textarea.remove();
  }

  if (!copied) {
    throw new Error("Failed to copy update error details.");
  }
}

function AppUpdateErrorDetails({ error }: AppUpdateErrorDetailsProps) {
  const { t } = useTranslation();
  const failure = classify_app_update_failure(error);
  const reasonKey = `preferences.appUpdate.dialog.error.reasons.${failure.reason}`;
  const description = t(`${reasonKey}.description`);
  const normalizedDetails = failure.details.replace(/^Error:\s*/i, "").trim();
  const shouldShowTechnicalDetails = !failure.code
    || normalizedDetails.toLowerCase() !== failure.code.toLowerCase();
  const copyContent = [
    description,
    failure.code
      ? `${t("preferences.appUpdate.dialog.error.errorCode")}: ${failure.code}`
      : undefined,
    shouldShowTechnicalDetails
      ? `${t("preferences.appUpdate.dialog.error.technicalDetails")}:\n${failure.details}`
      : undefined,
  ].filter((line): line is string => Boolean(line)).join("\n");
  const [copied, setCopied] = React.useState(false);
  const resetCopyFeedbackTimer = React.useRef<number>();

  React.useEffect(() => () => {
    if (resetCopyFeedbackTimer.current !== undefined) {
      window.clearTimeout(resetCopyFeedbackTimer.current);
    }
  }, []);

  async function copy_error_details() {
    try {
      await copy_text_to_clipboard(copyContent);
      setCopied(true);

      if (resetCopyFeedbackTimer.current !== undefined) {
        window.clearTimeout(resetCopyFeedbackTimer.current);
      }

      resetCopyFeedbackTimer.current = window.setTimeout(() => {
        setCopied(false);
        resetCopyFeedbackTimer.current = undefined;
      }, 1_800);
    } catch {
      setCopied(false);
    }
  }

  const CopyIcon = copied ? Check : Copy;
  const copyLabel = t(copied ? "common.actions.copied" : "common.actions.copy");

  return (
    <Stack className="gap-2">
      <Text className="text-sm font-semibold leading-5 text-red-100">
        {t(`${reasonKey}.title`)}
      </Text>
      <Box className="rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-3">
        <Box className="flex items-start justify-between gap-3">
          <Text className="min-w-0 text-xs leading-5 text-red-100/80">
            {description}
          </Text>
          <Button
            type="button"
            className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2 text-[11px] font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white"
            aria-label={copyLabel}
            title={copyLabel}
            onClick={() => void copy_error_details()}
          >
            <CopyIcon size={12} />
            {copyLabel}
          </Button>
        </Box>

        {failure.code ? (
          <Inline className="mt-2.5 min-w-0 flex-wrap items-baseline gap-2 border-t border-white/10 pt-2.5">
            <InlineText className="text-[11px] font-medium text-slate-400">
              {t("preferences.appUpdate.dialog.error.errorCode")}:
            </InlineText>
            <Text as="code" className="min-w-0 select-text break-all font-mono text-[11px] text-red-200">
              {failure.code}
            </Text>
          </Inline>
        ) : null}

        {shouldShowTechnicalDetails ? (
          <Stack className="mt-2 gap-1 border-t border-white/10 pt-2">
            <Text className="text-[11px] font-medium text-slate-400">
              {t("preferences.appUpdate.dialog.error.technicalDetails")}
            </Text>
            <Text className="max-h-32 select-text overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-5 text-slate-400">
              {failure.details}
            </Text>
          </Stack>
        ) : null}
      </Box>
    </Stack>
  );
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
  onInstallUpdate,
}: AppUpdatePanelProps) {
  const { t } = useTranslation();
  const [isResultDialogOpen, setIsResultDialogOpen] = React.useState(false);
  const [dialogStatus, setDialogStatus] = React.useState<AppUpdateStatusPayload | undefined>();
  const [isRequestingCheck, setIsRequestingCheck] = React.useState(false);
  const [isRequestingInstall, setIsRequestingInstall] = React.useState(false);
  const statusKey = status?.status ?? "idle";
  const dialogStatusKey = dialogStatus?.status ?? "checking";
  const Icon = icon_from_status(status?.status);
  const DialogIcon = icon_from_status(dialogStatus?.status);
  const isChecking = status?.status === "checking";
  const isDownloading = status?.status === "downloading";
  const isDialogWorking = dialogStatus?.status === "checking" || dialogStatus?.status === "downloading";
  const progress = Math.round(status?.progress ?? 0);
  const dialogProgress = Math.round(dialogStatus?.progress ?? 0);
  const statusDescription = status && status.status !== "idle"
    ? t(`preferences.appUpdate.dialog.${status.status}.description`)
    : t("preferences.appUpdate.description");
  const statusArtwork = panel_artwork_from_status(status?.status);
  const dialogArtwork = dialog_artwork_from_status(dialogStatus?.status);

  React.useEffect(() => {
    if (!isResultDialogOpen || !status) {
      return;
    }

    setDialogStatus(status);
  }, [isResultDialogOpen, status]);

  React.useEffect(() => {
    if (status?.status !== "available") {
      setIsRequestingInstall(false);
    }
  }, [status?.status]);

  async function handle_check_for_updates() {
    if (isRequestingCheck) return;

    if (status?.status === "available") {
      setDialogStatus(status);
      setIsResultDialogOpen(true);
      return;
    }

    setIsRequestingCheck(true);
    setDialogStatus({
      status: "checking",
      message: t("preferences.appUpdate.dialog.checking.description"),
    });
    setIsResultDialogOpen(true);
    let shouldProceed: boolean | void;

    try {
      shouldProceed = await onCheckForUpdates?.();
    } finally {
      setIsRequestingCheck(false);
    }

    if (shouldProceed === false) {
      setIsResultDialogOpen(false);
      return;
    }
  }

  function handle_install_update() {
    if (isRequestingInstall || !onInstallUpdate) {
      return;
    }

    setIsRequestingInstall(true);
    setIsResultDialogOpen(false);
    onInstallUpdate();
  }

  return (
    <>
      <Box className="rounded-lg border border-white/10 bg-[#0b1020] p-4">
        <Stack className="gap-4 sm:flex-row sm:items-start">
          {statusArtwork ? (
            <Box className={`h-20 w-20 shrink-0 self-start overflow-hidden rounded-xl border shadow-[0_14px_36px_rgba(0,0,0,0.22)] ${STATUS_ICON_SLOT_CLASS_MAP[STATUS_TONE_MAP[statusKey]]}`}>
              <img src={statusArtwork} alt="" aria-hidden="true" className="h-full w-full object-cover" />
            </Box>
          ) : null}
          <Stack className="min-w-0 flex-1 gap-4 md:flex-row md:items-start md:justify-between">
          <Inline className="min-w-0 gap-3">
              {!statusArtwork ? (
                <IconSlot className={`grid h-10 w-10 shrink-0 place-items-center rounded-md border ${STATUS_ICON_SLOT_CLASS_MAP[STATUS_TONE_MAP[statusKey]]}`}>
                <Icon size={19} className={status?.status === "error" ? "text-red-300" : "accent-text"} />
                </IconSlot>
              ) : null}
            <Stack className="min-w-0 gap-1">
              <Inline className="flex-wrap items-center gap-2">
                <Text className="text-sm font-semibold text-slate-100">{t("preferences.appUpdate.title")}</Text>
                <StatusBadge label={t(`preferences.appUpdate.status.${statusKey}`)} tone={STATUS_TONE_MAP[statusKey]} />
              </Inline>
              <Text className="text-xs leading-5 text-slate-500">
                {statusDescription}
              </Text>
              {status?.version ? (
                <Text className="text-xs text-slate-400">{t("preferences.appUpdate.version", { version: status.version })}</Text>
              ) : null}
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
              disabled={isChecking || isDownloading || isRequestingCheck}
              onClick={() => void handle_check_for_updates()}
            >
              <RefreshCw size={14} className={isChecking || isRequestingCheck ? "animate-spin" : ""} />
              {t("preferences.appUpdate.check")}
            </Button>
          </Inline>
          </Stack>
        </Stack>

        {status?.error ? (
          <Box className="mt-4">
            <AppUpdateErrorDetails error={status.error} />
          </Box>
        ) : null}

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
      </Box>

      <Dialog
        open={isResultDialogOpen}
        title={t(`preferences.appUpdate.dialog.${dialogStatusKey}.title`)}
        description={t(`preferences.appUpdate.dialog.${dialogStatusKey}.description`)}
        tone={dialog_tone_from_status(dialogStatus?.status)}
        icon={isDialogWorking ? undefined : DialogIcon}
        iconImageSrc={dialogArtwork}
        iconImageSize="large"
        placement="center"
        widthClassName="max-w-lg"
        onClose={() => setIsResultDialogOpen(false)}
        actions={dialogStatus?.status === "available" && onInstallUpdate
          ? [
            {
              label: t("preferences.appUpdate.actions.later"),
              variant: "secondary",
              autoFocus: true,
              disabled: isRequestingInstall,
              onClick: () => setIsResultDialogOpen(false),
            },
            {
              label: t("preferences.appUpdate.actions.updateNow"),
              icon: Download,
              variant: "primary",
              disabled: isRequestingInstall,
              onClick: handle_install_update,
            },
          ]
          : [{
            label: t("common.actions.close"),
            variant: "secondary",
            onClick: () => setIsResultDialogOpen(false),
          }]}
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

          {dialogStatus?.error ? <AppUpdateErrorDetails error={dialogStatus.error} /> : null}

          {dialogStatus?.status === "downloading" ? (
            <ProgressBar
              progressValue={dialogProgress}
              showValue
              size="sm"
              tone="blue"
              descriptionText={t("preferences.appUpdate.downloading")}
            />
          ) : null}
        </Stack>
      </Dialog>
    </>
  );
}
