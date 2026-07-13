import React from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { RuntimeInstallFailureDialog } from "../../Component/RuntimeInstallFailureDialog";
import type { RuntimeInstallFailure, RuntimeInstallFailureReason } from "../../Store/UseSystemStore";

const meta: Meta<typeof RuntimeInstallFailureDialog> = {
  title: "Component/RuntimeInstallFailureDialog",
  component: RuntimeInstallFailureDialog,
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj<typeof RuntimeInstallFailureDialog>;

const DETAILS: Record<RuntimeInstallFailureReason, string> = {
  diskSpace: "tar: Write failed: No space left on device\ntar exited with code 1.",
  network: "fetch failed: connect ETIMEDOUT downloads.example.invalid:443",
  archive: "gzip: unexpected end of file\ntar exited with code 1.",
  permission: "EACCES: permission denied, mkdir '/Library/Application Support/BDIH Launcher/Wine'",
  missingFile: "ENOENT: no such file or directory, open '/Downloads/wine-runtime.tar.gz'",
  cancelled: "AbortError: The installation operation was aborted.",
  unknown: "Error invoking remote method 'wine:install': process exited with code 1.",
};

function failure(reason: RuntimeInstallFailureReason): RuntimeInstallFailure {
  return {
    resource: "Wine",
    versionId: "bdih-wine-v26-1-0",
    reason,
    details: DETAILS[reason],
  };
}

function render_failure(reason: RuntimeInstallFailureReason) {
  return (
    <div className="min-h-dvh bg-[#0b1020] p-6 text-slate-100">
      <div className="mx-auto grid max-w-5xl gap-4 md:grid-cols-3">
        {["Bottles", "Runtime downloads", "Settings"].map((label) => (
          <div key={label} className="h-40 rounded-lg border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-400">
            {label}
          </div>
        ))}
      </div>
      <RuntimeInstallFailureDialog failure={failure(reason)} onClose={() => undefined} />
    </div>
  );
}

export const DiskSpace: Story = { render: () => render_failure("diskSpace") };
export const Network: Story = { render: () => render_failure("network") };
export const DamagedArchive: Story = { render: () => render_failure("archive") };
export const Permission: Story = { render: () => render_failure("permission") };
export const MissingFile: Story = { render: () => render_failure("missingFile") };
export const Cancelled: Story = { render: () => render_failure("cancelled") };
export const Unknown: Story = { render: () => render_failure("unknown") };
