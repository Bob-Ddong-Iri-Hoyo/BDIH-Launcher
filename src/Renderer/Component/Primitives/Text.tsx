import React from "react";
import { join_classes } from "../../../Common/Util/ClassName";

/** Text color intent used by text primitives. */
export type TextTone = "strong" | "body" | "muted";

/** Text size intent used by text primitives. */
export type TextSize = "xs" | "sm" | "base";

/** Paragraph weight options. */
export type TextWeight = "regular" | "semibold";

/**
 * Paragraph text primitive.
 *
 * Use `Text` for block-level copy, helper text, descriptions, and small status
 * descriptions. For text inside buttons or inline rows, prefer `InlineText` to
 * avoid invalid nested paragraph markup.
 */
export function Text({
  tone = "muted",
  size = "sm",
  weight = "regular",
  truncate = false,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement> & {
  tone?: TextTone;
  size?: TextSize;
  weight?: TextWeight;
  truncate?: boolean;
}) {
  const toneClass = {
    strong: "text-slate-100",
    body: "text-slate-300",
    muted: "text-slate-500",
  }[tone];
  const sizeClass = {
    xs: "text-xs leading-5",
    sm: "text-sm leading-6",
    base: "text-base leading-6",
  }[size];
  const weightClass = weight === "semibold" ? "font-semibold" : undefined;

  return (
    <p className={join_classes(toneClass, sizeClass, weightClass, truncate && "truncate", className)} {...props}>
      {children}
    </p>
  );
}

/**
 * Inline text primitive.
 *
 * Use `InlineText` inside buttons, badges, list items, and inline metadata rows.
 * It shares tone and size language with `Text` but renders a span.
 */
export function InlineText({
  tone = "body",
  size = "xs",
  truncate = false,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: TextTone;
  size?: TextSize;
  truncate?: boolean;
}) {
  const toneClass = {
    strong: "text-slate-100",
    body: "text-slate-300",
    muted: "text-slate-500",
  }[tone];
  const sizeClass = {
    xs: "text-xs leading-5",
    sm: "text-sm leading-6",
    base: "text-base leading-6",
  }[size];

  return (
    <span className={join_classes(toneClass, sizeClass, truncate && "truncate", className)} {...props}>
      {children}
    </span>
  );
}

/**
 * Label primitive for form fields.
 *
 * Use this with `Input`, `Select`, `ComboItem`, or other form primitives when a
 * visible label is needed. For radio/checkbox item text, use `Text` or
 * `InlineText` next to the input instead.
 */
export function FieldLabel({
  className,
  children,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={join_classes("mb-2 block text-xs font-semibold text-slate-400", className)} {...props}>
      {children}
    </label>
  );
}

/**
 * Monospace preformatted text primitive.
 *
 * Use `CodeBlock` for log output, terminal snippets, and other preformatted
 * content. It owns the `<pre><code>` structure so feature components do not need
 * to render raw code containers.
 */
export const CodeBlock = React.forwardRef<HTMLPreElement, React.HTMLAttributes<HTMLPreElement>>(function CodeBlock(
  { className, children, ...props },
  ref,
) {
  return (
    <pre ref={ref} className={join_classes("font-mono", className)} {...props}>
      <code>{children}</code>
    </pre>
  );
});
