import React from "react";
import { ExternalLink, Globe2, MessageCircle, Radio } from "lucide-react";
import { useTranslation } from "react-i18next";
import { IPC_CHANNELS } from "../../Common/Types/IPC";
import { Box, Button, InlineText } from "./Primitives";

export interface DeveloperLinkGroupProps {
  siteUrl: string;
  githubUrl: string;
  discordUrl: string;
  youtubeUrl: string;
  isYouTubeOnAir: boolean;
}

/**
 * Developer link group used by Preference surfaces.
 *
 * Keep social-link icon details here so View files can compose the section
 * without owning raw SVG/image/link button structure.
 */
export function DeveloperLinkGroup({
  siteUrl,
  githubUrl,
  discordUrl,
  youtubeUrl,
  isYouTubeOnAir,
}: DeveloperLinkGroupProps) {
  const { t } = useTranslation();

  return (
    <Box className="flex flex-wrap justify-end gap-2">
      <DeveloperExternalLink url={siteUrl} label={t("preferences.developerLinks.site")} icon={<Globe2 className="h-5 w-5 text-sky-200" />} />
      <DeveloperExternalLink url={githubUrl} label={t("preferences.developerLinks.github")} icon={<GitHubMark className="h-5 w-5 text-slate-200" />} />
      <DeveloperExternalLink url={discordUrl} label={t("preferences.developerLinks.discord")} icon={<MessageCircle className="h-5 w-5 text-indigo-200" />} />
      <DeveloperYouTubeLink url={youtubeUrl} isOnAir={isYouTubeOnAir} />
    </Box>
  );
}

export function DeveloperYouTubeLink({ url, isOnAir }: { url: string; isOnAir: boolean }) {
  const { t } = useTranslation();

  return (
    <Button
      type="button"
      className={`relative isolate ml-auto flex max-w-full items-center gap-3 overflow-visible rounded-lg border px-3 py-2 text-left transition ${
        isOnAir
          ? "border-red-400/80 bg-white/[0.03] text-slate-100 hover:bg-white/[0.06]"
          : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06] hover:text-white"
      }`}
      onClick={() => open_external_url(url)}
    >
      <InlineText className="relative grid h-9 w-9 shrink-0 place-items-center rounded-md bg-white/5">
        <YouTubeMark className={isOnAir ? "h-6 w-6 text-red-400" : "h-6 w-6 text-red-500"} />
        {isOnAir ? (
          <InlineText className="absolute -right-0.5 -top-0.5 flex h-3 w-3">
            <InlineText className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
            <InlineText className="relative inline-flex h-3 w-3 rounded-full bg-red-400" />
          </InlineText>
        ) : null}
      </InlineText>

      <InlineText className="min-w-0">
        <InlineText className="flex items-center gap-1.5 text-xs font-semibold uppercase text-slate-500">
          <Radio size={12} />
          {isOnAir ? t("preferences.developerYouTube.onAir") : t("preferences.developerYouTube.offAir")}
        </InlineText>
        <InlineText className="mt-0.5 flex min-w-0 items-center gap-1.5 text-sm font-semibold">
          <InlineText className="truncate">{t("preferences.developerYouTube.open")}</InlineText>
          <ExternalLink size={13} className="shrink-0 text-slate-500" />
        </InlineText>
      </InlineText>
    </Button>
  );
}

function DeveloperExternalLink({ url, label, icon }: { url: string; label: string; icon: React.ReactNode }) {
  return (
    <Button
      type="button"
      className="flex max-w-full items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
      onClick={() => open_external_url(url)}
    >
      <InlineText className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-white/5">
        {icon}
      </InlineText>
      <InlineText className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
        <InlineText className="truncate">{label}</InlineText>
        <ExternalLink size={13} className="shrink-0 text-slate-500" />
      </InlineText>
    </Button>
  );
}

function open_external_url(url: string) {
  if (!window.BTIH_API) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }

  void window.BTIH_API?.invoke(IPC_CHANNELS.APP.OPEN_EXTERNAL_URL.channelName, { url });
}

function GitHubMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.09 3.29 9.4 7.86 10.93.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.23-1.28-5.23-5.68 0-1.25.45-2.28 1.18-3.08-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.16 1.18.92-.26 1.9-.38 2.88-.39.98.01 1.96.13 2.88.39 2.19-1.49 3.15-1.18 3.15-1.18.63 1.58.24 2.75.12 3.04.74.8 1.18 1.83 1.18 3.08 0 4.42-2.69 5.38-5.25 5.67.41.36.78 1.06.78 2.13 0 1.54-.01 2.78-.01 3.16 0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

function YouTubeMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <rect x="2" y="5" width="20" height="14" rx="4" fill="currentColor" />
      <path d="M10 9.1v5.8l5.2-2.9L10 9.1Z" fill="#fff" />
    </svg>
  );
}
