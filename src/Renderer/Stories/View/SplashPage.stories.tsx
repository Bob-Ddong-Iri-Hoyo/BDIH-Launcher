import type { Meta, StoryObj } from "@storybook/react";
import { useEffect, useState } from "react";
import { ROSETTA_INSTALL_COMMAND } from "../../../Common/Constant/Rosetta";
import { RosettaRequiredSplashView, SplashView } from "../../View/SplashView/SplashPage";
import QuitSplashImage from "../../../../resouces/app/splash/app-quit/image.jpg";

const meta: Meta<typeof SplashView> = {
  title: "View/SplashView",
  component: SplashView,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    progress: 48,
  },
};

export default meta;
type Story = StoryObj<typeof SplashView>;

export const Default: Story = {};

export const FirstPaint: Story = {
  name: "First paint / image first",
  args: {
    progress: 12,
    message: "Loading launcher settings",
  },
};

export const CheckingBottles: Story = {
  args: {
    progress: 42,
    message: "Checking bottle metadata",
  },
};

export const WarmingRuntimeCatalogs: Story = {
  args: {
    progress: 76,
    message: "Warming runtime catalogs",
  },
};

export const AlmostReady: Story = {
  args: {
    progress: 92,
    message: "Opening launcher",
  },
};

export const Shutdown: Story = {
  args: {
    progress: 64,
    message: "Cleaning up Wine processes launched by BDIH Launcher...",
    sideLabel: "종료 중...",
    logoSrc: QuitSplashImage,
  },
};

const rosettaActions = {
  onCopyCommand: () => undefined,
  onOpenTerminal: () => undefined,
  onCheckAgain: () => undefined,
};

export const RosettaRequired: Story = {
  name: "Rosetta required / missing",
  render: () => (
    <RosettaRequiredSplashView
      command={ROSETTA_INSTALL_COMMAND}
      logoSrc={QuitSplashImage}
      {...rosettaActions}
    />
  ),
};

export const RosettaCommandCopied: Story = {
  render: () => (
    <RosettaRequiredSplashView
      command={ROSETTA_INSTALL_COMMAND}
      feedback="Command copied. Open Terminal, paste it, then press Return."
      logoSrc={QuitSplashImage}
      {...rosettaActions}
    />
  ),
};

export const RosettaTerminalOpened: Story = {
  render: () => (
    <RosettaRequiredSplashView
      command={ROSETTA_INSTALL_COMMAND}
      feedback="Terminal opened. Paste the copied command and press Return."
      logoSrc={QuitSplashImage}
      {...rosettaActions}
    />
  ),
};

export const RosettaCheckingAgain: Story = {
  render: () => (
    <RosettaRequiredSplashView
      command={ROSETTA_INSTALL_COMMAND}
      feedback="Checking..."
      isChecking
      logoSrc={QuitSplashImage}
      {...rosettaActions}
    />
  ),
};

export const RosettaStillMissing: Story = {
  render: () => (
    <RosettaRequiredSplashView
      command={ROSETTA_INSTALL_COMMAND}
      feedback="Rosetta is still not available. Finish the Terminal installation, then check again."
      logoSrc={QuitSplashImage}
      {...rosettaActions}
    />
  ),
};

export const RosettaCheckFailed: Story = {
  render: () => (
    <RosettaRequiredSplashView
      command={ROSETTA_INSTALL_COMMAND}
      feedback="Failed to check Rosetta status."
      logoSrc={QuitSplashImage}
      {...rosettaActions}
    />
  ),
};

export const RosettaVerified: Story = {
  render: () => (
    <RosettaRequiredSplashView
      command={ROSETTA_INSTALL_COMMAND}
      feedback="Rosetta verified. Opening launcher..."
      logoSrc={QuitSplashImage}
      {...rosettaActions}
    />
  ),
};

export const FillAndStop: Story = {
  render: (args) => {
    const [progress, setProgress] = useState(0);
    const messages = [
      "Loading launcher settings",
      "Checking bottle metadata",
      "Warming runtime catalogs",
      "Opening launcher",
    ];
    const messageIndex = Math.min(Math.floor(progress / 26), messages.length - 1);

    useEffect(() => {
      setProgress(0);

      const timer = window.setInterval(() => {
        setProgress((currentProgress) => {
          if (currentProgress >= 100) {
            window.clearInterval(timer);
            return 100;
          }

          return Math.min(currentProgress + 2, 100);
        });
      }, 55);

      return () => window.clearInterval(timer);
    }, []);

    return <SplashView {...args} progress={progress} message={progress >= 100 ? "Ready." : messages[messageIndex]} />;
  },
};

export const ShutdownProgress: Story = {
  render: (args) => {
    const [progress, setProgress] = useState(18);

    useEffect(() => {
      setProgress(18);

      const timer = window.setInterval(() => {
        setProgress((currentProgress) => {
          if (currentProgress >= 92) {
            window.clearInterval(timer);
            return 92;
          }

          return Math.min(currentProgress + 3, 92);
        });
      }, 120);

      return () => window.clearInterval(timer);
    }, []);

    return (
      <SplashView
        {...args}
        progress={progress}
        message="Cleaning up Wine processes launched by BDIH Launcher..."
        sideLabel="종료 중..."
        logoSrc={QuitSplashImage}
      />
    );
  },
};
