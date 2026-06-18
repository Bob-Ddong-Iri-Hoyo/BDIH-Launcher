import React from "react";
import { join_classes } from "../../../Common/Util/ClassName";

/**
 * Props for a primitive single-select radio group.
 *
 * `RadioGroup` provides value context only. It does not decide direction,
 * spacing, labels, or card treatment; compose those with layout and text
 * primitives at the call site.
 */
export interface RadioGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  name?: string;
  value?: string;
  onValueChange?: (value: string) => void;
}

interface RadioGroupContextValue {
  name?: string;
  value?: string;
  onValueChange?: (value: string) => void;
}

const RadioGroupContext = React.createContext<RadioGroupContextValue | null>(null);

/**
 * Primitive container for mutually exclusive radio options.
 *
 * Wrap `RadioItem` children with this component when the selected value should be
 * controlled as a group. Layout should be applied with `Inline`, `Stack`, or a
 * future grid primitive around the items.
 */
export function RadioGroup({
  name,
  value,
  onValueChange,
  className,
  children,
  ...props
}: RadioGroupProps) {
  const contextValue = React.useMemo(() => ({ name, value, onValueChange }), [name, onValueChange, value]);

  return (
    <RadioGroupContext.Provider value={contextValue}>
      <div role="radiogroup" className={className} {...props}>
        {children}
      </div>
    </RadioGroupContext.Provider>
  );
}

/**
 * Props for an individual radio input.
 *
 * Labels are intentionally not part of this primitive. Render text next to the
 * item so simple inline radio rows and complex card radios can share the same
 * input primitive.
 */
export interface RadioItemProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> {
  value: string;
  onChange?: (value: string) => void;
}

/**
 * Primitive radio input.
 *
 * Uses the nearest `RadioGroup` for `name`, `checked`, and value updates when
 * present, while still supporting standalone native radio usage.
 */
export const RadioItem = React.forwardRef<HTMLInputElement, RadioItemProps>(function RadioItem(
  { value, className, checked, name, onChange, ...props },
  ref,
) {
  const context = React.useContext(RadioGroupContext);
  const resolvedChecked = checked ?? context?.value === value;
  const resolvedName = name ?? context?.name;

  return (
    <input
      ref={ref}
      type="radio"
      name={resolvedName}
      value={value}
      checked={resolvedChecked}
      onChange={() => {
        onChange?.(value);
        context?.onValueChange?.(value);
      }}
      className={join_classes("accent-[rgb(var(--accent-rgb))]", className)}
      {...props}
    />
  );
});
