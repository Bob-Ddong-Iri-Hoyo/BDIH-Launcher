import React from "react";
import { Maximize2, Minus, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Box, Button, Inline, InlineText } from "./Primitives";

export interface MacTitleBarProps {
  title?: string;
  rightSlot?: React.ReactNode;
  className?: string;
  onQuit: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
}

type MacTitleBarAction = "quit" | "minimize" | "maximize";

interface TrafficLightButtonProps {
  action: MacTitleBarAction;
  label: string;
  onClick: () => void;
}

const TRAFFIC_LIGHT_STYLE: Record<MacTitleBarAction, string> = {
  quit: "border-[#e0443e] bg-[#ff5f57] text-[#7a1f1b]",
  minimize: "border-[#dea123] bg-[#ffbd2e] text-[#7a4f00]",
  maximize: "border-[#1aab29] bg-[#28c840] text-[#0c5d16]",
};

const TRAFFIC_LIGHT_ICON = {
  quit: X,
  minimize: Minus,
  maximize: Maximize2,
};

function TrafficLightButton({ action, label, onClick }: TrafficLightButtonProps) {
  const Icon = TRAFFIC_LIGHT_ICON[action];

  return (
    <Button
      variant="ghost"
      size="xs"
      title={label}
      aria-label={label}
      onClick={onClick}
      onMouseDown={(event) => {
        event.stopPropagation();
        event.currentTarget.focus();
      }}
      className="group h-8 w-8 px-0 outline-none [-webkit-app-region:no-drag] focus-visible:ring-2 focus-visible:ring-white/25"
    >
      <Box className={`flex h-3.5 w-3.5 items-center justify-center rounded-full border ${TRAFFIC_LIGHT_STYLE[action]}`}>
        <Icon size={8} strokeWidth={4} className="opacity-0 transition group-hover:opacity-80" />
      </Box>
    </Button>
  );
}

export function MacTitleBar({ title, rightSlot, className = "", onQuit, onMinimize, onMaximize }: MacTitleBarProps) {
  const { t } = useTranslation();

  return (
    <Box
      role="toolbar"
      aria-label={t("titleBar.label")}
      className={`grid h-11 shrink-0 grid-cols-[12rem_minmax(0,1fr)_12rem] items-center border-b border-white/10 bg-[#0b1020]/95 text-slate-300 [-webkit-app-region:drag] ${className}`}
    >
      <Inline gap="xs" className="px-2">
        <TrafficLightButton action="quit" label={t("titleBar.quit")} onClick={onQuit} />
        <TrafficLightButton action="minimize" label={t("titleBar.minimize")} onClick={onMinimize} />
        <TrafficLightButton action="maximize" label={t("titleBar.maximize")} onClick={onMaximize} />
      </Inline>

      <Box className="pointer-events-none min-w-0 text-center">
        <InlineText tone="muted" size="xs" truncate className="block font-semibold">
          {title ?? t("common.appName")}
        </InlineText>
      </Box>

      <Inline justify="end" className="min-w-0 px-4 [-webkit-app-region:no-drag]">
        {rightSlot}
      </Inline>
    </Box>
  );
}
