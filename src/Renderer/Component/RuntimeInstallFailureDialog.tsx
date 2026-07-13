import React from "react";
import { useTranslation } from "react-i18next";
import type { RuntimeInstallFailure } from "../Store/UseSystemStore";
import { Dialog } from "./Dialog";
import { Stack, Text } from "./Primitives";

export interface RuntimeInstallFailureDialogProps {
  failure: RuntimeInstallFailure | null;
  onClose: () => void;
}

/** Explains a failed runtime installation and preserves the original diagnostic message. */
export function RuntimeInstallFailureDialog({
  failure,
  onClose,
}: RuntimeInstallFailureDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog
      open={Boolean(failure)}
      title={t("main.runtimeInstallFailure.title")}
      description={failure
        ? t("main.runtimeInstallFailure.description", {
            resource: failure.resource,
            versionId: failure.versionId,
          })
        : undefined}
      tone={failure?.reason === "cancelled" ? "warning" : "danger"}
      placement="center"
      widthClassName="max-w-xl"
      onClose={onClose}
      actions={[
        {
          label: t("common.actions.close"),
          variant: "primary",
          autoFocus: true,
          onClick: onClose,
        },
      ]}
    >
      {failure ? (
        <Stack className="gap-3">
          <Text className="rounded-lg border border-red-300/25 bg-red-400/10 px-3 py-2 text-sm font-medium leading-6 text-red-100">
            {t(`main.runtimeInstallFailure.reasons.${failure.reason}.title`)}
          </Text>
          <Text className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs leading-5 text-slate-300">
            {t(`main.runtimeInstallFailure.reasons.${failure.reason}.description`)}
          </Text>
          <Stack className="gap-1">
            <Text className="text-xs font-medium text-slate-400">
              {t("main.runtimeInstallFailure.technicalDetails")}
            </Text>
            <Text className="max-h-32 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-white/10 bg-black/20 px-3 py-2 font-mono text-[11px] leading-5 text-slate-400">
              {failure.details}
            </Text>
          </Stack>
        </Stack>
      ) : null}
    </Dialog>
  );
}
