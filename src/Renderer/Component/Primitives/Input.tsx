import React from "react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const DEFAULT_INPUT_CLASS = "h-10 w-full rounded-lg border border-white/10 bg-[#0b1020] px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-[rgb(var(--accent-rgb)/0.55)]";

/**
 * Primitive one-line input.
 *
 * With no `className`, Input uses the standard launcher field styling. When a
 * caller passes a custom `className`, the custom class is used as-is so form
 * Components can control exact height, width, and spacing without fighting the
 * preset.
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => <input ref={ref} className={className ?? DEFAULT_INPUT_CLASS} {...props} />,
);

Input.displayName = "Input";
