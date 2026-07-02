import type {
  WineLauncherOptionDefinition,
  WineLauncherOptionGroup,
  WineLauncherOptionPreset,
  WineLauncherOptionsManifest,
  WineLauncherOptionValue,
} from "../Types/Wine";

/**
 * Parse a BDHI Wine launcher-options manifest.
 *
 * The manifest is intentionally artifact-local: newer Wine packages may add
 * unknown fields or option groups. The launcher keeps only the vocabulary it
 * knows and ignores the rest so old launcher builds can still run new Wine
 * packages safely.
 */
export function parse_wine_launcher_options_manifest(raw: string): WineLauncherOptionsManifest | undefined {
  return normalize_wine_launcher_options_manifest(JSON.parse(raw));
}

/**
 * Normalize untrusted manifest JSON into the renderer/main shared type.
 *
 * This is used for GitHub sidecar JSON and for the unpacked Wine root copy at
 * `share/bdhi/launcher-options.json`.
 */
export function normalize_wine_launcher_options_manifest(value: unknown): WineLauncherOptionsManifest | undefined {
  if (!is_record(value)) {
    return undefined;
  }

  const groups = Array.isArray(value.groups)
    ? value.groups
        .map(normalize_option_group)
        .filter((group): group is WineLauncherOptionGroup => Boolean(group))
    : [];

  if (groups.length === 0) {
    return undefined;
  }

  return {
    schemaVersion: typeof value.schemaVersion === "number" ? value.schemaVersion : 1,
    id: string_or_default(value.id, "bdhi.wine.launcher-options"),
    name: string_or_default(value.name, "Wine launcher options"),
    wineFamilies: array_of_strings(value.wineFamilies),
    launcherContract: is_record(value.launcherContract)
      ? { ...value.launcherContract }
      : undefined,
    groups,
  };
}

/**
 * Apply manifest defaults as process environment values.
 *
 * Only concrete defaults are exported. `null` means "leave unset" so patched
 * Wine or wrapper defaults such as `unsetBehavior` can still take effect.
 * App-specific launch options are expected to run after this and override any
 * value the user explicitly changed.
 */
export function apply_wine_launcher_options_manifest_defaults(
  env: Record<string, string>,
  manifest?: WineLauncherOptionsManifest,
): void {
  for (const option of manifest?.groups.flatMap((group) => group.options) ?? []) {
    if (!option.name || option.default === null || option.default === undefined) {
      continue;
    }

    env[option.name] = String(option.default);
  }
}

function normalize_option_group(value: unknown): WineLauncherOptionGroup | undefined {
  if (!is_record(value)) {
    return undefined;
  }

  const options = Array.isArray(value.options)
    ? value.options
        .map(normalize_option_definition)
        .filter((option): option is WineLauncherOptionDefinition => Boolean(option))
    : [];

  if (options.length === 0) {
    return undefined;
  }

  return {
    id: string_or_default(value.id, "options"),
    title: string_or_default(value.title, string_or_default(value.id, "Options")),
    options,
  };
}

function normalize_option_definition(value: unknown): WineLauncherOptionDefinition | undefined {
  if (!is_record(value)) {
    return undefined;
  }

  const name = string_or_default(value.name, "");

  if (!name) {
    return undefined;
  }

  return {
    name,
    type: string_or_default(value.type, "string"),
    values: array_of_strings(value.values),
    default: launcher_option_value(value.default),
    unsetBehavior: launcher_option_value(value.unsetBehavior),
    owner: optional_string(value.owner),
    scope: array_of_strings(value.scope),
    restartWineserver: typeof value.restartWineserver === "boolean" ? value.restartWineserver : undefined,
    ui: optional_string(value.ui),
    label: optional_string(value.label),
    description: optional_string(value.description),
    presets: normalize_presets(value.presets),
  };
}

function normalize_presets(value: unknown): WineLauncherOptionPreset[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const presets = value
    .filter(is_record)
    .map((preset): WineLauncherOptionPreset | undefined => {
      const id = string_or_default(preset.id, "");
      const label = string_or_default(preset.label, id);
      const presetValue = string_or_default(preset.value, "");

      return id && label
        ? {
            id,
            label,
            value: presetValue,
          }
        : undefined;
    })
    .filter((preset): preset is WineLauncherOptionPreset => Boolean(preset));

  return presets.length > 0 ? presets : undefined;
}

function launcher_option_value(value: unknown): WineLauncherOptionValue | undefined {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  return undefined;
}

function array_of_strings(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const strings = value.filter((item): item is string => typeof item === "string" && item.length > 0);

  return strings.length > 0 ? strings : undefined;
}

function optional_string(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function string_or_default(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function is_record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
