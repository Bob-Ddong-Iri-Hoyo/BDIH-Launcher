import React from "react";
import { ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { BottleLaunchOptionsPayload, BottlePrefixMetadataPayload } from "../../Common/Types/IPC";
import type { WineLauncherOptionsManifest } from "../../Common/Types/Wine";
import type { Bottle } from "../Types/Bottle";
import { useDirectExecutableRunner } from "../Hooks/UseDirectExecutableRunner";
import { Button } from "./Primitives";
import { Dialog } from "./Dialog";
import { DirectExecutableActionForm } from "./DirectExecutableActionForm";

/**
 * Direct executable launcher entry point for a bottle.
 *
 * Use this in bottle action bars when users need to run a manually selected EXE
 * or register it as a reusable app without going through Steam or HoyoPlay.
 */
export function DirectExecutableAction({
  bottle,
  wineRuntimePath,
  dxmtPackagePath,
  launcherOptionsManifest,
  onRegisterBottleExecutable,
  onUpdateBottlePrefixes,
  onDeleteBottlePrefix,
}: {
  bottle: Bottle;
  wineRuntimePath?: string;
  dxmtPackagePath?: string;
  launcherOptionsManifest?: WineLauncherOptionsManifest;
  onRegisterBottleExecutable?: (bottleId: string, executablePath: string, prefixPath: string, launchOptions?: BottleLaunchOptionsPayload) => void;
  onUpdateBottlePrefixes?: (bottleId: string, prefixes: BottlePrefixMetadataPayload[]) => void;
  onDeleteBottlePrefix?: (bottleId: string, prefix: BottlePrefixMetadataPayload) => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = React.useState(false);
  const runner = useDirectExecutableRunner({
    bottle,
    wineRuntimePath,
    dxmtPackagePath,
    launcherOptionsManifest,
    onRegisterBottleExecutable,
    onUpdateBottlePrefixes,
    onDeleteBottlePrefix,
    onStarted: () => setIsOpen(false),
  });

  return (
    <>
      <Button
        variant="primary"
        size="md"
        className="w-full min-w-0 justify-center"
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
