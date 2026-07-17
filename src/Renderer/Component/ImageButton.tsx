import React from "react";
import { useTranslation } from "react-i18next";
import { join_classes } from "../../Common/Util/ClassName";
import {
  Box,
  Button,
  CenterOverlay,
  IconSlot,
  ImageFrame,
  Inline,
  InlineText,
  PrimitiveImage,
  Stack,
  Text,
} from "./Primitives";

/** Visual presets for image-backed buttons. */
export type ImageButtonPreset = "app" | "compact" | "tile" | "desktop";
/** Border radius preset for image-backed button surfaces. */
export type ImageButtonRadius = "sm" | "md" | "lg" | "xl" | "full";
/** Border treatment preset for image-backed button surfaces. */
export type ImageButtonBorder = "none" | "subtle" | "strong" | "glow";
/** Image crop shape used inside ImageButton. */
export type ImageButtonImageShape = "rounded" | "circle";
/** Image size preset used inside ImageButton. */
export type ImageButtonImageSize = "sm" | "md" | "lg";

/**
 * Props for a rich image-backed action button.
 *
 * Use this for app/game launch tiles where an icon, status ring, subtitle, and
 * contextual launch state need to behave as one accessible button.
 */
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
  isLaunching?: boolean;
  hasError?: boolean;
  className?: string;
  dragHandleProps?: React.ButtonHTMLAttributes<HTMLButtonElement>;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onMouseHover?: () => void;
  onContextMenu?: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

/**
 * Rich image-backed button for apps, launchers, and visual tiles.
 *
 * Prefer this over composing primitives manually when the action should feel
 * like a CrossOver-style app icon with running/error/active affordances.
 */
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
  isLaunching = false,
  hasError = false,
  className = "",
  dragHandleProps,
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
  const isBusy = isRunning || isLaunching;
  const nameLabel = (
    <InlineText tone="strong" size="sm" className="line-clamp-2 text-center font-semibold">
      {name}
    </InlineText>
  );

  return (
    <Button
      {...dragHandleProps}
      variant="ghost"
      size="md"
      disabled={isLaunching}
      onClick={isBusy ? undefined : onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onMouseMove={onMouseHover}
      onContextMenu={onContextMenu}
      className={join_classes(
        "group relative isolate h-full w-full flex-col text-center",
        presetClass,
        image_button_radius_class(resolvedRadius),
        image_button_border_class(resolvedBorder),
        image_button_tone({ preset, isActive, isRunning, isLaunching, hasError }),
        isBusy && "cursor-default",
        className,
      )}
      aria-label={`${name} ${resolvedActionLabel}`}
    >
      <ImageFrame
        size={resolvedImageSize}
        shape={resolvedImageShape}
        className={join_classes(
          "relative",
          image_frame_spacing_class(preset),
          "transition-transform duration-150 ease-out group-hover:scale-[1.04]",
          !isBusy && "group-hover:blur-[1.5px]",
          image_frame_tone({ isRunning, isLaunching, hasError }),
          isRunning && "running-app-icon-frame",
          isLaunching && "animate-pulse",
        )}
      >
        <AppImage src={src} name={name} />
      </ImageFrame>
      {preset === "desktop" ? (
        <Box className="flex h-10 w-full shrink-0 items-center justify-center">
          {nameLabel}
        </Box>
      ) : nameLabel}
      {subtitle && preset !== "desktop" ? (
        <Text tone="muted" size="xs" truncate className="mt-1 max-w-full text-center">
          {subtitle}
        </Text>
      ) : null}
      {preset === "desktop" ? (
        <Box className="mt-1 flex h-5 w-full shrink-0 items-center justify-center">
          {isRunning ? (
            <Inline className="items-center rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-200 ring-1 ring-emerald-200/20">
              <RunningBeacon />
              {t("main.appContext.running")}
            </Inline>
          ) : null}
          {isLaunching ? (
            <Inline className="app-launching-indicator items-center rounded-full bg-sky-400/15 px-2 py-0.5 text-[10px] font-semibold text-sky-200 ring-1 ring-sky-200/20">
              <RunningBeacon />
              {t("main.appContext.launching")}
            </Inline>
          ) : null}
          {hasError ? (
            <InlineText className="rounded-full bg-red-400/15 px-2 py-0.5 text-[10px] font-semibold text-red-200">
              {t("main.appContext.launchFailed")}
            </InlineText>
          ) : null}
        </Box>
      ) : null}
      <ActionOverlay isRunning={isBusy} actionLabel={isLaunching ? t("main.appContext.launching") : resolvedActionLabel} />
    </Button>
  );
}

function AppImage({ src, name }: { src?: string; name: string }) {
  const [hasImageError, setHasImageError] = React.useState(false);

  if (src) {
    return (
      <>
        {!hasImageError ? (
          <PrimitiveImage
            src={src}
            alt={name}
            onError={() => setHasImageError(true)}
          />
        ) : (
          <TextIconFallback name={name} />
        )}
      </>
    );
  }

  return <TextIconFallback name={name} />;
}

function TextIconFallback({ name }: { name: string }) {
  return (
    <IconSlot className="grid h-full w-full place-items-center bg-gradient-to-br from-slate-700 via-slate-800 to-slate-950 text-white">
      <InlineText className="text-center text-sm font-black uppercase leading-none tracking-tight text-white drop-shadow">
        {app_initials(name)}
      </InlineText>
    </IconSlot>
  );
}

function app_initials(name: string): string {
  const normalizedWords = name
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean);

  if (normalizedWords.length >= 2) {
    return `${normalizedWords[0][0] ?? ""}${normalizedWords[1][0] ?? ""}`.toUpperCase();
  }

  return (normalizedWords[0] ?? name).slice(0, 2).toUpperCase() || "APP";
}

function ActionOverlay({
  isRunning,
  actionLabel,
}: {
  isRunning: boolean;
  actionLabel: string;
}) {
  return (
    <CenterOverlay className={`pointer-events-none transition-opacity duration-150 ease-out ${isRunning ? "opacity-0" : "opacity-0 group-hover:opacity-100"}`}>
      <Inline className="min-w-0 max-w-[86%] items-center justify-center rounded-full bg-black/82 px-2 py-1 text-[10px] font-black text-white shadow-[0_8px_22px_rgba(0,0,0,0.48)] ring-1 ring-white/20 backdrop-blur-md">
        <InlineText tone="strong" size="xs" className="min-w-0 truncate whitespace-nowrap text-center leading-none text-white">
          {actionLabel}
        </InlineText>
      </Inline>
    </CenterOverlay>
  );
}

function RunningBeacon() {
  return (
    <Box className="grid h-3 w-3 place-items-center">
      <RunningDot />
    </Box>
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
    desktop: "min-h-28 max-w-28 p-2",
  }[preset];
}

function image_button_default_radius(preset: ImageButtonPreset): ImageButtonRadius {
  return {
    app: "xl",
    compact: "lg",
    tile: "md",
    desktop: "lg",
  }[preset];
}

function image_button_default_border(preset: ImageButtonPreset): ImageButtonBorder {
  return {
    app: "subtle",
    compact: "subtle",
    tile: "strong",
    desktop: "none",
  }[preset];
}

function image_button_default_image_shape(preset: ImageButtonPreset): ImageButtonImageShape {
  return {
    app: "circle",
    compact: "rounded",
    tile: "rounded",
    desktop: "circle",
  }[preset];
}

function image_button_default_image_size(preset: ImageButtonPreset): ImageButtonImageSize {
  return {
    app: "md",
    compact: "sm",
    tile: "lg",
    desktop: "lg",
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
    desktop: "mb-2",
  }[preset];
}

function image_button_tone({
  isActive,
  isRunning,
  isLaunching,
  hasError,
  preset,
}: {
  preset: ImageButtonPreset;
  isActive: boolean;
  isRunning: boolean;
  isLaunching: boolean;
  hasError: boolean;
}) {
  if (preset === "desktop") {
    if (isRunning) {
      return "bg-transparent text-white hover:bg-white/[0.045]";
    }

    if (isLaunching) {
      return "bg-transparent text-sky-100 hover:bg-sky-500/[0.06]";
    }

    if (hasError) {
      return "bg-transparent text-red-100 hover:bg-red-500/[0.08]";
    }

    if (isActive) {
      return "bg-white/[0.04] text-white hover:bg-white/[0.07]";
    }

    return "bg-transparent hover:bg-white/[0.045]";
  }

  if (isRunning) {
    return "border-emerald-300/70 bg-emerald-500/[0.10] shadow-[0_0_34px_rgba(16,185,129,0.24)]";
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
  isLaunching,
  hasError,
}: {
  isRunning: boolean;
  isLaunching: boolean;
  hasError: boolean;
}) {
  if (isRunning) {
    return "ring-emerald-300/60 shadow-[0_0_32px_rgba(16,185,129,0.34)]";
  }

  if (isLaunching) {
    return "ring-sky-300/55 shadow-[0_0_28px_rgba(56,189,248,0.24)]";
  }

  if (hasError) {
    return "ring-red-300/45 shadow-[0_0_24px_rgba(248,113,113,0.20)]";
  }

  return "ring-white/10 group-hover:ring-white/20";
}
