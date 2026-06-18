import React from "react";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

/**
 * Primitive multiline text input.
 *
 * Use this instead of a raw `<textarea>` in Component files so forms keep the
 * same primitive-only composition rule as one-line inputs and buttons.
 */
export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className = "", ...props }, ref) => <textarea ref={ref} className={className} {...props} />,
);

Textarea.displayName = "Textarea";
