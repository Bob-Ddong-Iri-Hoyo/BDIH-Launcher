import React from "react";
import { Download } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { DxmtVersion, InstallStatus, JadeiteVersion, WineVersion } from "../../Common/Types/Wine";
import { Button, Inline, Select, SelectMenuOption, Stack, Text } from "./Primitives";
import { label_from_status, StatusBadge, tone_from_status } from "./StatusBadge";

export type RuntimeVersion = WineVersion | DxmtVersion | JadeiteVersion;

export interface RuntimeVersionSelectProps<TVersion extends RuntimeVersion = RuntimeVersion> {
  label: string;
  value: string;
  versions: TVersion[];
  currentRecipeLabel?: string;
  onChange?: (versionId: string) => void;
  onInstall?: (versionId: string) => void;
}

/**
 * Runtime version selector with install state affordances.
 *
 * Use this anywhere users choose a Wine or DXMT runtime. It wraps the shared
 * Select primitive and adds installed/download/accessory actions consistently.
 */
export function RuntimeVersionSelect<TVersion extends RuntimeVersion>({
  label,
  value,
  versions,
  currentRecipeLabel,
  onChange,
  onInstall,
}: RuntimeVersionSelectProps<TVersion>) {
  const { t } = useTranslation();
  const options = runtime_options_from_versions(
    versions,
    value,
    currentRecipeLabel ?? t("main.recipeInfo.currentRecipe"),
  );
  const selectedVersion = versions.find((version) => version.id === value);

  return (
    <Stack className="gap-2 rounded-lg border border-white/10 bg-[#0b1020] p-3">
      <Inline className="items-center justify-between gap-3">
        <Text className="text-slate-500">{label}</Text>
        {selectedVersion ? <RuntimeStatusBadge version={selectedVersion} /> : null}
      </Inline>
      <Select
        value={value}
        options={options}
        onChange={(versionId) => onChange?.(versionId)}
        label={label}
        renderOptionAccessory={(option) => {
          const version = versions.find((candidateVersion) => candidateVersion.id === option.value);

          return version ? (
            <RuntimeOptionAccessory
              version={version}
              onInstall={onInstall}
            />
          ) : null;
        }}
      />
    </Stack>
  );
}

function RuntimeOptionAccessory({
  version,
  onInstall,
}: {
  version: RuntimeVersion;
  onInstall?: (versionId: string) => void;
}) {
  const { t } = useTranslation();
  const installed = is_runtime_available(version);
  const working = is_runtime_working(version.status);
  const canInstall = Boolean(onInstall && has_runtime_download(version));

  if (installed) {
    return (
      <span className="inline-flex w-24 justify-end">
        <StatusBadge label={t("main.recipeInfo.runtimeExists")} tone="success" className="h-7 w-24 px-2 text-[11px]" />
      </span>
    );
  }

  return (
    <span className="inline-flex w-24 justify-end">
      <Button
        type="button"
        size="sm"
        variant="glass"
        disabled={working || !canInstall}
        title={!canInstall ? t("main.recipeInfo.downloadUnavailable", { defaultValue: "다운로드 불가" }) : undefined}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!canInstall) {
            return;
          }
          onInstall?.(version.id);
        }}
        className="h-7 w-24 justify-center px-2 text-[11px]"
      >
        {working ? null : canInstall ? <Download size={12} /> : null}
        {working
          ? `${Math.round(version.progress)}%`
          : canInstall
            ? t("main.recipeInfo.downloadRuntime")
            : t("main.recipeInfo.downloadUnavailable", { defaultValue: "다운로드 불가" })}
      </Button>
    </span>
  );
}

function RuntimeStatusBadge({ version }: { version: RuntimeVersion }) {
  const { t } = useTranslation();
  const tone = is_runtime_available(version) ? "success" : tone_from_status(version.status);

  return (
    <StatusBadge
      label={is_runtime_available(version) ? t("main.recipeInfo.runtimeExists") : label_from_status(version.status)}
      tone={tone}
      className="h-6 px-2 text-[11px]"
    />
  );
}

function runtime_options_from_versions(
  versions: RuntimeVersion[],
  selectedVersionId: string,
  currentRecipeLabel: string,
): SelectMenuOption[] {
  const options = versions.map((version) => ({
    value: version.id,
    label: version.name,
    description: `${version.version} · ${label_from_status(version.status)}`,
  }));

  if (selectedVersionId && !options.some((option) => option.value === selectedVersionId)) {
    return [
      {
        value: selectedVersionId,
        label: selectedVersionId,
        description: currentRecipeLabel,
      },
      ...options,
    ];
  }

  return options;
}

function is_runtime_available(version: RuntimeVersion): boolean {
  return version.status === "installed" || version.status === "completed";
}

function is_runtime_working(status: InstallStatus): boolean {
  return status === "downloading" || status === "installing" || status === "extracting";
}

function has_runtime_download(version: RuntimeVersion): boolean {
  const downloadUrl = version.downloadUrl?.trim();
  if (!downloadUrl) {
    return false;
  }

  return !/^https:\/\/github\.com\/[^/]+\/[^/]+\/releases\/?$/i.test(downloadUrl);
}
