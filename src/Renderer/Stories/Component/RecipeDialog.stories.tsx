import React from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { RecipeDialog } from "../../Component/RecipeDialog";
import { Button, Inline, Stack, Text } from "../../Component/Primitives";
import type { Bottle } from "../../Types/Bottle";
import type { DxmtVersion, WineVersion } from "../../../Common/Types/Wine";
import { mockBottle, mockDxmtVersions, mockWineVersions } from "./mockData";

const meta: Meta<typeof RecipeDialog> = {
  title: "Component/RecipeDialog",
  component: RecipeDialog,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    bottle: mockBottle,
    open: true,
    onClose: () => undefined,
    onRevealBottle: () => undefined,
    wineVersions: mockWineVersions,
    dxmtVersions: mockDxmtVersions,
    onWineVersionChange: () => undefined,
    onDxmtVersionChange: () => undefined,
    onInstallWineVersion: () => undefined,
    onInstallDxmtVersion: () => undefined,
  },
};

export default meta;
type Story = StoryObj<typeof RecipeDialog>;

export const Open: Story = {
  render: (args) => (
    <div className="min-h-dvh bg-[#0b1020] p-6 text-slate-100">
      <RecipeDialog {...args} />
    </div>
  ),
};

export const RuntimeRecipeApplyLab: Story = {
  name: "Runtime recipe apply lab",
  render: () => <RecipeDialogRuntimeLab />,
};

function RecipeDialogRuntimeLab() {
  const [open, setOpen] = React.useState(true);
  const [bottle, setBottle] = React.useState<Bottle>({
    ...mockBottle,
    wineVersionId: mockWineVersions[0].id,
    dxmtVersionId: mockDxmtVersions[0].id,
  });
  const [wineVersions, setWineVersions] = React.useState<WineVersion[]>(mockWineVersions);
  const [dxmtVersions, setDxmtVersions] = React.useState<DxmtVersion[]>(mockDxmtVersions);

  function update_bottle_recipe(patch: Partial<Pick<Bottle, "wineVersionId" | "dxmtVersionId">>) {
    setBottle((currentBottle) => ({
      ...currentBottle,
      ...patch,
      apps: patch.wineVersionId
        ? currentBottle.apps.map((app) => ({
            ...app,
            wineVersionId: patch.wineVersionId ?? app.wineVersionId,
          }))
        : currentBottle.apps,
      updatedAt: new Date().toISOString(),
    }));
  }

  function install_wine_version(versionId: string) {
    setWineVersions((versions) =>
      versions.map((version) =>
        version.id === versionId
          ? { ...version, status: "downloading", progress: 42 }
          : version,
      ),
    );
    window.setTimeout(() => {
      setWineVersions((versions) =>
        versions.map((version) =>
          version.id === versionId
            ? {
                ...version,
                status: "installed",
                progress: 100,
                path: `~/Library/Application Support/BDIH/Wine/${version.id}`,
              }
            : version,
        ),
      );
    }, 900);
  }

  function install_dxmt_version(versionId: string) {
    setDxmtVersions((versions) =>
      versions.map((version) =>
        version.id === versionId
          ? { ...version, status: "downloading", progress: 55 }
          : version,
      ),
    );
    window.setTimeout(() => {
      setDxmtVersions((versions) =>
        versions.map((version) =>
          version.id === versionId
            ? {
                ...version,
                status: "installed",
                progress: 100,
                path: `~/Library/Application Support/BDIH/DXMT/${version.id}.tar.gz`,
              }
            : version,
        ),
      );
    }, 900);
  }

  return (
    <div className="min-h-dvh bg-[#0b1020] p-6 text-slate-100">
      <Stack className="mx-auto max-w-3xl gap-4">
        <Inline className="items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] p-4">
          <Stack className="gap-1">
            <Text className="text-sm font-semibold text-slate-100">Temporary recipe apply test view</Text>
            <Text className="text-xs text-slate-500">
              Current recipe: {bottle.wineVersionId} / {bottle.dxmtVersionId || "-"}
            </Text>
          </Stack>
          <Button type="button" variant="primary" onClick={() => setOpen(true)}>
            Open recipe dialog
          </Button>
        </Inline>
        <Text className="rounded-xl border border-white/10 bg-white/[0.035] p-4 text-xs leading-6 text-slate-400">
          Test path: change Wine or DXMT, click Apply changes, confirm the blocking progress modal, then reopen this dialog and verify the current recipe text above changed.
        </Text>
      </Stack>
      <RecipeDialog
        bottle={bottle}
        open={open}
        onClose={() => setOpen(false)}
        onRevealBottle={() => undefined}
        wineVersions={wineVersions}
        dxmtVersions={dxmtVersions}
        onWineVersionChange={(wineVersionId) => update_bottle_recipe({ wineVersionId })}
        onDxmtVersionChange={(dxmtVersionId) => update_bottle_recipe({ dxmtVersionId })}
        onInstallWineVersion={install_wine_version}
        onInstallDxmtVersion={install_dxmt_version}
      />
    </div>
  );
}
