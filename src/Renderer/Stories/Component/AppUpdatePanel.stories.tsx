import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import type { AppUpdateStatusPayload } from "../../../Common/Types/IPC";
import { AppUpdatePanel } from "../../Component/AppUpdatePanel";

const meta: Meta<typeof AppUpdatePanel> = {
  title: "Component/AppUpdatePanel",
  component: AppUpdatePanel,
  parameters: {
    layout: "centered",
  },
  args: {
    autoUpdateEnabled: true,
    onAutoUpdateChange: () => undefined,
    onCheckForUpdates: () => undefined,
    onInstallUpdate: () => undefined,
  },
};

export default meta;
type Story = StoryObj<typeof AppUpdatePanel>;

function UpdateCheckResultScenario({
  args,
  result,
}: {
  args: React.ComponentProps<typeof AppUpdatePanel>;
  result: "available" | "not-available";
}) {
  const idleStatus: AppUpdateStatusPayload = {
    status: "idle",
    currentVersion: "1.2.0",
    message: "Ready to check for updates.",
  };
  const [attempt, setAttempt] = React.useState(0);
  const [status, setStatus] = React.useState<AppUpdateStatusPayload>(idleStatus);

  const replay = () => {
    setStatus(idleStatus);
    setAttempt((current) => current + 1);
  };

  const check_for_updates = async () => {
    setStatus({
      status: "checking",
      currentVersion: "1.2.0",
      message: "Checking the release feed.",
    });
    await new Promise<void>((resolve) => window.setTimeout(resolve, 900));
    setStatus(result === "available"
      ? {
        status: "available",
        currentVersion: "1.2.0",
        version: "1.3.0",
        message: "Update is available.",
      }
      : {
        status: "not-available",
        currentVersion: "1.2.0",
        version: "1.2.0",
        message: "The launcher is up to date.",
      });
  };

  return (
    <div className="w-[720px] space-y-3 bg-[#0b1020] p-8 text-slate-100">
      <button
        type="button"
        className="rounded-md border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10"
        onClick={replay}
      >
        Replay from idle
      </button>
      <AppUpdatePanel
        key={attempt}
        {...args}
        status={status}
        onCheckForUpdates={check_for_updates}
      />
    </div>
  );
}

function UpdateFailedScenario({
  args,
}: {
  args: React.ComponentProps<typeof AppUpdatePanel>;
}) {
  const [attempt, setAttempt] = React.useState(0);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    setFailed(false);
    const timer = window.setTimeout(() => setFailed(true), 900);
    return () => window.clearTimeout(timer);
  }, [attempt]);

  return (
    <div className="w-[720px] space-y-3 bg-[#0b1020] p-8 text-slate-100">
      <button
        type="button"
        className="rounded-md border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10"
        onClick={() => setAttempt((current) => current + 1)}
      >
        Replay progress to failure
      </button>
      <AppUpdatePanel
        {...args}
        status={failed
          ? {
            status: "error",
            message: "Update failed while downloading.",
            error: "Update download failed: connection interrupted.",
            currentVersion: "1.2.0",
            version: "1.3.0",
          }
          : {
            status: "downloading",
            message: "Downloading launcher update.",
            progress: 64,
            currentVersion: "1.2.0",
            version: "1.3.0",
          }}
      />
    </div>
  );
}

export const Idle: Story = {
  render: (args) => (
    <div className="w-[720px] bg-[#0b1020] p-8 text-slate-100">
      <AppUpdatePanel {...args} />
    </div>
  ),
};

export const IdleToUpdateAvailable: Story = {
  name: "Flow / Idle to update available",
  parameters: {
    docs: {
      description: {
        story: "Click Check updates to inspect idle, dialog-check-update, and the update-available result in sequence.",
      },
    },
  },
  render: (args) => <UpdateCheckResultScenario args={args} result="available" />,
};

export const IdleToLatestRelease: Story = {
  name: "Flow / Idle to latest release",
  parameters: {
    docs: {
      description: {
        story: "Click Check updates to inspect idle, dialog-check-update, and the dialog-latest-release result in sequence.",
      },
    },
  },
  render: (args) => <UpdateCheckResultScenario args={args} result="not-available" />,
};

export const CheckingForUpdate: Story = {
  name: "Artwork / Check update",
  parameters: {
    docs: {
      description: {
        story: "Checklist: the check-update artwork appears in the status icon slot while the release feed is being checked.",
      },
    },
  },
  args: {
    status: {
      status: "checking",
      message: "Checking the release feed.",
    },
  },
  render: (args) => (
    <div className="w-[720px] bg-[#0b1020] p-8 text-slate-100">
      <AppUpdatePanel {...args} />
    </div>
  ),
};

export const UpdateProgress: Story = {
  name: "Artwork / Update progress",
  parameters: {
    docs: {
      description: {
        story: "Checklist: the update-progress artwork and download progress bar are visible together.",
      },
    },
  },
  args: {
    status: {
      status: "downloading",
      message: "Downloading launcher update.",
      progress: 64,
      currentVersion: "1.2.0",
      version: "1.3.0",
    },
  },
  render: (args) => (
    <div className="w-[720px] bg-[#0b1020] p-8 text-slate-100">
      <AppUpdatePanel {...args} />
    </div>
  ),
};

export const UpdateFailed: Story = {
  name: "Artwork / Update failed",
  parameters: {
    docs: {
      description: {
        story: "Checklist: the panel starts in download progress and transitions to update-failed after 900 ms. Use Replay to inspect it again.",
      },
    },
  },
  render: (args) => <UpdateFailedScenario args={args} />,
};

export const UpdateConfirmation: Story = {
  name: "Update confirmation",
  parameters: {
    docs: {
      description: {
        story: "Click Check updates to review the Later and Update confirmation shown before process cleanup and download begin.",
      },
    },
  },
  args: {
    status: {
      status: "available",
      message: "Update is available.",
      currentVersion: "1.2.0",
      version: "1.3.0",
    },
  },
  render: (args) => (
    <div className="w-[720px] bg-[#0b1020] p-8 text-slate-100">
      <AppUpdatePanel {...args} />
    </div>
  ),
};

export const Error: Story = {
  args: {
    autoUpdateEnabled: false,
    status: {
      status: "error",
      message: "Update check failed.",
      error: "Failed to resolve update feed.",
    },
  },
  render: (args) => (
    <div className="w-[720px] bg-[#0b1020] p-8 text-slate-100">
      <AppUpdatePanel {...args} />
    </div>
  ),
};

export const ConnectionRefused: Story = {
  args: {
    autoUpdateEnabled: false,
    status: {
      status: "error",
      message: "Update check failed.",
      error: "Error: net::ERR_CONNECTION_REFUSED\nUpdate URL: http://127.0.0.1:45678/nightly-mac.yml",
    },
  },
  render: (args) => (
    <div className="w-[720px] bg-[#0b1020] p-8 text-slate-100">
      <AppUpdatePanel {...args} />
    </div>
  ),
};
