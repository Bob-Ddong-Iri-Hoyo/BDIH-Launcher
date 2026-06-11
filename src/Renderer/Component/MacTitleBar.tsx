import React from "react";
import { Maximize2, Minus, X } from "lucide-react";
import { useTranslation } from "react-i18next";

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
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      onMouseDown={(event) => {
        event.stopPropagation();
        event.currentTarget.focus();
      }}
      className="group flex h-8 w-8 items-center justify-center rounded-full outline-none transition [-webkit-app-region:no-drag] focus-visible:ring-2 focus-visible:ring-white/25"
    >
      <span className={`flex h-3.5 w-3.5 items-center justify-center rounded-full border ${TRAFFIC_LIGHT_STYLE[action]}`}>
        <Icon size={8} strokeWidth={3} className="opacity-0 transition group-hover:opacity-80" />
      </span>
    </button>
  );
}

export function MacTitleBar({ title, rightSlot, className = "", onQuit, onMinimize, onMaximize }: MacTitleBarProps) {
  const { t } = useTranslation();

  return (
    <div
      role="toolbar"
      aria-label={t("titleBar.label")}
      className={`grid h-11 shrink-0 grid-cols-[12rem_minmax(0,1fr)_12rem] items-center border-b border-white/10 bg-[#0b1020]/95 text-slate-300 [-webkit-app-region:drag] ${className}`}
    >
      <div className="flex items-center gap-0.5 px-2">
        <TrafficLightButton action="quit" label={t("titleBar.quit")} onClick={onQuit} />
        <TrafficLightButton action="minimize" label={t("titleBar.minimize")} onClick={onMinimize} />
        <TrafficLightButton action="maximize" label={t("titleBar.maximize")} onClick={onMaximize} />
      </div>

      <div className="pointer-events-none min-w-0 text-center">
        <span className="block truncate text-xs font-semibold text-slate-400">{title ?? t("common.appName")}</span>
      </div>

      <div className="flex min-w-0 justify-end px-4 [-webkit-app-region:no-drag]">{rightSlot}</div>
    </div>
  );
}
