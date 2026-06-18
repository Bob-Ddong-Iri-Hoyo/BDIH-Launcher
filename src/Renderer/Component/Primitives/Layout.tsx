import React from "react";
import { join_classes } from "../../../Common/Util/ClassName";

/**
 * Base layout props for primitive containers.
 *
 * `Box` and its layout derivatives intentionally expose native HTML attributes so
 * callers can keep layout composition flexible without dropping down to raw
 * semantic elements in feature components.
 */
export interface PrimitiveBoxProps extends React.HTMLAttributes<HTMLElement> {
  as?: React.ElementType;
  children?: React.ReactNode;
}

/**
 * Generic container primitive.
 *
 * Use `Box` as the escape hatch for div-like and semantic layout. Pass `as` when
 * semantic HTML matters, for example `as="main"`, `as="section"`, or
 * `as="header"`.
 */
export const Box = React.forwardRef<HTMLElement, PrimitiveBoxProps>(function Box(
  { as: Component = "div", className, children, ...props },
  ref,
) {
  return (
    <Component ref={ref} className={className} {...props}>
      {children}
    </Component>
  );
});

/** Vertical spacing presets for `Stack`. */
export type StackGap = "xs" | "sm" | "md" | "lg";

/**
 * Vertical layout primitive.
 *
 * Use `Stack` when children should flow top-to-bottom with consistent spacing.
 * Do not encode feature-specific labels or behavior here.
 */
export const Stack = React.forwardRef<HTMLElement, PrimitiveBoxProps & { gap?: StackGap }>(function Stack(
  { gap = "md", className, children, ...props },
  ref,
) {
  const gapClass = {
    xs: "space-y-1",
    sm: "space-y-2",
    md: "space-y-4",
    lg: "space-y-6",
  }[gap];

  return (
    <Box ref={ref} className={join_classes(gapClass, className)} {...props}>
      {children}
    </Box>
  );
});

/** Horizontal alignment presets for `Inline`. */
export type InlineAlign = "start" | "center" | "end";

/** Horizontal distribution presets for `Inline`. */
export type InlineJustify = "start" | "between" | "end";

/** Horizontal spacing presets for `Inline`. */
export type InlineGap = "xs" | "sm" | "md";

/**
 * Horizontal layout primitive.
 *
 * Use `Inline` when children should sit side-by-side. Direction-specific choices
 * for radio groups, combo groups, button rows, and metadata rows should be made
 * by composing this primitive outside of the input primitive.
 */
export const Inline = React.forwardRef<HTMLElement, PrimitiveBoxProps & {
  align?: InlineAlign;
  justify?: InlineJustify;
  wrap?: boolean;
  gap?: InlineGap;
}>(function Inline(
  { align = "center", justify = "start", wrap = false, gap = "sm", className, children, ...props },
  ref,
) {
  const alignClass = {
    start: "items-start",
    center: "items-center",
    end: "items-end",
  }[align];
  const justifyClass = {
    start: "justify-start",
    between: "justify-between",
    end: "justify-end",
  }[justify];
  const gapClass = {
    xs: "gap-1",
    sm: "gap-2",
    md: "gap-3",
  }[gap];

  return (
    <Box ref={ref} className={join_classes("flex", alignClass, justifyClass, wrap && "flex-wrap", gapClass, className)} {...props}>
      {children}
    </Box>
  );
});

/** Relative positioning container for popovers and overlays. */
export const RelativeBox = React.forwardRef<HTMLElement, PrimitiveBoxProps>(function RelativeBox(
  { className, children, ...props },
  ref,
) {
  return (
    <Box ref={ref} className={join_classes("relative", className)} {...props}>
      {children}
    </Box>
  );
});

/**
 * Absolute floating layer primitive.
 *
 * Intended for small dropdowns, autocomplete lists, and popover content that is
 * positioned relative to a `RelativeBox`. Feature-specific keyboard behavior
 * should live outside this primitive.
 */
export const FloatingLayer = React.forwardRef<HTMLElement, PrimitiveBoxProps>(function FloatingLayer(
  { className, children, ...props },
  ref,
) {
  return (
    <Box
      ref={ref}
      className={join_classes(
        "absolute left-0 right-0 top-full z-50 mt-2 max-h-56 overflow-auto rounded-xl border border-white/10 bg-[#050914] p-1 shadow-2xl shadow-black/40",
        className,
      )}
      {...props}
    >
      {children}
    </Box>
  );
});
