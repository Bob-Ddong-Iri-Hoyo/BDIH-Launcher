import React from "react";
import type { LucideIcon } from "lucide-react";

export interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  icon: LucideIcon;
  label: string;
  size?: "sm" | "md";
}

const SIZE_CLASS_MAP: Record<NonNullable<IconButtonProps["size"]>, string> = {
  sm: "h-9 w-9",
  md: "h-10 w-10",
};

export function IconButton({
  icon: Icon,
  label,
  size = "md",
  className = "",
  type = "button",
  title,
  ...buttonProps
}: IconButtonProps) {
  return (
    <button
      {...buttonProps}
      type={type}
      aria-label={label}
      title={title ?? label}
      className={`inline-flex ${SIZE_CLASS_MAP[size]} items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-300 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      <Icon size={size === "sm" ? 17 : 19} />
    </button>
  );
}
