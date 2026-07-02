import React from "react";
import { FolderOpen, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { DxmtVersion, JadeiteVersion, WineVersion } from "../../Common/Types/Wine";
import type { Bottle } from "../Types/Bottle";
import { Dialog } from "./Dialog";
import { ProgressBar } from "./ProgressBar";
import { Box, Button, Inline, Stack, Text } from "./Primitives";
import { RuntimeVersionSelect } from "./RuntimeVersionSelect";

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
  wineVersions = [],
  dxmtVersions = [],
  jadeiteVersions = [],
  onWineVersionChange,
  onDxmtVersionChange,
  onJadeiteVersionChange,
  onInstallWineVersion,
  onInstallDxmtVersion,
  onInstallJadeiteVersion,
}: {
  bottle: Bottle;
  open: boolean;
  onClose: () => void;
  onRevealBottle?: (path: string) => void;
  wineVersions?: WineVersion[];
  dxmtVersions?: DxmtVersion[];
  jadeiteVersions?: JadeiteVersion[];
  onWineVersionChange?: (versionId: string) => void;
  onDxmtVersionChange?: (versionId: string) => void;
  onJadeiteVersionChange?: (versionId: string) => void;
  onInstallWineVersion?: (versionId: string) => void;
  onInstallDxmtVersion?: (versionId: string) => void;
  onInstallJadeiteVersion?: (versionId: string) => void;
}) {
  const { t } = useTranslation();
  const fallbackJadeiteVersionId = jadeiteVersions[0]?.id || "";
  const [draftWineVersionId, setDraftWineVersionId] = React.useState(bottle.wineVersionId);
  const [draftDxmtVersionId, setDraftDxmtVersionId] = React.useState(bottle.dxmtVersionId || "");
  const [draftJadeiteVersionId, setDraftJadeiteVersionId] = React.useState(bottle.jadeiteVersionId || "");
  const [statusMessage, setStatusMessage] = React.useState("");
  const [isApplyModalOpen, setIsApplyModalOpen] = React.useState(false);
  const [applyProgress, setApplyProgress] = React.useState(0);
  const [applyMessage, setApplyMessage] = React.useState("");
  const hasRecipeChanges =
    draftWineVersionId !== bottle.wineVersionId
    || draftDxmtVersionId !== (bottle.dxmtVersionId || "")
    || (draftJadeiteVersionId || fallbackJadeiteVersionId) !== (bottle.jadeiteVersionId || fallbackJadeiteVersionId);
  const isApplyComplete = applyProgress >= 100;

  React.useEffect(() => {
    if (!open) {
      return;
    }

    setDraftWineVersionId(bottle.wineVersionId);
    setDraftDxmtVersionId(bottle.dxmtVersionId || "");
    setDraftJadeiteVersionId(bottle.jadeiteVersionId || "");
    setStatusMessage("");
  }, [bottle.dxmtVersionId, bottle.jadeiteVersionId, bottle.wineVersionId, open]);

  function apply_recipe_changes() {
    if (!hasRecipeChanges) {
      return;
    }

    setApplyProgress(8);
    setApplyMessage(t("main.recipeInfo.applyPreparing"));
    setIsApplyModalOpen(true);
    onClose();

    window.setTimeout(() => {
      setApplyProgress(36);
      setApplyMessage(t("main.recipeInfo.applySaving"));
      onWineVersionChange?.(draftWineVersionId);
      onDxmtVersionChange?.(draftDxmtVersionId);
      onJadeiteVersionChange?.(draftJadeiteVersionId || fallbackJadeiteVersionId);
    }, 180);

    window.setTimeout(() => {
      setApplyProgress(72);
      setApplyMessage(t("main.recipeInfo.applyRuntime"));
    }, 620);

    window.setTimeout(() => {
      setApplyProgress(100);
      setApplyMessage(t("main.recipeInfo.applyComplete"));
      setStatusMessage(t("main.recipeInfo.applied"));
    }, 1040);

    window.setTimeout(() => {
      setIsApplyModalOpen(false);
    }, 1450);
  }

  return (
    <>
      <Dialog
        open={open && !isApplyModalOpen}
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
          {
            label: t("main.recipeInfo.applyChanges"),
            icon: Settings,
            variant: "primary",
            disabled: !hasRecipeChanges,
            onClick: apply_recipe_changes,
          },
        ]}
      >
        <Stack className="gap-3 text-xs">
          <RuntimeVersionSelect
            label={t("main.recipeInfo.wineVersion")}
            value={draftWineVersionId}
            versions={wineVersions}
            currentRecipeLabel={t("main.recipeInfo.currentRecipe")}
            onChange={(versionId) => {
              setDraftWineVersionId(versionId);
              setStatusMessage(t("main.recipeInfo.pendingChanges"));
            }}
            onInstall={onInstallWineVersion}
          />
          <RuntimeVersionSelect
            label={t("main.recipeInfo.dxmtVersion")}
            value={draftDxmtVersionId || dxmtVersions[0]?.id || ""}
            versions={dxmtVersions}
            currentRecipeLabel={t("main.recipeInfo.currentRecipe")}
            onChange={(versionId) => {
              setDraftDxmtVersionId(versionId);
              setStatusMessage(t("main.recipeInfo.pendingChanges"));
            }}
            onInstall={onInstallDxmtVersion}
          />
          {jadeiteVersions.length > 0 ? (
            <RuntimeVersionSelect
              label="Jadeite"
              value={draftJadeiteVersionId || fallbackJadeiteVersionId}
              versions={jadeiteVersions}
              currentRecipeLabel={t("main.recipeInfo.currentRecipe")}
              onChange={(versionId) => {
                setDraftJadeiteVersionId(versionId);
                setStatusMessage(t("main.recipeInfo.pendingChanges"));
              }}
              onInstall={onInstallJadeiteVersion}
            />
          ) : null}
          {statusMessage ? (
            <Text className={`rounded-lg border px-3 py-2 text-xs leading-5 ${hasRecipeChanges ? "border-amber-300/25 bg-amber-400/10 text-amber-100" : "border-emerald-300/25 bg-emerald-400/10 text-emerald-100"}`}>
              {statusMessage}
            </Text>
          ) : null}
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
        </Stack>
      </Dialog>

      <Dialog
        open={isApplyModalOpen}
        title={t("main.recipeInfo.applyModalTitle")}
        description={t("main.recipeInfo.applyModalDescription")}
        tone="info"
        icon={Settings}
        placement="center"
        widthClassName="max-w-md"
        onClose={() => undefined}
        actions={[]}
      >
        <Stack className="gap-4">
          {isApplyComplete ? (
            <Text className="rounded-lg border border-emerald-300/25 bg-emerald-400/10 px-3 py-2 text-sm font-semibold leading-5 text-emerald-100">
              {applyMessage || t("main.recipeInfo.applyComplete")}
            </Text>
          ) : (
            <>
              <Text className="rounded-lg border border-amber-300/25 bg-amber-400/10 px-3 py-2 text-xs leading-5 text-amber-100">
                {t("main.recipeInfo.doNotQuit")}
              </Text>
              <Stack className="gap-2">
                <Inline className="items-center justify-between gap-3">
                  <Text className="min-w-0 truncate text-sm font-semibold text-slate-100">
                    {applyMessage || t("main.recipeInfo.applyPreparing")}
                  </Text>
                  <Text className="shrink-0 font-mono text-xs text-slate-400">
                    {Math.round(applyProgress)}%
                  </Text>
                </Inline>
                <ProgressBar
                  progressValue={applyProgress}
                  showValue={false}
                  size="sm"
                  tone="emerald"
                  animated
                />
              </Stack>
            </>
          )}
        </Stack>
      </Dialog>
    </>
  );
}
