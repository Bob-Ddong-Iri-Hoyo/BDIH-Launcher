import React from "react";
import { ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Bottle } from "../Types/Bottle";
import { useDirectExecutableRunner } from "../Hooks/UseDirectExecutableRunner";
import { Button } from "./Primitives";
import { Dialog } from "./Dialog";
import { DirectExecutableActionForm } from "./DirectExecutableActionForm";

export function DirectExecutableAction({
  bottle,
  wineRuntimePath,
  onRegisterBottleExecutable,
}: {
  bottle: Bottle;
  wineRuntimePath?: string;
  onRegisterBottleExecutable?: (bottleId: string, executablePath: string) => void;
}) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = React.useState(false);
  const runner = useDirectExecutableRunner({
    bottle,
    wineRuntimePath,
    onRegisterBottleExecutable,
    onStarted: () => setIsOpen(false),
  });

  return (
    <>
      <Button
        variant="primary"
        size="md"
        className="min-w-32"
        icon={<ExternalLink size={16} />}
        onClick={() => setIsOpen(true)}
      >
        {t("main.runner.title")}
      </Button>
      <Dialog
        open={isOpen}
        title={t("main.runner.title")}
        description={t("main.runner.description")}
        tone="info"
        icon={ExternalLink}
        placement="center"
        widthClassName="max-w-2xl"
        onClose={() => setIsOpen(false)}
        actions={[
          {
            label: t("common.actions.cancel"),
            variant: "secondary",
            onClick: () => setIsOpen(false),
          },
          {
            label: t("main.runner.run"),
            icon: ExternalLink,
            variant: "primary",
            disabled: !runner.canRun,
            onClick: () => void runner.runExecutable(),
          },
        ]}
      >
        <DirectExecutableActionForm runner={runner} />
      </Dialog>
    </>
  );
}
