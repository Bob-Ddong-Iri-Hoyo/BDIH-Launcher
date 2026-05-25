import React from "react";

export function ViewSurface({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`h-full p-6 ${className}`}>{children}</div>;
}
