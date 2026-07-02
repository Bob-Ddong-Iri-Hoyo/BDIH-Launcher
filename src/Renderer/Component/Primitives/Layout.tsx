import React from "react";

export interface PrimitiveBoxProps extends React.HTMLAttributes<HTMLElement> {
  as?: React.ElementType;
  children?: React.ReactNode;
}

export interface PrimitiveLayoutProps extends PrimitiveBoxProps {
  gapClassName?: string;
}

export interface FloatingLayerProps extends PrimitiveBoxProps {
  strategy?: "absolute" | "fixed";
}

function join_class_names(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function class_name_has_token(className: string | undefined, prefixes: string[]) {
  if (!className) {
    return false;
  }

  return className
    .split(/\s+/)
    .some((token) => prefixes.some((prefix) => token === prefix || token.startsWith(`${prefix}-`)));
}

/**
 * Primitive layout box.
 *
 * `Box` is the escape hatch for semantic HTML in Components. Prefer
 * `Box as="section"`, `Box as="main"`, or `Box as="label"` over raw DOM tags
 * when a Component needs semantic structure.
 */
export const Box = React.forwardRef<HTMLElement, PrimitiveBoxProps>(
  ({ as: Element = "div", children, className = "", ...props }, ref) => (
    <Element ref={ref} className={className} {...props}>
      {children}
    </Element>
  ),
);

Box.displayName = "Box";

/**
 * Vertical flex layout primitive.
 *
 * `Stack` owns only the flex direction and a soft default gap. If callers pass
 * their own `gap-*` class or `gapClassName`, the default gap is skipped so
 * higher-level Components keep precise spacing.
 */
export const Stack = React.forwardRef<HTMLElement, PrimitiveLayoutProps>(
  ({ className = "", gapClassName, ...props }, ref) => {
    const shouldUseDefaultGap = !gapClassName && !class_name_has_token(className, ["gap"]);

    return (
      <Box
        ref={ref}
        className={join_class_names("flex flex-col", shouldUseDefaultGap && "gap-2", gapClassName, className)}
        {...props}
      />
    );
  },
);

Stack.displayName = "Stack";

/**
 * Horizontal flex layout primitive.
 *
 * Like `Stack`, this keeps a small default gap only when the caller did not
 * already provide a gap class.
 */
export const Inline = React.forwardRef<HTMLElement, PrimitiveLayoutProps>(
  ({ className = "", gapClassName, ...props }, ref) => {
    const shouldUseDefaultGap = !gapClassName && !class_name_has_token(className, ["gap"]);

    return (
      <Box
        ref={ref}
        className={join_class_names("flex", shouldUseDefaultGap && "gap-2", gapClassName, className)}
        {...props}
      />
    );
  },
);

Inline.displayName = "Inline";

/**
 * Relative positioning primitive for popovers, overlays, and anchored widgets.
 */
export const RelativeBox = React.forwardRef<HTMLElement, PrimitiveBoxProps>(
  ({ className = "", ...props }, ref) => <Box ref={ref} className={join_class_names("relative", className)} {...props} />,
);

RelativeBox.displayName = "RelativeBox";

/**
 * Absolute/fixed layer primitive used by menus and floating UI.
 */
export const FloatingLayer = React.forwardRef<HTMLElement, FloatingLayerProps>(
  ({ className = "", strategy = "absolute", ...props }, ref) => (
    <Box
      ref={ref}
      className={join_class_names(strategy === "fixed" ? "fixed" : "absolute", "z-50", className)}
      {...props}
    />
  ),
);

FloatingLayer.displayName = "FloatingLayer";
