import React from "react";
import { ProtoComponentProps } from "../Common/ProtoProps";
import { Inline, ProgressBar as PrimitiveProgressBar, Stack, Text } from "./Primitives";

/**
 * Compatibility props for the higher-level progress bar wrapper.
 *
 * Use this wrapper when existing Components expect `progressValue`, visible
 * percentages, or description text on top of the primitive progress track.
 */
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

const TONE_MAP = {
  blue: "sky",
  emerald: "emerald",
  amber: "amber",
  rose: "rose",
} as const;

/**
 * Progress indicator with optional label and percentage text.
 *
 * Use this for task progress where users need both a visual track and readable
 * context. Use the primitive ProgressBar directly when only the track is needed.
 */
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
  className = "",
}: ProgressBarProps) {
  const minValue = Number(progressMinValue ?? pregressMinValue ?? 0);
  const maxValue = Number(progressMaxValue ?? progressMaxMaxValue ?? 100);
  const value = Number(progressValue);
  const safeMaxValue = maxValue <= minValue ? minValue + 1 : maxValue;
  const clampedValue = Math.min(Math.max(value, minValue), safeMaxValue);
  const percentage = ((clampedValue - minValue) / (safeMaxValue - minValue)) * 100;

  return (
    <Stack gap="sm" className={`w-full ${className}`}>
      {(descriptionText || showValue) ? (
        <Inline justify="between" gap="md" className="text-xs text-slate-400">
          <Text tone="muted" size="xs" truncate>{descriptionText}</Text>
          {showValue ? <Text tone="body" size="xs" className="shrink-0 font-mono">{Math.round(percentage)}%</Text> : null}
        </Inline>
      ) : null}
      <PrimitiveProgressBar
        value={clampedValue}
        min={minValue}
        max={safeMaxValue}
        size={size === "sm" ? "sm" : "md"}
        tone={TONE_MAP[tone]}
        animated={animated}
      />
    </Stack>
  );
}
