import React from "react";
import type { LucideIcon } from "lucide-react";
import { Button } from "./Primitives";

/**
 * Props for compact icon-only or icon-forward buttons.
 *
 * Use this wrapper when the action is primarily represented by an icon and
 * needs consistent tooltip, label, selected, or danger treatment.
 */
export interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  icon: LucideIcon;
  label: string;
  size?: "sm" | "md";
}

const SIZE_CLASS_MAP = {
  sm: "w-9",
  md: "w-10",
};

/**
 * Reusable icon button for compact toolbars.
 *
 * Use it when a normal text button would add noise but the action still needs a
 * stable accessible label and consistent launcher styling.
 */
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
    <Button
      {...buttonProps}
      type={type}
      variant="glass"
      size={size}
      aria-label={label}
      title={title ?? label}
      className={`${SIZE_CLASS_MAP[size]} px-0 ${className}`}
      icon={<Icon size={size === "sm" ? 17 : 19} />}
    />
  );
}
