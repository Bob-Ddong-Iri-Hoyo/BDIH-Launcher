import React from "react";
import { AlertTriangle, FolderOpen, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { DxmtVersion, JadeiteVersion, WineVersion } from "../../Common/Types/Wine";
import type { Bottle } from "../Types/Bottle";
import { Dialog } from "./Dialog";
import { ProgressBar } from "./ProgressBar";
import { Box, Button, Inline, Stack, Text } from "./Primitives";
import { RuntimeVersionSelect } from "./RuntimeVersionSelect";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog";

type RecipeChangePatch = Partial<Pick<Bottle, "wineVersionId" | "dxmtVersionId" | "jadeiteVersionId">> & {
  validateOnly?: boolean;
};
type RecipeApplyProgressReporter = (update: { progress: number; message: string }) => void;

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
  onApplyRecipeChange,
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
  onApplyRecipeChange?: (patch: RecipeChangePatch, reportProgress: RecipeApplyProgressReporter) => Promise<void> | void;
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
  const [isApplyConfirmOpen, setIsApplyConfirmOpen] = React.useState(false);
  const [isCloseConfirmOpen, setIsCloseConfirmOpen] = React.useState(false);
  const [isApplyModalOpen, setIsApplyModalOpen] = React.useState(false);
  const [applyProgress, setApplyProgress] = React.useState(0);
  const [applyMessage, setApplyMessage] = React.useState("");
  const [applyErrorMessage, setApplyErrorMessage] = React.useState("");
  const hasRecipeChanges =
    draftWineVersionId !== bottle.wineVersionId
    || draftDxmtVersionId !== (bottle.dxmtVersionId || "")
    || (draftJadeiteVersionId || fallbackJadeiteVersionId) !== (bottle.jadeiteVersionId || fallbackJadeiteVersionId);
  const hasWineRecipeChange = draftWineVersionId !== bottle.wineVersionId;
  const hasDxmtRecipeChange = draftDxmtVersionId !== (bottle.dxmtVersionId || "");
  const hasJadeiteRecipeChange =
    (draftJadeiteVersionId || fallbackJadeiteVersionId) !== (bottle.jadeiteVersionId || fallbackJadeiteVersionId);
  const isApplyComplete = applyProgress >= 100;
  const canCloseApplyModal = Boolean(applyErrorMessage) || isApplyComplete;

  React.useEffect(() => {
    if (!open) {
      return;
    }

    setDraftWineVersionId(bottle.wineVersionId);
    setDraftDxmtVersionId(bottle.dxmtVersionId || "");
    setDraftJadeiteVersionId(bottle.jadeiteVersionId || "");
    setStatusMessage("");
    setIsApplyConfirmOpen(false);
    setIsCloseConfirmOpen(false);
    setApplyErrorMessage("");
  }, [bottle.dxmtVersionId, bottle.jadeiteVersionId, bottle.wineVersionId, open]);

  React.useEffect(() => {
    if (!open) {
      return;
    }

    setStatusMessage(hasRecipeChanges ? t("main.recipeInfo.pendingChanges") : "");
  }, [hasRecipeChanges, open, t]);

  function apply_recipe_changes() {
    if (!hasRecipeChanges) {
      void confirm_apply_recipe_changes(true);
      return;
    }

    setIsApplyConfirmOpen(true);
  }

  function request_close() {
    if (hasRecipeChanges) {
      setIsCloseConfirmOpen(true);
      return;
    }

    onClose();
  }

  function cancel_apply_recipe_changes() {
    setDraftWineVersionId(bottle.wineVersionId);
    setDraftDxmtVersionId(bottle.dxmtVersionId || "");
    setDraftJadeiteVersionId(bottle.jadeiteVersionId || "");
    setStatusMessage("");
    setIsApplyConfirmOpen(false);
  }

  async function confirm_apply_recipe_changes(validateOnly = false) {
    const patch: RecipeChangePatch = {
      wineVersionId: draftWineVersionId,
      dxmtVersionId: draftDxmtVersionId,
      jadeiteVersionId: draftJadeiteVersionId || fallbackJadeiteVersionId,
      validateOnly,
    };

    setIsApplyConfirmOpen(false);
    setApplyErrorMessage("");
    setApplyProgress(8);
    setApplyMessage(validateOnly
      ? t("main.recipeInfo.validatingRecipe")
      : t("main.recipeInfo.applyStoppingApps", { defaultValue: "앱들 종료중..." }));
    setIsApplyModalOpen(true);
    onClose();

    try {
      if (onApplyRecipeChange) {
        await onApplyRecipeChange(patch, ({ progress, message }) => {
          setApplyProgress(progress);
          setApplyMessage(message);
        });
      } else {
        setApplyProgress(36);
        setApplyMessage(t("main.recipeInfo.applySaving"));
        if (!validateOnly) {
          onWineVersionChange?.(draftWineVersionId);
          onDxmtVersionChange?.(draftDxmtVersionId);
          onJadeiteVersionChange?.(draftJadeiteVersionId || fallbackJadeiteVersionId);
        }
      }

      setApplyProgress(100);
      setApplyMessage(validateOnly ? t("main.recipeInfo.validationComplete") : t("main.recipeInfo.applyComplete"));
      setStatusMessage(validateOnly ? t("main.recipeInfo.validationSkipped") : t("main.recipeInfo.applied"));
      window.setTimeout(() => {
        setIsApplyModalOpen(false);
      }, 900);
    } catch (error) {
      setApplyProgress(100);
      setApplyErrorMessage(error instanceof Error ? error.message : String(error));
      setApplyMessage(t("main.recipeInfo.applyFailed", { defaultValue: "레시피 변경에 실패했습니다." }));
    }
  }

  return (
    <>
      <Dialog
        open={open && !isApplyModalOpen && !isApplyConfirmOpen && !isCloseConfirmOpen}
        title={t("main.recipeSettings")}
        description={t("main.recipeSettingsDescription")}
        tone="info"
        icon={Settings}
        placement="center"
        widthClassName="max-w-xl"
        onClose={request_close}
        actions={[
          {
            label: t("common.actions.close"),
            variant: "secondary",
            onClick: request_close,
          },
          {
            label: t("main.recipeInfo.applyChanges"),
            icon: Settings,
            variant: "primary",
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

      <UnsavedChangesDialog
        open={open && isCloseConfirmOpen}
        onContinueEditing={() => setIsCloseConfirmOpen(false)}
        onDiscard={() => {
          setIsCloseConfirmOpen(false);
          onClose();
        }}
        onSave={() => {
          setIsCloseConfirmOpen(false);
          setIsApplyConfirmOpen(true);
        }}
      />

      <Dialog
        open={isApplyConfirmOpen}
        title={t("main.recipeInfo.applyWarningTitle", { defaultValue: "레시피를 변경할까요?" })}
        description={t("main.recipeInfo.applyWarningDescription", {
          defaultValue: "레시피를 변경하려면 이 Bottle에서 실행 중인 모든 앱을 먼저 종료해야 합니다. 계속하면 실행 중인 앱과 Wine prefix session을 모두 종료한 뒤 Wine/DXMT 설정을 변경합니다.",
        })}
        tone="warning"
        icon={AlertTriangle}
        placement="center"
        widthClassName="max-w-xl"
        onClose={cancel_apply_recipe_changes}
        actions={[
          {
            label: t("common.actions.cancel"),
            variant: "secondary",
            onClick: cancel_apply_recipe_changes,
          },
          {
            label: t("main.recipeInfo.applyWarningAccept", { defaultValue: "앱 종료 후 변경" }),
            variant: "danger",
            onClick: () => void confirm_apply_recipe_changes(),
          },
        ]}
      >
        <Stack className="gap-3">
          <Text className="rounded-lg border border-amber-300/25 bg-amber-400/10 px-3 py-2 text-xs leading-5 text-amber-100">
            {t("main.recipeInfo.applyWarningBody")}
          </Text>

          <Box className="rounded-lg border border-white/10 bg-[#0b1020] p-3">
            <Text className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {t("main.recipeInfo.applyWarningChangesTitle")}
            </Text>
            <Box as="ul" className="mt-2 space-y-2 pl-4 text-xs leading-5 text-slate-300">
              {hasWineRecipeChange ? (
                <Text as="li" className="list-disc">
                  {t("main.recipeInfo.applyWarningVersionChange", {
                    runtime: t("main.recipeInfo.wineVersion"),
                    from: bottle.wineVersionId || "-",
                    to: draftWineVersionId || "-",
                  })}
                </Text>
              ) : null}
              {hasDxmtRecipeChange ? (
                <Text as="li" className="list-disc">
                  {t("main.recipeInfo.applyWarningVersionChange", {
                    runtime: t("main.recipeInfo.dxmtVersion"),
                    from: bottle.dxmtVersionId || "-",
                    to: draftDxmtVersionId || "-",
                  })}
                </Text>
              ) : null}
              {hasJadeiteRecipeChange ? (
                <Text as="li" className="list-disc">
                  {t("main.recipeInfo.applyWarningVersionChange", {
                    runtime: "Jadeite",
                    from: bottle.jadeiteVersionId || fallbackJadeiteVersionId || "-",
                    to: draftJadeiteVersionId || fallbackJadeiteVersionId || "-",
                  })}
                </Text>
              ) : null}
              <Text as="li" className="list-disc">
                {t("main.recipeInfo.applyWarningPrefixUpdate")}
              </Text>
            </Box>
          </Box>

          {hasWineRecipeChange || hasDxmtRecipeChange ? (
            <Stack className="gap-1 rounded-lg border border-sky-300/20 bg-sky-400/[0.08] px-3 py-2 text-xs leading-5 text-sky-100">
              <Text>{t("main.recipeInfo.applyWarningShaderCacheReset")}</Text>
              <Text className="text-sky-100/70">{t("main.recipeInfo.applyWarningOldCachePreserved")}</Text>
            </Stack>
          ) : null}

          <Text className="text-xs leading-5 text-slate-500">
            {t("main.recipeInfo.applyWarningCancelRollback")}
          </Text>
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
        onClose={canCloseApplyModal ? () => setIsApplyModalOpen(false) : undefined}
        closeOnBackdrop={canCloseApplyModal}
        showCloseButton={canCloseApplyModal}
        actions={[]}
      >
        <Stack className="gap-4">
          {applyErrorMessage ? (
            <Text className="rounded-lg border border-rose-300/25 bg-rose-400/10 px-3 py-2 text-sm font-semibold leading-5 text-rose-100">
              {applyMessage}
              <br />
              <span className="text-xs font-normal text-rose-100/80">{applyErrorMessage}</span>
            </Text>
          ) : isApplyComplete ? (
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
