import React from "react";
import { ProtoComponentProps } from "../Common/ProtoProps";

export interface ProgressBarProps extends ProtoComponentProps {
  progressValue: number | string;
  progressMinValue?: number | string;
  pregressMinValue?: number | string;
  progressMaxValue?: number | string;
  progressMaxMaxValue?: number | string;
  descriptionText?: string;
  showValue?: boolean;
  size?: "sm" | "md";
  tone?: "blue" | "emerald" | "amber" | "rose";
  animated?: boolean;
  className?: string;
}

const FILL_CLASS_MAP = {
  blue: "bg-sky-400",
  emerald: "bg-emerald-400",
  amber: "bg-amber-400",
  rose: "bg-rose-400",
};

export function ProgressBar({
  progressValue,
  progressMinValue,
  pregressMinValue,
  progressMaxValue,
  progressMaxMaxValue,
  descriptionText,
  showValue = false,
  size = "md",
  tone = "blue",
  animated = false,
  bgColor,
  className = "",
}: ProgressBarProps) {
  const minValue = Number(progressMinValue ?? pregressMinValue ?? 0);
  const maxValue = Number(progressMaxValue ?? progressMaxMaxValue ?? 100);
  const value = Number(progressValue);
  const safeMaxValue = maxValue <= minValue ? minValue + 1 : maxValue;
  const clampedValue = Math.min(Math.max(value, minValue), safeMaxValue);
  const percentage = ((clampedValue - minValue) / (safeMaxValue - minValue)) * 100;
  const heightClass = size === "sm" ? "h-1.5" : "h-2.5";
  const backgroundStyle =
    typeof bgColor === "string"
      ? { backgroundColor: bgColor }
      : Array.isArray(bgColor)
        ? { backgroundColor: `rgb(${bgColor.join(",")})` }
        : undefined;

  return (
    <div className={`w-full ${className}`}>
      {(descriptionText || showValue) && (
        <div className="mb-2 flex items-center justify-between gap-3 text-xs text-slate-400">
          <span className="min-w-0 truncate">{descriptionText}</span>
          {showValue && <span className="shrink-0 font-mono text-slate-300">{Math.round(percentage)}%</span>}
        </div>
      )}
      <div
        className={`w-full overflow-hidden rounded-full bg-white/10 ${heightClass}`}
        style={backgroundStyle}
        role="progressbar"
        aria-valuemin={minValue}
        aria-valuemax={safeMaxValue}
        aria-valuenow={clampedValue}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${animated ? "progress-wave" : ""} ${FILL_CLASS_MAP[tone]}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
