import React from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { RuntimeVersionSelect } from "../../Component/RuntimeVersionSelect";
import { Surface } from "../../Component/Primitives";
import type { DxmtVersion, WineVersion } from "../../../Common/Types/Wine";
import { mockDxmtVersions, mockWineVersions } from "./mockData";

const meta: Meta<typeof RuntimeVersionSelect> = {
  title: "Component/RuntimeVersionSelect",
  component: RuntimeVersionSelect,
  parameters: {
    layout: "centered",
  },
};

export default meta;
type Story = StoryObj<typeof RuntimeVersionSelect>;

export const WineSelector: Story = {
  render: () => <RuntimeVersionSelectLab kind="wine" />,
};

export const DxmtSelector: Story = {
  render: () => <RuntimeVersionSelectLab kind="dxmt" />,
};

function RuntimeVersionSelectLab({ kind }: { kind: "wine" | "dxmt" }) {
  const [wineVersions, setWineVersions] = React.useState<WineVersion[]>(mockWineVersions);
  const [dxmtVersions, setDxmtVersions] = React.useState<DxmtVersion[]>(mockDxmtVersions);
  const versions = kind === "wine" ? wineVersions : dxmtVersions;
  const [value, setValue] = React.useState(versions[0]?.id ?? "");

  function install_version(versionId: string) {
    if (kind === "wine") {
      setWineVersions((currentVersions) =>
        currentVersions.map((version) =>
          version.id === versionId
            ? { ...version, status: "downloading", progress: 44 }
            : version,
        ),
      );
      window.setTimeout(() => {
        setWineVersions((currentVersions) =>
          currentVersions.map((version) =>
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
      return;
    }

    setDxmtVersions((currentVersions) =>
      currentVersions.map((version) =>
        version.id === versionId
          ? { ...version, status: "downloading", progress: 44 }
          : version,
      ),
    );
    window.setTimeout(() => {
      setDxmtVersions((currentVersions) =>
        currentVersions.map((version) =>
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
    <Surface tone="deep" padding="lg" className="w-[520px] text-slate-100">
      <RuntimeVersionSelect
        label={kind === "wine" ? "Wine runtime" : "DXMT runtime"}
        value={value}
        versions={versions}
        onChange={setValue}
        onInstall={install_version}
      />
    </Surface>
  );
}
