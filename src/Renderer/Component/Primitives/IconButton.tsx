import React from "react";
import { Button, ButtonProps } from "./Button";

/**
 * Props for icon-oriented button presets.
 *
 * This primitive is a light wrapper over `Button`. Use it when a component wants
 * to communicate intent through the name `IconButton`, while keeping the same
 * behavior and styling surface as the base button primitive.
 */
export interface IconButtonProps extends ButtonProps {
  ImageSize?: "xs" | "sm" | "md";
}

/**
 * Semantic alias for a button that primarily displays an icon.
 *
 * The component intentionally does not add layout rules. Pass `icon`, children,
 * and class names through `ButtonProps`.
 */
export function IconButton(props: IconButtonProps) {
  return <Button {...props} />;
}
