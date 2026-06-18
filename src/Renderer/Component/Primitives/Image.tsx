import React from "react";
import { join_classes } from "../../../Common/Util/ClassName";

/**
 * Primitive image element with launcher defaults.
 *
 * Use this instead of raw `<img>` in components so object-fit and draggable
 * behavior stay consistent. The element remains intentionally thin and accepts
 * all native image attributes.
 */
export function PrimitiveImage({
  className,
  alt = "",
  draggable = false,
  ...props
}: React.ImgHTMLAttributes<HTMLImageElement>) {
  return (
    <img
      className={join_classes("h-full w-full object-cover", className)}
      alt={alt}
      draggable={draggable}
      {...props}
    />
  );
}

/**
 * Common frame for icons, app artwork, or square/circular image treatments.
 *
 * `ImageFrame` owns only sizing, shape, clipping, and positioning. It should be
 * combined with `PrimitiveImage`, `IconSlot`, and overlay primitives to build
 * higher-level components such as app cards.
 */
export function ImageFrame({
  size = "md",
  shape = "rounded",
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  size?: "xs" | "sm" | "md" | "lg";
  shape?: "rounded" | "circle";
}) {
  const sizeClass = {
    xs: "h-7 w-7",
    sm: "h-12 w-12",
    md: "h-20 w-20",
    lg: "h-24 w-24",
  }[size];
  const shapeClass = shape === "circle" ? "rounded-full" : "rounded-2xl";

  return (
    <div
      className={join_classes(
        "relative flex shrink-0 items-center justify-center overflow-hidden ring-1 transition",
        sizeClass,
        shapeClass,
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * Fallback visual slot for icon-only artwork.
 *
 * Use this when image data is missing and a caller wants to render an icon in the
 * same space that would normally contain an image.
 */
export function IconSlot({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={join_classes("flex h-full w-full items-center justify-center bg-slate-900", className)}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * Absolute overlay that covers the image frame.
 *
 * Use this for gradients, state effects, or visual layers that should span the
 * full frame. Interactivity should generally remain on the parent component.
 */
export function MediaOverlay({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={join_classes("absolute inset-0", className)} {...props}>
      {children}
    </div>
  );
}

/**
 * Centered absolute overlay for foreground image actions.
 *
 * Use this when a play icon, loading indicator, or short label needs to sit in
 * the center of an `ImageFrame`.
 */
export function CenterOverlay({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={join_classes("absolute inset-0 flex items-center justify-center", className)} {...props}>
      {children}
    </div>
  );
}
