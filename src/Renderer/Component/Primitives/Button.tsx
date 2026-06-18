import React from "react";
import { join_classes } from "../../../Common/Util/ClassName";

/**
 * Supported visual treatments for the primitive button.
 *
 * Higher-level components should choose one of these variants rather than
 * embedding button styling directly. If a flow needs a very specific style,
 * prefer composing this primitive with `className` instead of creating a raw
 * `<button>` in component code.
 */
export type ButtonVariant = "primary" | "glass" | "ghost" | "listbox";

/**
 * Compact launcher button sizes.
 *
 * These sizes describe the primitive's control height only. Layout width should
 * be controlled by the parent layout primitive (`Inline`, `Stack`, `Box`, etc.).
 */
export type ButtonSize = "xs" | "sm" | "md";

/**
 * Props for the primitive button.
 *
 * `Button` extends the native button props and adds launcher-specific styling
 * switches. Use `icon` for a leading visual and `selected` for listbox-style
 * options where the item has an active state.
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  selected?: boolean;
  icon?: React.ReactNode;
}

/**
 * Base clickable primitive for all button-like interactions.
 *
 * This component is intentionally low-level: it handles common styling,
 * disabled states, icon placement, and button semantics, but it does not own any
 * feature behavior. Prefer composing with `Button` before creating custom raw
 * buttons in components.
 */
export function Button({
  variant = "glass",
  size = "sm",
  selected = false,
  icon,
  className,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  const variantClass = {
    primary: "accent-primary text-white hover:brightness-110",
    glass: "border border-white/10 bg-white/[0.04] text-slate-200 hover:border-white/20 hover:bg-white/[0.08] hover:text-white",
    ghost: "text-slate-300 hover:bg-white/[0.06] hover:text-white",
    listbox: selected
      ? "bg-white/[0.10] text-white"
      : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-100",
  }[variant];
  const sizeClass = {
    xs: "h-8 rounded-lg px-3 text-xs",
    sm: "h-9 rounded-lg px-3 text-xs",
    md: "h-10 rounded-lg px-3 text-xs",
  }[size];

  return (
    <button
      type={type}
      className={join_classes(
        "inline-flex shrink-0 items-center justify-center gap-2 font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
        variantClass,
        sizeClass,
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
