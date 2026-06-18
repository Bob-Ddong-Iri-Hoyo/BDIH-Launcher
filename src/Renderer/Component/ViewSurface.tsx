import React from "react";
import { Box } from "./Primitives";

export function ViewSurface({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <Box className={`h-full p-6 ${className}`}>{children}</Box>;
}
