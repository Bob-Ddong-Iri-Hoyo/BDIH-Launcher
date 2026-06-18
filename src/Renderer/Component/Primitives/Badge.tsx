import React from "react";
import { join_classes } from "../../../Common/Util/ClassName";

/**
 * Small status or metadata marker.
 *
 * Use `Badge` for compact inline indicators such as "Running", "Beta", or a
 * numeric count. It intentionally does not own semantic meaning beyond being a
 * styled span, so callers should provide accessible surrounding text when the
 * badge conveys important state.
 */
export function Badge({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={join_classes("inline-flex items-center justify-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold", className)}
      {...props}
    >
      {children}
    </span>
  );
}
