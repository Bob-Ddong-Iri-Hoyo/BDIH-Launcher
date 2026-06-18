import React from "react";
import { join_classes } from "../../../Common/Util/ClassName";

/**
 * Props for a primitive multi-select group.
 *
 * `ComboBox` is intentionally closer to a checkbox group than to an autocomplete
 * dropdown. It manages a set of selected string values and leaves visual layout
 * to parent primitives such as `Stack`, `Inline`, or future grid primitives.
 */
export interface ComboBoxProps extends React.HTMLAttributes<HTMLDivElement> {
  values?: string[];
  defaultValues?: string[];
  onValuesChange?: (values: string[]) => void;
  name?: string;
}

interface ComboBoxContextValue {
  values: string[];
  name?: string;
  toggleValue: (value: string, checked: boolean) => void;
}

const ComboBoxContext = React.createContext<ComboBoxContextValue | null>(null);

/**
 * Primitive multi-select container.
 *
 * Use `ComboBox` with one or more `ComboItem` children when multiple values can
 * be selected. This primitive does not render labels, descriptions, cards, or a
 * direction; compose those with `Text`, `Inline`, `Stack`, and component-level
 * wrappers.
 */
export function ComboBox({
  values,
  defaultValues = [],
  onValuesChange,
  name,
  className,
  children,
  ...props
}: ComboBoxProps) {
  const [localValues, setLocalValues] = React.useState(defaultValues);
  const activeValues = values ?? localValues;

  function update_values(nextValues: string[]) {
    if (values === undefined) {
      setLocalValues(nextValues);
    }

    onValuesChange?.(nextValues);
  }

  function toggleValue(value: string, checked: boolean) {
    const nextValues = checked
      ? [...new Set([...activeValues, value])]
      : activeValues.filter((activeValue) => activeValue !== value);

    update_values(nextValues);
  }

  const contextValue = React.useMemo<ComboBoxContextValue>(() => ({
    values: activeValues,
    name,
    toggleValue,
  }), [activeValues, name]);

  return (
    <ComboBoxContext.Provider value={contextValue}>
      <div role="group" className={className} {...props}>
        {children}
      </div>
    </ComboBoxContext.Provider>
  );
}

/**
 * Props for an individual multi-select item.
 *
 * `ComboItem` is the primitive checkbox input. Labels and descriptive text should
 * be rendered next to it by the caller so component-level UIs can decide their
 * own spacing and hierarchy.
 */
export interface ComboItemProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> {
  value: string;
  onChange?: (value: string, checked: boolean) => void;
}

/**
 * Primitive checkbox item controlled by the nearest `ComboBox` when present.
 *
 * It can also be used standalone by passing native checkbox props. When used in a
 * `ComboBox`, it reads selected values from context and reports changes back via
 * `onValuesChange`.
 */
export const ComboItem = React.forwardRef<HTMLInputElement, ComboItemProps>(function ComboItem(
  { value, className, checked, name, onChange, ...props },
  ref,
) {
  const context = React.useContext(ComboBoxContext);
  const resolvedChecked = checked ?? context?.values.includes(value) ?? false;
  const resolvedName = name ?? context?.name;

  return (
    <input
      ref={ref}
      type="checkbox"
      name={resolvedName}
      value={value}
      checked={resolvedChecked}
      onChange={(event) => {
        onChange?.(value, event.target.checked);
        context?.toggleValue(value, event.target.checked);
      }}
      className={join_classes("accent-[rgb(var(--accent-rgb))]", className)}
      {...props}
    />
  );
});

/** Alias kept for callers that prefer group terminology. */
export const ComboGroup = ComboBox;
