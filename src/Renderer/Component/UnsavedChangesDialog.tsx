import React from "react";
import { Save } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Dialog } from "./Dialog";

export interface UnsavedChangesDialogProps {
  open: boolean;
  onContinueEditing: () => void;
  onDiscard: () => void;
  onSave: () => void;
  disabled?: boolean;
}

/** Shared navigation guard for editable modal views. */
export function UnsavedChangesDialog({
  open,
  onContinueEditing,
  onDiscard,
  onSave,
  disabled = false,
}: UnsavedChangesDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog
      open={open}
      title={t("main.unsavedChanges.title")}
      description={t("main.unsavedChanges.description")}
      tone="warning"
      placement="center"
      widthClassName="max-w-md"
      onClose={disabled ? undefined : onContinueEditing}
      actions={[
        {
          label: t("main.unsavedChanges.continueEditing"),
          variant: "secondary",
          disabled,
          onClick: onContinueEditing,
        },
        {
          label: t("main.unsavedChanges.discard"),
          variant: "danger",
          disabled,
          onClick: onDiscard,
        },
        {
          label: t("main.unsavedChanges.save"),
          icon: Save,
          variant: "primary",
          disabled,
          autoFocus: true,
          onClick: onSave,
        },
      ]}
    />
  );
}
