import React from "react";
import { join_classes } from "../../../Common/Util/ClassName";

/** Visual tone for text inputs. */
export type InputTone = "default" | "mono";

/**
 * Props for the primitive text input.
 *
 * Extends native input props and adds a small `tone` switch. Use `mono` for
 * paths, commands, arguments, or other literal values.
 */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  tone?: InputTone;
}

/**
 * Base text input primitive.
 *
 * Components should prefer this over raw `<input>` for consistent focus rings,
 * placeholder color, sizing, and font treatment.
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { tone = "default", className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={join_classes(
        "h-11 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-[rgb(var(--accent-rgb)/0.55)]",
        tone === "mono" && "font-mono",
        className,
      )}
      {...props}
    />
  );
});
