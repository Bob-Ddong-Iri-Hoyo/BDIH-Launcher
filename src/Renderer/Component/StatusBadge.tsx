import { InstallStatus } from "../../Common/Types/Wine";
import i18n from "../I18n/I18n";
import { Badge } from "./Primitives";

/** Shared status color vocabulary for Component-level badges. */
export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

/** Props for a labeled status badge with optional animated emphasis. */
export interface StatusBadgeProps {
  label: string;
  tone?: StatusTone;
  animated?: boolean;
  className?: string;
}

const TONE_CLASS_MAP: Record<StatusTone, string> = {
  neutral: "border-white/10 bg-white/5 text-slate-300",
  info: "border-sky-400/25 bg-sky-400/10 text-sky-200",
  success: "border-emerald-300/40 bg-emerald-400/20 text-emerald-50 shadow-[0_0_18px_rgba(52,211,153,0.18)]",
  warning: "border-amber-400/25 bg-amber-400/10 text-amber-200",
  danger: "border-red-400/25 bg-red-400/10 text-red-200",
};

/** Maps runtime install status values to visual badge tones. */
export function tone_from_status(status: InstallStatus): StatusTone {
  if (status === "installed" || status === "completed") {
    return "success";
  }

  if (status === "downloading" || status === "installing" || status === "extracting") {
    return "info";
  }

  if (status === "error") {
    return "danger";
  }

  if (status === "available") {
    return "warning";
  }

  return "neutral";
}

type Translate = (key: string) => string;

/** Returns the localized label for a runtime install status. */
export function label_from_status(status: InstallStatus, translate: Translate = i18n.t.bind(i18n)): string {
  const keyMap: Record<InstallStatus, string> = {
    idle: "status.idle",
    available: "status.available",
    downloading: "status.downloading",
    installing: "status.installing",
    extracting: "status.extracting",
    installed: "status.installed",
    completed: "status.completed",
    error: "status.error",
  };

  return translate(keyMap[status]);
}

/**
 * Shared status pill used across runtime, bottle, and app surfaces.
 *
 * Use this when a state needs a short localized label and consistent color tone.
 * Set `animated` only for active work, not completed ready states.
 */
export function StatusBadge({ label, tone = "neutral", animated = false, className = "" }: StatusBadgeProps) {
  return (
    <Badge className={`h-6 shrink-0 rounded-md border text-xs font-medium ${animated ? "badge-ripple" : ""} ${TONE_CLASS_MAP[tone]} ${className}`}>
      {label}
    </Badge>
  );
}
