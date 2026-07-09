import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "../../style/index.css";
import "../../I18n";
import { useTranslation } from "react-i18next";
import { IPC_CHANNELS, RosettaStatusPayload } from "../../../Common/Types/IPC";
import { MACOS_TERMINAL_APP_PATH, ROSETTA_INSTALL_COMMAND } from "../../../Common/Constant/Rosetta";
import { RosettaRequiredSplashView, SplashView } from "./SplashPage";
import StartSplashImage from "../../../../resouces/app/splash/app-start/image.png";
import QuitSplashImage from "../../../../resouces/app/splash/app-quit/image.jpg";

const STARTUP_MESSAGE_KEYS = [
  "splash.startup.loadingSettings",
  "splash.startup.checkingBottles",
  "splash.startup.warmingCatalogs",
  "splash.startup.openingLauncher",
];

const App: React.FC = () => {
  const { t } = useTranslation();
  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mode");
  const isShutdown = mode === "shutdown";
  const isRosettaRequired = mode === "rosetta-required";
  const [progress, setProgress] = useState(isShutdown ? 18 : 12);
  const [feedback, setFeedback] = useState<string | undefined>();
  const [isCheckingRosetta, setIsCheckingRosetta] = useState(false);
  const messageIndex = Math.min(Math.floor(progress / 26), STARTUP_MESSAGE_KEYS.length - 1);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setProgress((currentProgress) => Math.min(currentProgress + (isShutdown ? 3 : 7), isShutdown ? 92 : 100));
    }, isShutdown ? 120 : 90);

    return () => window.clearInterval(timer);
  }, [isShutdown]);

  async function copy_rosetta_command() {
    try {
      await copy_text_to_clipboard(ROSETTA_INSTALL_COMMAND);
      setFeedback(t("splash.rosetta.copied"));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : String(error));
    }
  }

  async function open_terminal() {
    const result = await window.BTIH_API?.invoke(IPC_CHANNELS.APP.OPEN_PATH.channelName, {
      path: MACOS_TERMINAL_APP_PATH,
    });

    setFeedback(result?.ok
      ? t("splash.rosetta.terminalOpened")
      : result?.error ?? t("splash.rosetta.terminalOpenFailed"));
  }

  async function check_rosetta_again() {
    setIsCheckingRosetta(true);
    setFeedback(t("splash.rosetta.checking"));

    try {
      const status = await window.BTIH_API?.invoke(
        IPC_CHANNELS.APP.CONTINUE_AFTER_ROSETTA_GATE.channelName,
        undefined as never,
      ) as RosettaStatusPayload | undefined;

      if (!status || status.status === "missing") {
        setFeedback(t("splash.rosetta.stillMissing"));
        return;
      }

      if (status.status === "error") {
        setFeedback(status.error ?? t("splash.rosetta.checkFailed"));
        return;
      }

      setFeedback(t("splash.rosetta.verified"));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : String(error));
    } finally {
      setIsCheckingRosetta(false);
    }
  }

  if (isRosettaRequired) {
    return (
      <RosettaRequiredSplashView
        command={ROSETTA_INSTALL_COMMAND}
        feedback={feedback}
        isChecking={isCheckingRosetta}
        logoSrc={QuitSplashImage}
        onCopyCommand={copy_rosetta_command}
        onOpenTerminal={open_terminal}
        onCheckAgain={check_rosetta_again}
      />
    );
  }

  return (
    <SplashView
      progress={progress}
      message={isShutdown ? t("splash.shutdown.message") : t(STARTUP_MESSAGE_KEYS[messageIndex])}
      sideLabel={isShutdown ? t("splash.shutdown.sideLabel") : undefined}
      logoSrc={isShutdown ? QuitSplashImage : StartSplashImage}
    />
  );
};

async function copy_text_to_clipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();

  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error("Failed to copy command.");
  }
}

const container = document.getElementById("root");
const root = createRoot(container!);
root.render(<App />);
