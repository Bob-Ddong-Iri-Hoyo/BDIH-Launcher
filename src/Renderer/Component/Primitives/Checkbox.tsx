import React from "react";

export interface CheckboxProps extends Omit<React.LabelHTMLAttributes<HTMLLabelElement>, "onChange"> {
  checked?: boolean;
  disabled?: boolean;
  inputClassName?: string;
  label?: React.ReactNode;
  onCheckedChange?: (checked: boolean) => void;
}

/**
 * Primitive checkbox control with an optional inline label.
 *
 * Use this whenever a Component needs checkbox behavior without exposing a raw
 * `<input>` at the Component layer. Higher-level Components should pass the
 * state and handle `onCheckedChange`; this primitive only owns the DOM shape.
 */
export function Checkbox({
  checked,
  disabled,
  inputClassName = "accent-checkbox h-4 w-4",
  label,
  onCheckedChange,
  className = "inline-flex items-center gap-2",
  ...labelProps
}: CheckboxProps) {
  return (
    <label {...labelProps} className={className}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        className={inputClassName}
        onChange={(event) => onCheckedChange?.(event.target.checked)}
      />
      {label}
    </label>
  );
}
