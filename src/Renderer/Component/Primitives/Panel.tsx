import React from "react";
import { join_classes } from "../../../Common/Util/ClassName";
import { Box } from "./Layout";

/** Surface spacing presets. */
export type SurfacePadding = "sm" | "md" | "lg";

/** Surface visual treatments. */
export type SurfaceTone = "default" | "deep" | "subtle";

/**
 * Generic bordered container primitive.
 *
 * Use `Surface` for panels, cards, and grouped content blocks. It owns only the
 * shared background, border, radius, and padding treatment; feature-specific
 * headings and actions should be composed by the caller.
 */
export function Surface({
  padding = "md",
  tone = "default",
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  padding?: SurfacePadding;
  tone?: SurfaceTone;
}) {
  const paddingClass = {
    sm: "p-3",
    md: "p-4",
    lg: "p-5",
  }[padding];
  const toneClass = {
    default: "border border-white/10 bg-white/[0.04]",
    deep: "border border-white/10 bg-[#0b1020]",
    subtle: "border border-white/10 bg-white/[0.03]",
  }[tone];

  return (
    <Box className={join_classes("rounded-lg", toneClass, paddingClass, className)} {...props}>
      {children}
    </Box>
  );
}

/**
 * Compact message primitive for low-emphasis status text.
 *
 * Use this for inline form feedback, transient status messages, and small helper
 * summaries. Higher severity alerts should be implemented as a separate
 * component-level pattern.
 */
export function StatusMessage({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={join_classes("rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs leading-5 text-slate-500", className)}
      {...props}
    >
      {children}
    </p>
  );
}

/** Backward-compatible alias for `Surface`. */
export function Panel(props: React.ComponentProps<typeof Surface>) {
  return <Surface {...props} />;
}
