import React from "react";

export interface TextProps extends React.HTMLAttributes<HTMLElement> {
  as?: React.ElementType;
}

export interface CodeBlockProps extends React.HTMLAttributes<HTMLPreElement> {
  codeClassName?: string;
}

function join_class_names(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/**
 * Primitive text block.
 *
 * Use `Text` for paragraph-like copy in Components. The `as` prop keeps
 * semantic flexibility while still avoiding raw DOM tags outside Primitives.
 */
export const Text = React.forwardRef<HTMLElement, TextProps>(
  ({ as: Element = "p", className = "", children, ...props }, ref) => (
    <Element ref={ref} className={className} {...props}>
      {children}
    </Element>
  ),
);

Text.displayName = "Text";

/**
 * Primitive inline text.
 *
 * Use this where Components would otherwise need a raw `<span>`, especially
 * inside buttons, badges, compact rows, and mixed inline labels.
 */
export const InlineText = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className = "", children, ...props }, ref) => (
    <span ref={ref} className={className} {...props}>
      {children}
    </span>
  ),
);

InlineText.displayName = "InlineText";

/**
 * Primitive field label.
 *
 * This intentionally renders a label so form Components can keep accessible
 * labeling without exposing raw DOM tags.
 */
export const FieldLabel = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className = "", children, ...props }, ref) => (
    <label ref={ref} className={className} {...props}>
      {children}
    </label>
  ),
);

FieldLabel.displayName = "FieldLabel";

/**
 * Primitive code/log block.
 *
 * `CodeBlock` is tuned for logger and terminal-style output: it stays block
 * sized, keeps long lines inside its own scroll area, and avoids the nested
 * `<code>` element changing the measured width of its parent.
 */
export const CodeBlock = React.forwardRef<HTMLPreElement, CodeBlockProps>(
  ({ className = "", codeClassName = "", children, style, ...props }, ref) => (
    <pre
      ref={ref}
      className={join_class_names("block min-w-0 max-w-full overflow-auto", className)}
      style={style}
      {...props}
    >
      <code
        className={join_class_names("block min-w-0", codeClassName)}
        style={{
          whiteSpace: "inherit",
          overflowWrap: "inherit",
          wordBreak: "inherit",
          font: "inherit",
          color: "inherit",
        }}
      >
        {children}
      </code>
    </pre>
  ),
);

CodeBlock.displayName = "CodeBlock";
