export interface ContextSubmenuPositionInput {
  anchorLeft: number;
  anchorRight: number;
  anchorTop: number;
  menuWidth: number;
  menuHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  margin?: number;
  gap?: number;
}

export interface ResolvedContextSubmenuPosition {
  x: number;
  y: number;
  side: "left" | "right";
}

export function resolve_context_submenu_position({
  anchorLeft,
  anchorRight,
  anchorTop,
  menuWidth,
  menuHeight,
  viewportWidth,
  viewportHeight,
  margin = 8,
  gap = 4,
}: ContextSubmenuPositionInput): ResolvedContextSubmenuPosition {
  const rightX = anchorRight + gap;
  const leftX = anchorLeft - menuWidth - gap;
  const fitsRight = rightX + menuWidth <= viewportWidth - margin;
  const side = fitsRight ? "right" : "left";
  const preferredX = fitsRight ? rightX : leftX;
  const maxX = Math.max(margin, viewportWidth - menuWidth - margin);
  const maxY = Math.max(margin, viewportHeight - menuHeight - margin);

  return {
    x: Math.min(Math.max(margin, preferredX), maxX),
    y: Math.min(Math.max(margin, anchorTop), maxY),
    side,
  };
}
