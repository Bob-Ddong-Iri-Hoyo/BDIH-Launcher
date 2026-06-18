import React from "react";
import { useTranslation } from "react-i18next";
import { FileText, Home, LucideIcon, MonitorPlay, Settings, Wine } from "lucide-react";
import { Box, Button, ImageFrame, Inline, InlineText, PrimitiveImage, Stack, Text } from "./Primitives";
import { StatusBadge } from "./StatusBadge";

/** Top-level renderer view identifiers used by the left navigation shell. */
export type RendererViewKey = "dashboard" | "logs" | "preferences";

/**
 * Metadata for a primary navigation item.
 *
 * Keep this intentionally small; labels and descriptions come from i18n keys so
 * the navigation can respond to language changes without rebuilding constants.
 */
export interface NavigationItem {
  id: RendererViewKey;
  icon: LucideIcon;
}

/**
 * Props for the main application shell.
 *
 * Use MainFrame around primary renderer views. It owns global navigation, the
 * header area, title bar slotting, and the scroll container for page content.
 */
export interface MainFrameProps {
  title: React.ReactNode;
  subtitle?: string;
  logoSrc?: string;
  activeView: RendererViewKey;
  children: React.ReactNode;
  titleBar?: React.ReactNode;
  headerLeading?: React.ReactNode;
  actions?: React.ReactNode;
  onViewChange: (viewKey: RendererViewKey) => void;
}

/** Primary navigation model for the renderer shell. */
export const RENDERER_NAVIGATION_ITEMS: NavigationItem[] = [
  {
    id: "dashboard",
    icon: Home,
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

/**
 * Primary launcher layout shell.
 *
 * Use this once per renderer window to compose the sidebar, header, optional
 * title bar, and active page content without duplicating shell markup.
 */
export function MainFrame({
  title,
  subtitle,
  logoSrc,
  activeView,
  children,
  titleBar,
  headerLeading,
  actions,
  onViewChange,
}: MainFrameProps) {
  const { t } = useTranslation();

  return (
    <Box className="flex h-dvh min-h-[600px] w-full flex-col overflow-hidden bg-[#0b1020] text-slate-100">
      {titleBar}
      <Box className="grid min-h-0 flex-1 grid-cols-[15rem_minmax(0,1fr)]">
        <Box as="aside" className="flex min-h-0 flex-col border-r border-white/10 bg-[#111827]">
          <Inline className="h-20 items-center gap-3 border-b border-white/10 px-5 [-webkit-app-region:drag]">
            <ImageFrame size="md" className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/5 ring-1 ring-white/10">
              {logoSrc ? <PrimitiveImage src={logoSrc} alt="" className="h-full w-full object-cover" /> : <Wine size={27} />}
            </ImageFrame>
            <Stack className="min-w-0 gap-0">
              <Box as="h1" className="truncate text-lg font-bold tracking-normal text-white">
                {t("common.appName")}
              </Box>
              <Text className="truncate text-xs text-slate-400">{t("common.appSubtitle")}</Text>
            </Stack>
          </Inline>

          <Box as="nav" className="flex-1 space-y-1 overflow-y-auto px-3 py-4 [-webkit-app-region:no-drag]">
            {RENDERER_NAVIGATION_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeView === item.id;

              return (
                <Button
                  key={item.id}
                  type="button"
                  onClick={() => onViewChange(item.id)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition ${
                    isActive ? "accent-subtle text-white ring-1 accent-ring" : "text-slate-400 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <Icon size={20} className="shrink-0" />
                  <Stack className="min-w-0 gap-0">
                    <InlineText className="block truncate text-sm font-semibold">{t(`navigation.${item.id}.label`)}</InlineText>
                    <InlineText className="block truncate text-xs opacity-70">{t(`navigation.${item.id}.description`)}</InlineText>
                  </Stack>
                </Button>
              );
            })}
          </Box>
        </Box>

        <Box as="main" className="flex min-h-0 flex-col">
          <Box as="header" className="flex h-20 shrink-0 items-center justify-between gap-4 border-b border-white/10 bg-[#0f172a] px-6 [-webkit-app-region:drag]">
            <Inline className="min-w-0 items-center gap-3">
              {headerLeading ? <Box className="shrink-0 [-webkit-app-region:no-drag]">{headerLeading}</Box> : null}
              <Stack className="min-w-0 gap-0">
                <Inline className="mb-1 items-center gap-2">
                  <MonitorPlay size={18} className="accent-text" />
                  <StatusBadge label={t("common.macosWine")} tone="info" />
                </Inline>
                {typeof title === "string" ? (
                  <Box as="h2" className="truncate text-xl font-bold text-white">
                    {title}
                  </Box>
                ) : (
                  <Box className="min-w-0 [-webkit-app-region:no-drag]">{title}</Box>
                )}
                {subtitle ? <Text className="truncate text-sm text-slate-400">{subtitle}</Text> : null}
              </Stack>
            </Inline>
            {actions ? <Inline className="shrink-0 items-center gap-2 [-webkit-app-region:no-drag]">{actions}</Inline> : null}
          </Box>

          <Box className="min-h-0 flex-1 overflow-y-auto">{children}</Box>
        </Box>
      </Box>
    </Box>
  );
}

/** Storybook/demo view for checking the shell without full app state. */
export function WineeryView() {
  const { t } = useTranslation();

  return (
    <MainFrame
      title={t("navigation.dashboard.label")}
      subtitle={t("navigation.dashboard.subtitle")}
      activeView="dashboard"
      onViewChange={() => undefined}
    >
      <Box className="p-6 text-sm text-slate-300">MainFrame preview</Box>
    </MainFrame>
  );
}
