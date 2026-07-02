import React from "react";
import { IconSlot, ImageFrame, InlineText, PrimitiveImage } from "./Primitives";

/**
 * Small favicon-style icon frame.
 *
 * Use this for launcher/site shortcuts where the source image may be remote or
 * missing and the UI still needs a consistent compact fallback frame.
 */
export function FaviconIcon({ src, label }: { src: string; label: string }) {
  const [hasError, setHasError] = React.useState(false);

  return (
    <ImageFrame size="xs" shape="rounded" className="grid place-items-center rounded-lg bg-white/10 p-1 ring-white/10">
      {hasError ? (
        <IconSlot className="bg-transparent">
          <InlineText tone="strong" size="xs" className="grid h-full w-full place-items-center text-center text-[10px] font-bold leading-none">
            {label.slice(0, 2)}
          </InlineText>
        </IconSlot>
      ) : (
        <PrimitiveImage
          className="max-h-full max-w-full object-contain"
          src={src}
          alt=""
          onError={() => setHasError(true)}
        />
      )}
    </ImageFrame>
  );
}
