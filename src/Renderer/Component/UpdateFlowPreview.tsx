import React from "react";
import { AlertTriangle, CheckCircle2, Download, RefreshCw } from "lucide-react";
import type { AppUpdateStatusPayload } from "../../Common/Types/IPC";
import { AppUpdatePanel } from "./AppUpdatePanel";
import { ProgressBar } from "./ProgressBar";
import { Box, Button, Inline, Stack, Text } from "./Primitives";
import { StatusBadge, StatusTone } from "./StatusBadge";

export type UpdateFlowPreviewMode = "manual" | "startup";
export type UpdateFlowPreviewResult = "success" | "failure" | "notAvailable";

interface UpdateFlowStep {
  label: string;
  status: AppUpdateStatusPayload;
  delayMs: number;
}

export interface UpdateFlowPreviewProps {
  title: string;
  description: string;
  mode: UpdateFlowPreviewMode;
  result: UpdateFlowPreviewResult;
}

const MANUAL_SUCCESS_STEPS: UpdateFlowStep[] = [
  step("Checking release feed", "checking", "Checking GitHub Releases for a newer launcher build.", 8, 650),
  step("Update found", "available", "BDIH Launcher 1.4.0 is available.", 0, 750, "1.4.0"),
  step("Downloading package", "downloading", "Downloading update package.", 24, 550, "1.4.0"),
  step("Verifying package", "downloading", "Verifying downloaded update package.", 72, 550, "1.4.0"),
  step("Ready to restart", "downloaded", "Update downloaded. Restart the launcher to apply it.", 100, 0, "1.4.0"),
];

const MANUAL_FAILURE_STEPS: UpdateFlowStep[] = [
  step("Checking release feed", "checking", "Checking GitHub Releases for a newer launcher build.", 8, 650),
  step("Update found", "available", "BDIH Launcher 1.4.0 is available.", 0, 650, "1.4.0"),
  step("Downloading package", "downloading", "Downloading update package.", 41, 700, "1.4.0"),
  step("Failure", "error", "Update failed.", 41, 0, "1.4.0", "The update package could not be verified after download."),
];

const MANUAL_NOT_AVAILABLE_STEPS: UpdateFlowStep[] = [
  step("Checking release feed", "checking", "Checking GitHub Releases for a newer launcher build.", 8, 650),
  step("Already current", "not-available", "You are already running the latest launcher version.", 100, 0, "1.3.2"),
];

const STARTUP_SUCCESS_STEPS: UpdateFlowStep[] = [
  step("Startup auto-check", "checking", "The launcher is checking for updates during startup.", 10, 650),
  step("Waiting for confirmation", "available", "A newer launcher build is available. Download now?", 0, 0, "1.4.0"),
];

const STARTUP_DOWNLOAD_SUCCESS_STEPS: UpdateFlowStep[] = [
  step("Downloading package", "downloading", "Downloading launcher update package.", 32, 550, "1.4.0"),
  step("Verifying package", "downloading", "Verifying update package.", 84, 550, "1.4.0"),
  step("Ready to restart", "downloaded", "Update downloaded. Restart to apply the new build.", 100, 0, "1.4.0"),
];

const STARTUP_DOWNLOAD_FAILURE_STEPS: UpdateFlowStep[] = [
  step("Downloading package", "downloading", "Downloading launcher update package.", 37, 550, "1.4.0"),
  step("Network failure", "error", "Update download failed.", 37, 0, "1.4.0", "Network connection was interrupted while downloading the update."),
];

const STARTUP_NOT_AVAILABLE_STEPS: UpdateFlowStep[] = [
  step("Startup auto-check", "checking", "The launcher is checking for updates during startup.", 10, 650),
  step("Already current", "not-available", "No update is available. Startup continues normally.", 100, 0, "1.3.2"),
];

/**
 * Interactive update flow preview surface.
 *
 * Use this in Storybook or temporary QA views when the full update experience
 * needs to be exercised without real network/update calls. The component keeps
 * layout size stable while state changes, so update affordances can be reviewed
 * without distracting layout jumps.
 */
export function UpdateFlowPreview({
  title,
  description,
  mode,
  result,
}: UpdateFlowPreviewProps) {
  const [autoUpdateEnabled, setAutoUpdateEnabled] = React.useState(true);
  const [status, setStatus] = React.useState<AppUpdateStatusPayload | undefined>();
  const [currentStepLabel, setCurrentStepLabel] = React.useState("Idle");
  const [runKey, setRunKey] = React.useState(0);
  const timerRef = React.useRef<number | undefined>();

  React.useEffect(() => () => window.clearTimeout(timerRef.current), []);

  React.useEffect(() => {
    if (mode === "startup") {
      start_startup_flow();
    }
  }, [mode, result, runKey]);

  function reset_demo() {
    window.clearTimeout(timerRef.current);
    setStatus(undefined);
    setCurrentStepLabel("Idle");
    setRunKey((currentKey) => currentKey + 1);
  }

  function run_steps(steps: UpdateFlowStep[]) {
    window.clearTimeout(timerRef.current);
    let index = 0;

    function next_step() {
      const nextStep = steps[index];

      if (!nextStep) {
        return;
      }

      setCurrentStepLabel(nextStep.label);
      setStatus(nextStep.status);
      index += 1;

      if (index < steps.length) {
        timerRef.current = window.setTimeout(next_step, nextStep.delayMs);
      }
    }

    next_step();
  }

  function start_manual_flow() {
    if (result === "failure") {
      run_steps(MANUAL_FAILURE_STEPS);
      return;
    }

    if (result === "notAvailable") {
      run_steps(MANUAL_NOT_AVAILABLE_STEPS);
      return;
    }

    run_steps(MANUAL_SUCCESS_STEPS);
  }

  function start_startup_flow() {
    if (result === "notAvailable") {
      run_steps(STARTUP_NOT_AVAILABLE_STEPS);
      return;
    }

    run_steps(STARTUP_SUCCESS_STEPS);
  }

  function start_startup_download() {
    run_steps(result === "failure" ? STARTUP_DOWNLOAD_FAILURE_STEPS : STARTUP_DOWNLOAD_SUCCESS_STEPS);
  }

  return (
    <Box className="w-[860px] max-w-[calc(100vw-32px)] bg-[#0b1020] p-8 text-slate-100">
      <Stack className="h-[680px] gap-5 overflow-hidden rounded-xl border border-white/10 bg-[#101827] p-5">
        <Inline className="h-[72px] shrink-0 items-start justify-between gap-3">
          <Stack className="min-w-0 gap-1">
            <Text className="truncate text-base font-semibold text-white">{title}</Text>
            <Text className="line-clamp-2 text-sm leading-5 text-slate-500">{description}</Text>
          </Stack>
          <StatusBadge label={mode === "startup" ? "Startup" : "Preferences"} tone={mode === "startup" ? "info" : "neutral"} />
        </Inline>

        <UpdateFlowTimeline status={status} currentStepLabel={currentStepLabel} />

        <Box className="min-h-0 flex-1 overflow-hidden rounded-xl border border-white/10 bg-[#050914] p-4">
          {mode === "manual" ? (
            <ManualUpdateStage
              autoUpdateEnabled={autoUpdateEnabled}
              status={status}
              onAutoUpdateChange={setAutoUpdateEnabled}
              onCheckForUpdates={start_manual_flow}
            />
          ) : (
            <StartupUpdateStage
              status={status}
              result={result}
              onDownload={start_startup_download}
              onReset={reset_demo}
            />
          )}
        </Box>

        <Inline className="h-10 shrink-0 justify-end gap-2">
          <Button type="button" variant="glass" onClick={reset_demo}>
            Reset demo
          </Button>
          {mode === "manual" ? (
            <Button type="button" onClick={start_manual_flow}>
              Play flow
            </Button>
          ) : null}
        </Inline>
      </Stack>
    </Box>
  );
}

function ManualUpdateStage({
  autoUpdateEnabled,
  status,
  onAutoUpdateChange,
  onCheckForUpdates,
}: {
  autoUpdateEnabled: boolean;
  status?: AppUpdateStatusPayload;
  onAutoUpdateChange: (enabled: boolean) => void;
  onCheckForUpdates: () => void;
}) {
  return (
    <Stack className="h-full gap-4">
      <Text className="shrink-0 text-xs uppercase tracking-[0.24em] text-slate-600">Preference panel surface</Text>
      <Box className="shrink-0">
        <AppUpdatePanel
          autoUpdateEnabled={autoUpdateEnabled}
          status={status}
          onAutoUpdateChange={onAutoUpdateChange}
          onCheckForUpdates={onCheckForUpdates}
        />
      </Box>
      <UpdateResultSlot status={status} />
    </Stack>
  );
}

function StartupUpdateStage({
  status,
  result,
  onDownload,
  onReset,
}: {
  status?: AppUpdateStatusPayload;
  result: UpdateFlowPreviewResult;
  onDownload: () => void;
  onReset: () => void;
}) {
  const statusKey = status?.status ?? "checking";
  const Icon = icon_from_status(status?.status);
  const progress = Math.round(status?.progress ?? 0);
  const isAvailable = status?.status === "available";
  const isWorking = status?.status === "checking" || status?.status === "downloading";

  return (
    <Stack className="h-full gap-4">
      <Text className="shrink-0 text-xs uppercase tracking-[0.24em] text-slate-600">Startup update surface</Text>
      <Box className="shrink-0 rounded-xl border border-white/10 bg-[#0b1020] p-4">
        <Inline className="items-start gap-3">
          <Box className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.04]">
            <Icon size={20} className={status?.status === "error" ? "text-red-300" : "accent-text"} />
          </Box>
          <Stack className="min-w-0 flex-1 gap-2">
            <Inline className="items-center justify-between gap-3">
              <Text className="truncate text-sm font-semibold text-slate-100">{startup_title(status)}</Text>
              <StatusBadge label={status_label(statusKey)} tone={tone_from_update_status(statusKey)} />
            </Inline>
            <Text className="min-h-[40px] text-xs leading-5 text-slate-500">
              {status?.message ?? "The launcher is checking for updates before opening the main window."}
            </Text>
            <Box className="h-9">
              {isWorking ? (
                <ProgressBar
                  progressValue={progress}
                  showValue
                  size="sm"
                  tone="blue"
                  animated
                  descriptionText={status?.status === "checking" ? "Checking release metadata" : "Downloading update package"}
                />
              ) : null}
            </Box>
          </Stack>
        </Inline>
      </Box>

      <Box className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-white/10 bg-white/[0.025] p-4">
        <UpdateResultSlot status={status} />
      </Box>

      <Inline className="h-10 shrink-0 justify-end gap-2">
        {isAvailable ? (
          <>
            <Button type="button" variant="glass" onClick={onReset}>
              Later
            </Button>
            <Button type="button" onClick={onDownload}>
              <Download size={14} />
              {result === "failure" ? "Download then fail" : "Download update"}
            </Button>
          </>
        ) : null}
      </Inline>
    </Stack>
  );
}

function UpdateResultSlot({ status }: { status?: AppUpdateStatusPayload }) {
  const isVisible = Boolean(status && status.status !== "checking");

  return (
    <Box className="min-h-[150px] rounded-xl border border-dashed border-white/10 bg-black/10 p-4">
      <Box className={`transition-all duration-300 ${isVisible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}>
        {status ? <UpdateResultCard status={status} /> : null}
      </Box>
      {!isVisible ? (
        <Stack className="h-[118px] items-center justify-center gap-2 text-center">
          <RefreshCw size={18} className="text-slate-600" />
          <Text className="text-xs text-slate-600">Result details will appear here without moving the rest of the view.</Text>
        </Stack>
      ) : null}
    </Box>
  );
}

function UpdateResultCard({ status }: { status: AppUpdateStatusPayload }) {
  const Icon = icon_from_status(status.status);
  const isSuccess = status.status === "downloaded" || status.status === "not-available";
  const isError = status.status === "error";
  const toneClass = isError
    ? "border-red-400/20 bg-red-500/10 text-red-100"
    : isSuccess
      ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
      : "border-amber-400/20 bg-amber-400/10 text-amber-100";

  return (
    <Inline className={`items-start gap-3 rounded-xl border p-4 ${toneClass}`}>
      <Icon size={18} className="mt-0.5 shrink-0" />
      <Stack className="min-w-0 gap-1">
        <Text className="text-sm font-semibold">{result_title(status)}</Text>
        <Text className="text-xs leading-5 opacity-80">{status.message}</Text>
        {status.version ? <Text className="text-xs opacity-70">Version {status.version}</Text> : null}
        {status.error ? <Text className="break-all text-xs text-red-100">{status.error}</Text> : null}
      </Stack>
    </Inline>
  );
}

function UpdateFlowTimeline({ status, currentStepLabel }: { status?: AppUpdateStatusPayload; currentStepLabel: string }) {
  const statusKey = status?.status ?? "disabled";

  return (
    <Inline className="h-[58px] shrink-0 items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
      <Stack className="min-w-0 gap-0.5">
        <Text className="text-xs font-semibold text-slate-400">Current demo step</Text>
        <Text className="truncate text-sm text-slate-100">{currentStepLabel}</Text>
      </Stack>
      <StatusBadge label={status_label(statusKey)} tone={tone_from_update_status(statusKey)} />
    </Inline>
  );
}

function step(
  label: string,
  status: AppUpdateStatusPayload["status"],
  message: string,
  progress: number,
  delayMs: number,
  version?: string,
  error?: string,
): UpdateFlowStep {
  return {
    label,
    delayMs,
    status: {
      status,
      message,
      progress,
      version,
      error,
    },
  };
}

function startup_title(status?: AppUpdateStatusPayload): string {
  if (status?.status === "available") {
    return "Launcher update available";
  }

  if (status?.status === "downloading") {
    return "Downloading launcher update";
  }

  if (status?.status === "downloaded") {
    return "Update ready to apply";
  }

  if (status?.status === "not-available") {
    return "Launcher is up to date";
  }

  if (status?.status === "error") {
    return "Update check failed";
  }

  return "Checking for launcher updates";
}

function result_title(status: AppUpdateStatusPayload): string {
  if (status.status === "available") {
    return "Update is available";
  }

  if (status.status === "downloaded") {
    return "Update downloaded";
  }

  if (status.status === "not-available") {
    return "Already up to date";
  }

  if (status.status === "error") {
    return "Update failed";
  }

  if (status.status === "downloading") {
    return "Update is downloading";
  }

  return "Update check";
}

function icon_from_status(status?: AppUpdateStatusPayload["status"]) {
  if (status === "error") {
    return AlertTriangle;
  }

  if (status === "downloaded" || status === "not-available") {
    return CheckCircle2;
  }

  if (status === "available" || status === "downloading") {
    return Download;
  }

  return RefreshCw;
}

function tone_from_update_status(status: AppUpdateStatusPayload["status"]): StatusTone {
  if (status === "error") {
    return "danger";
  }

  if (status === "available") {
    return "warning";
  }

  if (status === "downloaded" || status === "not-available") {
    return "success";
  }

  if (status === "checking" || status === "downloading") {
    return "info";
  }

  return "neutral";
}

function status_label(status: AppUpdateStatusPayload["status"]): string {
  const labels: Record<AppUpdateStatusPayload["status"], string> = {
    disabled: "Idle",
    checking: "Checking",
    available: "Update available",
    "not-available": "Latest",
    downloading: "Downloading",
    downloaded: "Downloaded",
    error: "Error",
  };

  return labels[status];
}
