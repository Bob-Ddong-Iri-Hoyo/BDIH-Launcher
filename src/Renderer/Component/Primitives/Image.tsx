import React from "react";

export interface PrimitiveImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {}

export type ImageFrameSize = "xs" | "sm" | "md" | "lg";
export type ImageFrameShape = "rounded" | "circle";

export interface ImageFrameProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: ImageFrameSize;
  shape?: ImageFrameShape;
}

const IMAGE_FRAME_SIZE_CLASSES: Record<ImageFrameSize, string> = {
  xs: "h-6 w-6",
  sm: "h-8 w-8",
  md: "h-10 w-10",
  lg: "h-12 w-12",
};

const IMAGE_FRAME_SHAPE_CLASSES: Record<ImageFrameShape, string> = {
  rounded: "rounded-lg",
  circle: "rounded-full",
};

function join_class_names(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function has_explicit_dimension_class(className: string | undefined) {
  if (!className) {
    return false;
  }

  return className
    .split(/\s+/)
    .some((token) => token.startsWith("h-") || token.startsWith("w-") || token.startsWith("size-"));
}

/**
 * Primitive image element.
 *
 * Use `PrimitiveImage` instead of raw `<img>` in Component files. It keeps the
 * element intentionally thin so sizing and object-fit can be supplied by the
 * caller or by `ImageFrame`.
 */
export const PrimitiveImage = React.forwardRef<HTMLImageElement, PrimitiveImageProps>(
  ({ className = "", alt = "", ...props }, ref) => <img ref={ref} alt={alt} className={className} {...props} />,
);

PrimitiveImage.displayName = "PrimitiveImage";

/**
 * Primitive image/icon frame.
 *
 * The `size` preset is useful for common square frames. If the caller provides
 * explicit height/width classes, the preset size is skipped so custom layouts
 * keep their exact dimensions.
 */
export const ImageFrame = React.forwardRef<HTMLDivElement, ImageFrameProps>(
  ({ size = "md", shape = "rounded", className = "", children, ...props }, ref) => {
    const sizeClassName = has_explicit_dimension_class(className) ? "" : IMAGE_FRAME_SIZE_CLASSES[size];

    return (
      <div ref={ref} className={join_class_names("overflow-hidden", sizeClassName, IMAGE_FRAME_SHAPE_CLASSES[shape], className)} {...props}>
        {children}
      </div>
    );
  },
);

ImageFrame.displayName = "ImageFrame";

/**
 * Primitive icon slot for SVG or image children.
 */
export const IconSlot = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className = "", children, ...props }, ref) => (
    <span ref={ref} className={className} {...props}>
      {children}
    </span>
  ),
);

IconSlot.displayName = "IconSlot";

/**
 * Primitive overlay layer for media thumbnails.
 */
export const MediaOverlay = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className = "", children, ...props }, ref) => (
    <div ref={ref} className={join_class_names("absolute inset-0", className)} {...props}>
      {children}
    </div>
  ),
);

MediaOverlay.displayName = "MediaOverlay";

/**
 * Primitive centered overlay layer.
 */
export const CenterOverlay = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className = "", children, ...props }, ref) => (
    <div ref={ref} className={join_class_names("absolute inset-0 grid place-items-center", className)} {...props}>
      {children}
    </div>
  ),
);

CenterOverlay.displayName = "CenterOverlay";
