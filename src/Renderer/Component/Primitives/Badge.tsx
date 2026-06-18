import React from "react";

export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger" | "unstyled";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

const BASE_BADGE_CLASS = "inline-flex shrink-0 items-center justify-center rounded-md border px-2 py-1 text-[11px] font-semibold leading-none";

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "border-white/10 bg-white/[0.05] text-slate-300",
  info: "border-sky-300/30 bg-sky-400/10 text-sky-100",
  success: "border-emerald-300/40 bg-emerald-400/20 text-emerald-50",
  warning: "border-amber-300/30 bg-amber-400/10 text-amber-100",
  danger: "border-rose-300/30 bg-rose-400/10 text-rose-100",
  unstyled: "",
};

/**
 * Primitive badge/pill.
 *
 * Use the tone presets for normal status pills. If a Component passes custom
 * sizing via `className` without a tone, Badge becomes unstyled so compact
 * logger counters and toolbar pills do not jump in width or height.
 */
export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ tone, className = "", children, ...props }, ref) => {
    const hasCustomClassName = className.trim().length > 0;
    const resolvedTone = tone ?? (hasCustomClassName ? "unstyled" : "neutral");
    const shouldUseBaseClass = resolvedTone !== "unstyled";

    return (
      <span
        ref={ref}
        className={[shouldUseBaseClass ? BASE_BADGE_CLASS : "", TONE_CLASSES[resolvedTone], className]
          .filter(Boolean)
          .join(" ")}
        {...props}
      >
        {children}
      </span>
    );
  },
);

Badge.displayName = "Badge";
