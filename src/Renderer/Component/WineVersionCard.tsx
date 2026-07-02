import React from "react";
import { useTranslation } from "react-i18next";
import { Download, FolderOpen, Wine } from "lucide-react";
import { WineVersion } from "../../Common/Types/Wine";
import { Button, Inline, InlineText, ListItem, ListItemBody, ListItemDescription, ListItemIcon, ListItemTitle, ProgressBar as PrimitiveProgressBar } from "./Primitives";
import { StatusBadge, label_from_status, tone_from_status } from "./StatusBadge";

/** Props for a full Wine version card used in runtime lists. */
export interface WineVersionCardProps {
  version: WineVersion;
  isSelected?: boolean;
  installPath?: string;
  showInstallAction?: boolean;
  onSelect?: (versionId: string) => void;
  onInstall?: (versionId: string) => void;
}

/**
 * Full-size Wine runtime card.
 *
 * Use this when a view needs richer runtime presentation than the compact
 * download rows, including selected state, install path, status, and progress.
 */
export function WineVersionCard({
  version,
  isSelected = false,
  installPath,
  showInstallAction = true,
  onSelect,
  onInstall,
}: WineVersionCardProps) {
  const { t } = useTranslation();
  const isWorking = ["downloading", "installing", "extracting"].includes(version.status);
  const canInstall = version.status === "available" || version.status === "idle" || version.status === "error";
  const progress = Math.max(0, Math.min(100, Math.round(version.progress ?? 0)));

  return (
    <ListItem
      as="article"
      density="comfortable"
      tone={isSelected ? "selected" : "default"}
      className="flex-col rounded-lg p-4"
    >
      <Inline className="items-start justify-between gap-3">
        <Button type="button" className="flex min-w-0 items-start gap-3 text-left" onClick={() => onSelect?.(version.id)}>
          <ListItemIcon className="accent-text flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-800 ring-1 ring-white/10">
            <Wine size={21} />
          </ListItemIcon>
          <ListItemBody className="gap-1">
            <ListItemTitle>{version.name}</ListItemTitle>
            <ListItemDescription>
              {version.type === "official" ? t("wine.official") : t("wine.custom")} · {version.version}
            </ListItemDescription>
          </ListItemBody>
        </Button>
        <StatusBadge label={label_from_status(version.status, t)} tone={tone_from_status(version.status)} />
      </Inline>

      <Inline className="mt-4 items-center gap-2">
        <PrimitiveProgressBar value={progress} size="sm" tone={isWorking ? "blue" : "emerald"} animated={isWorking} />
        <InlineText className="w-10 text-right text-xs font-semibold text-slate-400">{progress}%</InlineText>
      </Inline>

      <Inline className="mt-4 items-center justify-between gap-3">
        <Inline className="min-w-0 items-center gap-2 text-xs text-slate-500">
          <FolderOpen size={14} className="shrink-0" />
          <InlineText className="truncate">{version.path ?? installPath ?? t("wine.noInstallPath")}</InlineText>
        </Inline>
        {showInstallAction ? (
          <Button
            type="button"
            disabled={!canInstall}
            onClick={() => onInstall?.(version.id)}
            className="accent-primary inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-500"
          >
            <Download size={14} />
            {t("common.actions.install")}
          </Button>
        ) : null}
      </Inline>
    </ListItem>
  );
}
