export function update_inline_dxmt_config(
  config: string | undefined,
  updates: ReadonlyArray<readonly [name: string, value: string | undefined]>,
): string | undefined {
  const updateNames = new Set(updates.map(([name]) => name));
  const parts = (config ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => {
      if (part.length === 0) {
        return false;
      }

      return !updateNames.has(part.split("=", 1)[0]?.trim() ?? "");
    });

  for (const [name, value] of updates) {
    if (value !== undefined) {
      parts.push(`${name}=${value}`);
    }
  }

  return parts.length > 0 ? `${parts.join(";")};` : undefined;
}
