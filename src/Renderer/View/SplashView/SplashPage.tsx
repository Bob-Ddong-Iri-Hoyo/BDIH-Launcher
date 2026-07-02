import React from "react";
import { useTranslation } from "react-i18next";
import AppStartSplashImage from "../../../../resouces/app/splash/app-start/image.png";
import { Box, Button, InlineText, PrimitiveImage, Text } from "../../Component/Primitives";

export interface SplashViewProps {
  progress?: number;
  message?: string;
  sideLabel?: string;
  logoSrc?: string;
}

export interface RosettaRequiredSplashViewProps {
  command: string;
  feedback?: string;
  isChecking?: boolean;
  logoSrc?: string;
  onCopyCommand: () => void;
  onOpenTerminal: () => void;
  onCheckAgain: () => void;
}

export function SplashView({ progress = 48, message, sideLabel, logoSrc = AppStartSplashImage }: SplashViewProps) {
  const { t } = useTranslation();
  const safeProgress = Math.min(Math.max(Number(progress), 0), 100);
  const title = t("common.appName");

  return (
    <Box className="relative h-screen w-screen overflow-hidden bg-[#050812] text-white">
      <PrimitiveImage src={logoSrc} alt={title} className="absolute inset-0 h-full w-full object-cover" />
      <Box className="absolute inset-0 bg-gradient-to-t from-[#050812] via-[#050812]/72 to-[#050812]/10" />
      <Box className="absolute inset-x-0 bottom-0 px-7 pb-7 pt-28">
        <Box className="max-w-xl space-y-4">
          <Box>
            <Text as="h1" className="relative inline-block text-4xl font-black tracking-normal text-white/18 md:text-5xl">
              <InlineText aria-hidden="true">{title}</InlineText>
              <InlineText
                aria-label={title}
                className="absolute inset-0 overflow-hidden bg-gradient-to-t from-sky-200 via-cyan-300 to-white bg-clip-text text-transparent transition-[clip-path] duration-500"
                style={{ clipPath: `inset(${100 - safeProgress}% 0 0 0)` }}
              >
                {title}
              </InlineText>
              <InlineText
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 h-3 rounded-full bg-cyan-200/35 blur-sm transition-[bottom] duration-500"
                style={{ bottom: `${safeProgress}%`, transform: "translateY(50%)" }}
              />
            </Text>
            <Text className="mt-2 max-w-lg text-sm leading-6 text-slate-300">{t("splash.description")}</Text>
          </Box>

          <Box className="space-y-2">
            <Box className="flex items-center justify-between gap-3 text-xs text-slate-300">
              <InlineText className="min-w-0 truncate">{message ?? t("splash.defaultMessage")}</InlineText>
              <InlineText className={sideLabel ? "shrink-0 rounded-full border border-cyan-200/20 bg-cyan-300/10 px-3 py-1 text-[11px] font-semibold text-cyan-100" : "shrink-0 font-mono"}>
                {sideLabel ?? `${Math.round(safeProgress)}%`}
              </InlineText>
            </Box>
            <Box
              className="h-2 w-full overflow-hidden rounded-full bg-white/12"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={safeProgress}
            >
              <Box
                className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-sky-300 to-rose-300 shadow-[0_0_18px_rgba(125,211,252,0.55)] transition-[width] duration-500"
                style={{ width: `${safeProgress}%` }}
              />
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

export function RosettaRequiredSplashView({
  command,
  feedback,
  isChecking = false,
  logoSrc = AppStartSplashImage,
  onCopyCommand,
  onOpenTerminal,
  onCheckAgain,
}: RosettaRequiredSplashViewProps) {
  const { t } = useTranslation();

  return (
    <Box className="relative h-screen w-screen overflow-hidden bg-[#050812] text-white">
      <PrimitiveImage src={logoSrc} alt={t("splash.rosetta.title")} className="absolute inset-0 h-full w-full object-cover" />
      <Box className="absolute inset-0 bg-gradient-to-t from-[#050812] via-[#050812]/78 to-[#050812]/18" />
      <Box className="absolute inset-0 flex items-center justify-center px-10 pb-20 pt-10">
        <Box className="max-w-xl rounded-2xl border border-white/12 bg-[#07101d]/78 p-6 text-center shadow-2xl shadow-black/40 backdrop-blur-md">
          <Text as="h1" className="text-2xl font-black tracking-tight text-white md:text-3xl">
            {t("splash.rosetta.title")}
          </Text>
          <Text className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-300">
            {t("splash.rosetta.description")}
          </Text>
          <Box className="mt-5 rounded-xl border border-cyan-200/18 bg-black/45 px-4 py-3 text-left font-mono text-[12px] leading-5 text-cyan-100 shadow-inner shadow-black/40">
            {command}
          </Box>
          <Text className="mx-auto mt-3 max-w-lg text-xs leading-5 text-slate-400">
            {feedback ?? t("splash.rosetta.instruction")}
          </Text>
        </Box>
      </Box>
      <Box className="absolute inset-x-0 bottom-0 flex justify-end gap-2 px-8 pb-8">
        <Button variant="glass" size="sm" onClick={onCopyCommand}>
          {t("splash.rosetta.copyCommand")}
        </Button>
        <Button variant="glass" size="sm" onClick={onOpenTerminal}>
          {t("splash.rosetta.openTerminal")}
        </Button>
        <Button variant="primary" size="sm" disabled={isChecking} onClick={onCheckAgain}>
          {isChecking ? t("splash.rosetta.checking") : t("splash.rosetta.checkAgain")}
        </Button>
      </Box>
    </Box>
  );
}
