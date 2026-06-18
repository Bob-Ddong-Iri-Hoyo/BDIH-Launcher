import { Surface, Text } from "./Primitives";

export interface InfoRowProps {
  label: string;
  value?: string;
  breakAll?: boolean;
  onClickLabel?: (value: string) => void;
  onClickValue?: (value: string) => void;
}

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
