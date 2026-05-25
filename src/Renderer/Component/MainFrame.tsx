import React from "react";
import { useTranslation } from "react-i18next";
import { Activity, FileText, Home, LucideIcon, MonitorPlay, Settings, TerminalSquare, Wine } from "lucide-react";
import { StatusBadge } from "./StatusBadge";

export type RendererViewKey = "dashboard" | "terminal" | "logs" | "preferences";

export interface NavigationItem {
  id: RendererViewKey;
  icon: LucideIcon;
}

export interface MainFrameProps {
  title: React.ReactNode;
  subtitle?: string;
  logoSrc?: string;
  activeView: RendererViewKey;
  statusText?: string;
  children: React.ReactNode;
  titleBar?: React.ReactNode;
  headerLeading?: React.ReactNode;
  actions?: React.ReactNode;
  onViewChange: (viewKey: RendererViewKey) => void;
}

export const RENDERER_NAVIGATION_ITEMS: NavigationItem[] = [
  {
    id: "dashboard",
    icon: Home,
  },
  {
    id: "terminal",
    icon: TerminalSquare,
  },
  {
    id: "logs",
    icon: FileText,
  },
  {
    id: "preferences",
    icon: Settings,
  },
];

export function MainFrame({
  title,
  subtitle,
  logoSrc,
  activeView,
  statusText = "Renderer ready",
  children,
  titleBar,
  headerLeading,
  actions,
  onViewChange,
}: MainFrameProps) {
  const { t } = useTranslation();

  return (
    <div className="flex h-dvh min-h-[600px] w-full flex-col overflow-hidden bg-[#0b1020] text-slate-100">
      {titleBar}
      <div className="grid min-h-0 flex-1 grid-cols-[18rem_minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col border-r border-white/10 bg-[#111827]">
        <div className="flex h-20 items-center gap-3 border-b border-white/10 px-5 [-webkit-app-region:drag]">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/5 ring-1 ring-white/10">
            {logoSrc ? <img src={logoSrc} alt="" className="h-full w-full object-cover" /> : <Wine size={27} />}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold tracking-normal text-white">{t("common.appName")}</h1>
            <p className="truncate text-xs text-slate-400">{t("common.appSubtitle")}</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4 [-webkit-app-region:no-drag]">
          {RENDERER_NAVIGATION_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onViewChange(item.id)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition ${
                  isActive ? "accent-subtle text-white ring-1 accent-ring" : "text-slate-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon size={20} className="shrink-0" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{t(`navigation.${item.id}.label`)}</span>
                  <span className="block truncate text-xs opacity-70">{t(`navigation.${item.id}.description`)}</span>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-4">
          <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-300">
              <Activity size={14} className="text-emerald-300" />
              {t("status.title")}
            </div>
            <p className="line-clamp-2 text-xs leading-5 text-slate-500">{statusText}</p>
          </div>
        </div>
      </aside>

      <main className="flex min-h-0 flex-col">
        <header className="flex h-20 shrink-0 items-center justify-between gap-4 border-b border-white/10 bg-[#0f172a] px-6 [-webkit-app-region:drag]">
          <div className="flex min-w-0 items-center gap-3">
            {headerLeading && <div className="shrink-0 [-webkit-app-region:no-drag]">{headerLeading}</div>}
            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-2">
                <MonitorPlay size={18} className="accent-text" />
                <StatusBadge label={t("common.macosWine")} tone="info" />
              </div>
              {typeof title === "string" ? (
                <h2 className="truncate text-xl font-bold text-white">{title}</h2>
              ) : (
                <div className="min-w-0 [-webkit-app-region:no-drag]">{title}</div>
              )}
              {subtitle && <p className="truncate text-sm text-slate-400">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2 [-webkit-app-region:no-drag]">{actions}</div>}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </main>
      </div>
    </div>
  );
}

export function WineeryView() {
  const { t } = useTranslation();

  return (
    <MainFrame
      title={t("navigation.dashboard.label")}
      subtitle={t("navigation.dashboard.subtitle")}
      activeView="dashboard"
      onViewChange={() => undefined}
    >
      <div className="p-6 text-sm text-slate-300">MainFrame preview</div>
    </MainFrame>
  );
}
