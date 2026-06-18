import React from "react";
import { Box } from "./Primitives";

/**
 * Shared page surface wrapper.
 *
 * Use it to give feature views consistent padding, rounded glass treatment, and
 * scroll-safe sizing without rebuilding the same panel shell repeatedly.
 */
export function ViewSurface({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <Box className={`h-full p-6 ${className}`}>{children}</Box>;
}
