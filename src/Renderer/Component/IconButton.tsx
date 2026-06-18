import React from "react";
import type { LucideIcon } from "lucide-react";
import { Button } from "./Primitives";

export interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  icon: LucideIcon;
  label: string;
  size?: "sm" | "md";
}

const SIZE_CLASS_MAP = {
  sm: "w-9",
  md: "w-10",
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
