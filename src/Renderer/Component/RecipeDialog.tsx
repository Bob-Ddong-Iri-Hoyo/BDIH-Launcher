import React from "react";
import { FolderOpen, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Bottle } from "../Types/Bottle";
import { Dialog } from "./Dialog";
import { InfoRow } from "./InfoRow";
import { Box, Button, Inline, Text } from "./Primitives";

/**
 * Bottle recipe detail dialog.
 *
 * Use this to show the runtime recipe attached to a bottle, including Wine,
 * DXMT, and prefix location, without crowding the main bottle app grid.
 */
export function RecipeDialog({
  bottle,
  open,
  onClose,
  onRevealBottle,
}: {
  bottle: Bottle;
  open: boolean;
  onClose: () => void;
  onRevealBottle?: (path: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <Dialog
      open={open}
      title={t("main.recipeSettings")}
      description={t("main.recipeSettingsDescription")}
      tone="info"
      icon={Settings}
      placement="center"
      widthClassName="max-w-xl"
      onClose={onClose}
      actions={[
        {
          label: t("common.actions.close"),
          variant: "secondary",
          onClick: onClose,
        },
      ]}
    >
      <Box className="grid gap-3 text-xs">
        <InfoRow label={t("main.recipeInfo.wineVersion")} value={bottle.wineVersionId} />
        <InfoRow label={t("main.recipeInfo.dxmtVersion")} value={bottle.dxmtVersionId || "-"} />
        <Box className="rounded-lg border border-white/10 bg-[#0b1020] p-3">
          <Inline className="mb-2 flex-wrap items-center justify-between gap-3">
            <Text className="text-slate-500">{t("main.recipeInfo.prefixPath")}</Text>
            <Button
              type="button"
              onClick={() => onRevealBottle?.(bottle.path)}
              className="inline-flex h-8 shrink-0 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
            >
              <FolderOpen size={13} />
              {t("main.bottleInfo.openInFinder")}
            </Button>
          </Inline>
          <Text className="break-all text-slate-300">{bottle.path || "-"}</Text>
        </Box>
      </Box>
    </Dialog>
  );
}
