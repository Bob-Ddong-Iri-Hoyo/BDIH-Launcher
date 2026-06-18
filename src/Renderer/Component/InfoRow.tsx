import { Surface, Text } from "./Primitives";

/** Props for compact label/value rows used in detail dialogs. */
export interface InfoRowProps {
  label: string;
  value?: string;
  breakAll?: boolean;
  onClickLabel?: (value: string) => void;
  onClickValue?: (value: string) => void;
}

/**
 * Compact label/value display row.
 *
 * Use this in dialogs or metadata panels when values should align consistently
 * and long paths or version strings need safe truncation/wrapping.
 */
export function InfoRow({
  label,
  value,
  breakAll = false,
  onClickLabel,
  onClickValue,
}: InfoRowProps) {
  return (
    <Surface tone="deep" padding="sm">
      <Text tone="muted" size="xs" onClick={() => onClickLabel?.(label)}>
        {label}
      </Text>
      <Text
        tone="body"
        size="xs"
        className={`mt-1 ${breakAll ? "break-all" : "truncate"}`}
        onClick={() => onClickValue?.(value || "-")}
      >
        {value || "-"}
      </Text>
    </Surface>
  );
}
