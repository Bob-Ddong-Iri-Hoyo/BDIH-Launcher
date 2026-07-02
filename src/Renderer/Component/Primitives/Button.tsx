import React from "react";

export type ButtonVariant = "primary" | "glass" | "ghost" | "listbox" | "unstyled";
export type ButtonSize = "xs" | "sm" | "md" | "unstyled";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const BASE_BUTTON_CLASS = "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent-rgb)/0.45)] disabled:cursor-not-allowed disabled:opacity-50";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "accent-primary text-white shadow-lg shadow-black/20",
  glass: "border border-white/10 bg-white/[0.04] text-slate-200 hover:border-white/20 hover:bg-white/[0.08] hover:text-white",
  ghost: "text-slate-400 hover:bg-white/[0.06] hover:text-white",
  listbox: "border border-white/10 bg-[#0b1020] text-slate-200 hover:border-white/20 hover:bg-white/[0.08]",
  unstyled: "",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  xs: "h-7 px-2 text-[11px]",
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-3 text-sm",
  unstyled: "",
};

/**
 * Primitive button.
 *
 * By default, Button renders a ready-to-use glass button. When a caller passes
 * a full custom `className` without explicitly choosing `variant` or `size`,
 * the primitive switches to `unstyled` so Component-level layouts keep their
 * exact dimensions. Pass `variant` and `size` explicitly when you want the
 * preset styling plus extra classes.
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ icon, children, variant, size, className = "", type = "button", ...props }, ref) => {
    const hasCustomClassName = className.trim().length > 0;
    const resolvedVariant = variant ?? (hasCustomClassName ? "unstyled" : "glass");
    const resolvedSize = size ?? (hasCustomClassName ? "unstyled" : "md");
    const shouldUseBaseClass = resolvedVariant !== "unstyled" || resolvedSize !== "unstyled";
    const classes = [
      shouldUseBaseClass ? BASE_BUTTON_CLASS : "",
      VARIANT_CLASSES[resolvedVariant],
      SIZE_CLASSES[resolvedSize],
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <button ref={ref} type={type} className={classes} {...props}>
        {icon}
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";
