import type { Meta, StoryObj } from "@storybook/react";
import { useEffect, useState } from "react";
import { SplashView } from "../../View/SplashView/SplashPage";
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

export const AlmostReady: Story = {
  args: {
    progress: 92,
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

export const FillAndStop: Story = {
  render: (args) => {
    const [progress, setProgress] = useState(0);
    const messages = ["Checking launcher files...", "Preparing Wine runtime...", "Opening launcher..."];
    const messageIndex = Math.min(Math.floor(progress / 34), messages.length - 1);

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
