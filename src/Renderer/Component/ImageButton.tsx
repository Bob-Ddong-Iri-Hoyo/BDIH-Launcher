import React from "react";
import { Monitor, Play } from "lucide-react";
import { useTranslation } from "react-i18next";
import { join_classes } from "../../Common/Util/ClassName";
import {
  Badge,
  Box,
  Button,
  CenterOverlay,
  IconSlot,
  ImageFrame,
  Inline,
  InlineText,
  MediaOverlay,
  PrimitiveImage,
  Stack,
  Text,
} from "./Primitives";

export type ImageButtonPreset = "app" | "compact" | "tile";
export type ImageButtonRadius = "sm" | "md" | "lg" | "xl" | "full";
export type ImageButtonBorder = "none" | "subtle" | "strong" | "glow";
export type ImageButtonImageShape = "rounded" | "circle";
export type ImageButtonImageSize = "sm" | "md" | "lg";

export interface ImageButtonProps {
  id?: string;
  src?: string;
  name?: string;
  subtitle?: string;
  actionLabel?: string;
  preset?: ImageButtonPreset;
  radius?: ImageButtonRadius;
  border?: ImageButtonBorder;
  imageShape?: ImageButtonImageShape;
  imageSize?: ImageButtonImageSize;
  isActive?: boolean;
  isRunning?: boolean;
  hasError?: boolean;
  className?: string;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onMouseHover?: () => void;
  onContextMenu?: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

export function ImageButton({
  src,
  name = "Untitled",
  subtitle,
  actionLabel,
  preset = "app",
  radius,
  border,
  imageShape,
  imageSize,
  isActive = false,
  isRunning = false,
  hasError = false,
  className = "",
  onClick,
  onMouseEnter,
  onMouseLeave,
  onMouseHover,
  onContextMenu,
}: ImageButtonProps) {
  const { t } = useTranslation();
  const resolvedActionLabel = actionLabel ?? t("common.actions.run");
  const presetClass = image_button_preset_class(preset);
  const resolvedRadius = radius ?? image_button_default_radius(preset);
  const resolvedBorder = border ?? image_button_default_border(preset);
  const resolvedImageShape = imageShape ?? image_button_default_image_shape(preset);
  const resolvedImageSize = imageSize ?? image_button_default_image_size(preset);

  return (
    <Button
      variant="ghost"
      size="md"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onMouseMove={onMouseHover}
      onContextMenu={onContextMenu}
      className={join_classes(
        "group relative isolate h-full w-full flex-col overflow-hidden text-center",
        presetClass,
        image_button_radius_class(resolvedRadius),
        image_button_border_class(resolvedBorder),
        image_button_tone({ isActive, isRunning, hasError }),
        className,
      )}
      aria-label={`${name} ${resolvedActionLabel}`}
    >
      <ImageFrame
        size={resolvedImageSize}
        shape={resolvedImageShape}
        className={join_classes(image_frame_spacing_class(preset), "group-hover:scale-[1.04]", image_frame_tone({ isRunning, hasError }))}
      >
        <AppImage src={src} name={name} />
        <ActionOverlay isRunning={isRunning} actionLabel={resolvedActionLabel} />
        {isRunning ? <RunningEffects /> : null}
      </ImageFrame>
      <InlineText tone="strong" size="sm" className="line-clamp-2 text-center font-semibold">
        {name}
      </InlineText>
      {subtitle ? (
        <Text tone="muted" size="xs" truncate className="mt-1 max-w-full text-center">
          {subtitle}
        </Text>
      ) : null}
    </Button>
  );
}

function AppImage({ src, name }: { src?: string; name: string }) {
  if (src) {
    return <PrimitiveImage src={src} alt={name} />;
  }

  return (
    <IconSlot>
      <Monitor className="text-slate-300" size={30} />
    </IconSlot>
  );
}

function ActionOverlay({
  isRunning,
  actionLabel,
}: {
  isRunning: boolean;
  actionLabel: string;
}) {
  return (
    <CenterOverlay className={isRunning ? "opacity-0" : "opacity-0 transition group-hover:opacity-100"}>
      <Inline className="text-xs font-medium text-emerald-300">
        <Play size={13} fill="currentColor" />
        <InlineText tone="strong" size="xs">
          {actionLabel}
        </InlineText>
      </Inline>
    </CenterOverlay>
  );
}

function RunningEffects() {
  return (
    <>
      <MediaOverlay className="pointer-events-none bg-gradient-to-br from-emerald-300/55 via-cyan-300/20 to-transparent mix-blend-screen" />
      <MediaOverlay className="pointer-events-none bg-[radial-gradient(circle_at_50%_18%,rgba(255,255,255,0.42),transparent_46%)]" />
      <RunningBadge />
    </>
  );
}

function RunningBadge() {
  const { t } = useTranslation();

  return (
    <Badge className="absolute bottom-1.5 max-w-[4.4rem] bg-black/40 text-emerald-50 shadow-[0_0_12px_rgba(16,185,129,0.35)] ring-1 ring-emerald-200/25 backdrop-blur-md">
      <RunningDot />
      <InlineText tone="strong" size="xs" truncate>
        {t("main.appContext.running")}
      </InlineText>
    </Badge>
  );
}

function RunningDot() {
  return (
    <Box className="relative flex h-1.5 w-1.5 shrink-0">
      <Box className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-70" />
      <Box className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-300" />
    </Box>
  );
}

function image_button_preset_class(preset: ImageButtonPreset): string {
  return {
    app: "min-h-40 p-4",
    compact: "min-h-28 p-3",
    tile: "min-h-36 p-4",
  }[preset];
}

function image_button_default_radius(preset: ImageButtonPreset): ImageButtonRadius {
  return {
    app: "xl",
    compact: "lg",
    tile: "md",
  }[preset];
}

function image_button_default_border(preset: ImageButtonPreset): ImageButtonBorder {
  return {
    app: "subtle",
    compact: "subtle",
    tile: "strong",
  }[preset];
}

function image_button_default_image_shape(preset: ImageButtonPreset): ImageButtonImageShape {
  return {
    app: "circle",
    compact: "rounded",
    tile: "rounded",
  }[preset];
}

function image_button_default_image_size(preset: ImageButtonPreset): ImageButtonImageSize {
  return {
    app: "md",
    compact: "sm",
    tile: "lg",
  }[preset];
}

function image_button_radius_class(radius: ImageButtonRadius): string {
  return {
    sm: "rounded-lg",
    md: "rounded-xl",
    lg: "rounded-2xl",
    xl: "rounded-3xl",
    full: "rounded-[2rem]",
  }[radius];
}

function image_button_border_class(border: ImageButtonBorder): string {
  return {
    none: "border border-transparent",
    subtle: "border border-white/10",
    strong: "border border-white/20",
    glow: "border border-emerald-300/40 shadow-[0_0_28px_rgba(16,185,129,0.18)]",
  }[border];
}

function image_frame_spacing_class(preset: ImageButtonPreset): string {
  return {
    app: "mb-3",
    compact: "mb-2",
    tile: "mb-3",
  }[preset];
}

function image_button_tone({
  isActive,
  isRunning,
  hasError,
}: {
  isActive: boolean;
  isRunning: boolean;
  hasError: boolean;
}) {
  if (isRunning) {
    return "running-app-card border-emerald-300/70 bg-emerald-500/[0.10] shadow-[0_0_34px_rgba(16,185,129,0.24)]";
  }

  if (hasError) {
    return "border-red-300/50 bg-red-500/[0.10] shadow-[0_0_28px_rgba(248,113,113,0.16)] hover:border-red-300/70 hover:bg-red-500/[0.14]";
  }

  if (isActive) {
    return "accent-selection";
  }

  return "bg-white/[0.04] hover:border-white/20 hover:bg-white/[0.07]";
}

function image_frame_tone({
  isRunning,
  hasError,
}: {
  isRunning: boolean;
  hasError: boolean;
}) {
  if (isRunning) {
    return "ring-emerald-300/60 shadow-[0_0_32px_rgba(16,185,129,0.34)]";
  }

  if (hasError) {
    return "ring-red-300/45 shadow-[0_0_24px_rgba(248,113,113,0.20)]";
  }

  return "ring-white/10 group-hover:ring-white/20";
}
