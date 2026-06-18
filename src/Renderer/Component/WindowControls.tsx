import { Maximize2, Minus, Power, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Box, Button, Inline, InlineText } from "./Primitives";

/**
 * Props for the compact window control cluster.
 *
 * Pass only the handlers supported by the current window; missing handlers keep
 * the visual control present but inert when the surrounding title bar requires
 * stable spacing.
 */
export interface WindowControlsProps {
  onRefresh?: () => void;
  onMinimize?: () => void;
  onMaximize?: () => void;
  onQuit: () => void;
  className?: string;
}

/**
 * Compact window action buttons for refresh, minimize, maximize, and quit.
 *
 * Use this inside custom title bars or utility panels where the controls should
 * feel native to the launcher instead of inheriting browser default buttons.
 */
export function WindowControls({ onRefresh, onMinimize, onMaximize, onQuit, className = "" }: WindowControlsProps) {
  const { t } = useTranslation();

  return (
    <Inline
      gap="xs"
      className={`h-11 rounded-lg border border-white/10 bg-white/[0.045] p-1 shadow-[0_10px_30px_rgba(0,0,0,0.18)] backdrop-blur-md [-webkit-app-region:no-drag] ${className}`}
      aria-label={t("windowControls.label")}
    >
      {onRefresh ? (
        <Button
          variant="ghost"
          size="sm"
          icon={<RefreshCw size={16} />}
          onClick={onRefresh}
          title={t("common.actions.refresh")}
          aria-label={t("common.actions.refresh")}
          className="px-3 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-400/40"
        >
          <InlineText className="hidden lg:inline">{t("common.actions.refresh")}</InlineText>
        </Button>
      ) : null}
      {onRefresh ? <Box className="mx-1 h-5 w-px bg-white/10" aria-hidden="true" /> : null}
      {onMinimize ? (
        <Button variant="ghost" size="sm" className="w-9 px-0" icon={<Minus size={16} />} onClick={onMinimize} title={t("titleBar.minimize")} aria-label={t("titleBar.minimize")} />
      ) : null}
      {onMaximize ? (
        <Button variant="ghost" size="sm" className="w-9 px-0" icon={<Maximize2 size={16} />} onClick={onMaximize} title={t("titleBar.maximize")} aria-label={t("titleBar.maximize")} />
      ) : null}
      <Button
        variant="glass"
        size="sm"
        onClick={onQuit}
        className="group relative w-9 border-rose-300/20 bg-rose-500/15 px-0 text-rose-200 hover:border-rose-300/40 hover:bg-rose-500 hover:text-white focus:outline-none focus:ring-2 focus:ring-rose-300/50"
        title={t("common.actions.quit")}
        aria-label={t("common.actions.quit")}
      >
        <Box className="absolute inset-0 rounded-md bg-rose-400/0 transition group-hover:bg-rose-300/10" aria-hidden="true" />
        <Power size={16} />
      </Button>
    </Inline>
  );
}
