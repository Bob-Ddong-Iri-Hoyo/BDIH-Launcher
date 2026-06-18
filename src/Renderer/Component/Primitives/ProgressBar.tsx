import React from "react";
import { join_classes } from "../../../Common/Util/ClassName";

/** Visual size presets for the primitive progress track. */
export type ProgressBarSize = "xs" | "sm" | "md";

/** Fill color intent for the primitive progress bar. */
export type ProgressBarTone = "emerald" | "sky" | "amber" | "rose" | "slate";

/**
 * Props for the primitive progress bar.
 *
 * This primitive renders only the visual track and fill. Labels, percentages,
 * helper text, or status copy should be composed by callers with `Text` or a
 * component-level wrapper.
 */
export interface ProgressBarProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  min?: number;
  max?: number;
  size?: ProgressBarSize;
  tone?: ProgressBarTone;
  animated?: boolean;
}

/**
 * Low-level progress indicator.
 *
 * Use `ProgressBar` when a component needs a visual progress track without any
 * built-in text. It exposes `role="progressbar"` and aria value attributes for
 * accessibility while leaving all surrounding copy to the caller.
 */
export function ProgressBar({
  value,
  min = 0,
  max = 100,
  size = "sm",
  tone = "emerald",
  animated = false,
  className,
  ...props
}: ProgressBarProps) {
  const normalizedValue = normalize_progress_value(value, min, max);
  const percent = max === min ? 0 : ((normalizedValue - min) / (max - min)) * 100;

  return (
    <div
      role="progressbar"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={normalizedValue}
      className={join_classes("overflow-hidden rounded-full bg-white/10", progress_size_class(size), className)}
      {...props}
    >
      <div
        className={join_classes("h-full rounded-full transition-[width] duration-300 ease-out", progress_tone_class(tone), animated && "progress-wave")}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

function normalize_progress_value(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, Math.min(max, value));
}

function progress_size_class(size: ProgressBarSize): string {
  return {
    xs: "h-1",
    sm: "h-2",
    md: "h-3",
  }[size];
}

function progress_tone_class(tone: ProgressBarTone): string {
  return {
    emerald: "bg-emerald-400",
    sky: "bg-sky-400",
    amber: "bg-amber-400",
    rose: "bg-rose-400",
    slate: "bg-slate-400",
  }[tone];
}
