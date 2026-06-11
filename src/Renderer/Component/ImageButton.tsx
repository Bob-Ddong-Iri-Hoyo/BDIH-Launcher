import React from "react";
import { useTranslation } from "react-i18next";
import { Monitor, Play } from "lucide-react";

export interface ImageButtonProps {
  id?: string;
  src?: string;
  name?: string;
  subtitle?: string;
  actionLabel?: string;
  isActive?: boolean;
  isRunning?: boolean;
  hasError?: boolean;
  className?: string;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onMouseHover?: () => void;
  onContextMenu?: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

export function ImageButton({
  src,
  name = "Untitled",
  subtitle,
  actionLabel,
  isActive = false,
  isRunning = false,
  hasError = false,
  className = "",
  onClick,
  onMouseEnter,
  onMouseLeave,
  onMouseHover,
  onContextMenu,
}: ImageButtonProps) {
  const { t } = useTranslation();
  const resolvedActionLabel = actionLabel ?? t("common.actions.run");

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onMouseMove={onMouseHover}
      onContextMenu={onContextMenu}
      className={`group relative isolate flex min-h-40 w-full flex-col items-center overflow-hidden rounded-2xl border p-4 text-center transition ${
        isRunning
          ? "running-app-card border-emerald-300/70 bg-emerald-500/[0.10] shadow-[0_0_34px_rgba(16,185,129,0.24)]"
          : hasError
            ? "border-red-300/50 bg-red-500/[0.10] shadow-[0_0_28px_rgba(248,113,113,0.16)] hover:border-red-300/70 hover:bg-red-500/[0.14]"
          : isActive
            ? "accent-selection"
            : "border-white/10 bg-white/[0.04] hover:border-white/20 hover:bg-white/[0.07]"
      } ${className}`}
      aria-label={`${name} ${resolvedActionLabel}`}
    >
      {isRunning && (
        <span className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-emerald-300/30 bg-emerald-400/15 px-2 py-1 text-[11px] font-bold text-emerald-100 shadow-[0_0_18px_rgba(52,211,153,0.24)]">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-300" />
          </span>
          {t("main.appContext.running")}
        </span>
      )}
      <div className={`mb-3 flex h-20 w-20 items-center justify-center rounded-full border bg-[radial-gradient(circle_at_35%_28%,rgba(255,255,255,0.18),rgba(15,23,42,0.92)_58%,rgba(2,6,23,0.98))] shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_14px_36px_rgba(0,0,0,0.32)] transition group-hover:scale-[1.04] ${isRunning ? "border-emerald-300/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_0_30px_rgba(16,185,129,0.28)]" : hasError ? "border-red-300/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_0_24px_rgba(248,113,113,0.18)]" : "border-white/10 group-hover:border-white/20"}`}>
        <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-white/[0.08] p-1.5 ring-1 ring-white/10">
        {src ? (
          <img className="h-full w-full object-contain" src={src} alt="" draggable={false} />
        ) : (
          <Monitor className="text-slate-300" size={30} />
        )}
        </div>
      </div>
      <span className="line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-slate-100">{name}</span>
      {subtitle && <span className="mt-1 max-w-full truncate text-xs text-slate-500">{subtitle}</span>}
      <span className={`mt-auto inline-flex items-center gap-1 pt-3 text-xs font-medium text-emerald-300 transition ${isRunning ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
        <Play size={13} fill="currentColor" />
        {resolvedActionLabel}
      </span>
    </button>
  );
}
