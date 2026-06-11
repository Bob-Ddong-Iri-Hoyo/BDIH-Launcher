import React from "react";
import { Download, ExternalLink, FileText, FolderOpen, Layers3, PackageOpen, Plus, Search, Settings, Sparkles, Square, Trash2, Wine as WineIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { HOYOPLAY_ICON_URL, STEAM_ICON_URL } from "../../Common/Constant/RuntimeSources";
import { IPC_CHANNELS } from "../../Common/Types/IPC";
import type { BottleLauncherKind } from "../../Common/Types/IPC";
import type { LauncherLogEntryPayload, LauncherLogSnapshotPayload } from "../../Common/Types/IPC";
import type { DxmtVersion, WineVersion } from "../../Common/Types/Wine";
import type { Bottle, CreateBottleInput } from "../Types/Bottle";
import { ContextMenu, ContextMenuItem, ContextMenuPosition } from "./ContextMenu";
import { Dialog } from "./Dialog";
import { ImageButton } from "./ImageButton";
import { InstalledWinePanel } from "./InstalledWinePanel";
import { ProgressBar } from "./ProgressBar";
import { SelectMenu } from "./SelectMenu";
import { label_from_status, StatusBadge, tone_from_status } from "./StatusBadge";

const CHARACTER_BOTTLE_NAMES = [
  "Amber",
  "Acheron",
  "Belle",
  "Diluc",
  "Firefly",
  "Furina",
  "Hu Tao",
  "Kafka",
  "Klee",
  "March 7th",
  "Nahida",
  "Raiden",
  "Ruan Mei",
  "Silver Wolf",
  "Sparkle",
  "Venti",
  "Welt",
  "Wise",
  "Yae",
  "Zhongli",
  "Adela",
  "Adriana",
  "Aya",
  "Bianca",
  "Celine",
  "Chiara",
  "Eleven",
  "Fiora",
  "Hart",
  "Hyejin",
  "Hyunwoo",
  "Irem",
  "Isol",
  "Jackie",
  "Magnus",
  "Nicky",
  "Rio",
  "Sissela",
  "Tazia",
  "Yuki",
];

export function tone_from_bottle_status(
  status: Bottle["status"],
): "success" | "warning" | "info" {
  if (status === "needs-setup") {
    return "warning";
  }

  if (status === "updating") {
    return "info";
  }

  return "success";
}

function bottle_task_progress_label(
  stage: string,
  translate: (key: string) => string,
) {
  if (stage === "download") {
    return translate("main.taskProgress.download");
  }

  return translate("main.taskProgress.estimated");
}

function pick_random_item(items: string[]) {
  return items[Math.floor(Math.random() * items.length)];
}

function generate_bottle_name() {
  return pick_random_item(CHARACTER_BOTTLE_NAMES);
}

function create_bottle_path_from_name(rootPath: string, name: string) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "bottle";
  const trimmedRoot = rootPath.trim().replace(/\/+$/, "") || "~/Library/Application Support/BDIH Launcher/Bottles";
  const root = trimmedRoot.split("/").pop()?.toLowerCase() === slug
    ? trimmedRoot.split("/").slice(0, -1).join("/") || trimmedRoot
    : trimmedRoot;

  return `${root}/${slug}`;
}

function normalize_bottle_prefix_root(rootPath: string, name: string) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "bottle";
  const trimmedRoot = rootPath.trim().replace(/\/+$/, "") || "~/Library/Application Support/BDIH Launcher/Bottles";

  if (trimmedRoot.split("/").pop()?.toLowerCase() === slug) {
    return trimmedRoot.split("/").slice(0, -1).join("/") || trimmedRoot;
  }

  return trimmedRoot;
}

export function DashboardBreadcrumb({
  bottleName,
  onBottleHome,
  onBottleClick,
}: {
  bottleName?: string;
  onBottleHome: () => void;
  onBottleClick?: () => void;
}) {
  const { t } = useTranslation();

  return (
    <nav
      className="flex min-w-0 items-center gap-2 text-xl font-bold text-white"
      aria-label={t("main.breadcrumbLabel")}
    >
      <button
        type="button"
        onClick={onBottleHome}
        className="min-w-0 truncate rounded-md px-1 text-left transition hover:bg-white/10 hover:text-[rgb(var(--accent-soft-text-rgb))]"
      >
        {t("main.bottleHome")}
      </button>
      {bottleName && (
        <>
          <span className="text-slate-500">&gt;</span>
          <button
            type="button"
            onClick={onBottleClick}
            className="min-w-0 truncate rounded-md px-1 text-left text-slate-100 transition hover:bg-white/10 hover:text-[rgb(var(--accent-soft-text-rgb))]"
            aria-current="page"
          >
            {bottleName}
          </button>
        </>
      )}
    </nav>
  );
}

export function BottleCard({
  bottle,
  onClick,
  onContextMenu,
}: {
  bottle: Bottle;
  onClick: () => void;
  onContextMenu?: (
    event: React.MouseEvent<HTMLButtonElement>,
    bottle: Bottle,
  ) => void;
}) {
  const { t } = useTranslation();

  return (
    <button
      type="button"
      onClick={onClick}
      onContextMenu={(event) => onContextMenu?.(event, bottle)}
      className="group flex min-h-40 w-full flex-col rounded-lg border border-white/10 bg-white/[0.04] p-4 text-left transition hover:border-white/20 hover:bg-white/[0.07]"
      aria-label={bottle.name}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#0b1020] ring-1 ring-white/10">
          <Layers3 size={24} className="text-slate-200" />
        </div>
        <StatusBadge
          label={t(`main.bottleStatus.${bottle.status}`)}
          tone={tone_from_bottle_status(bottle.status)}
        />
      </div>
      <span className="line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-slate-100">
        {bottle.name}
      </span>
      <span className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
        {bottle.description}
      </span>
      <div className="mt-auto flex items-center justify-between gap-3 pt-4 text-xs text-slate-400">
        <span>{t("main.bottleApps", { count: bottle.apps.length })}</span>
        <span className="truncate text-slate-500">{bottle.wineVersionId}</span>
      </div>
    </button>
  );
}


function BottleLibraryPanel({
  bottles,
  appCount,
  installedWineCount,
  isInstalledWineOpen,
  onSelectBottle,
  onBottleContextMenu,
  onToggleInstalledWine,
  onCreateBottle,
}: {
  bottles: Bottle[];
  appCount: number;
  installedWineCount: number;
  isInstalledWineOpen: boolean;
  onSelectBottle?: (bottleId: string) => void;
  onBottleContextMenu: (
    event: React.MouseEvent<HTMLButtonElement>,
    bottle: Bottle,
  ) => void;
  onToggleInstalledWine: () => void;
  onCreateBottle: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-white">
            {t("main.bottleLibrary")}
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            {t("main.bottleLibraryDescription", { count: appCount })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-9 w-64 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-slate-500">
            <Search size={15} />
            <span className="text-xs">{t("main.searchReady")}</span>
          </div>
          <button
            type="button"
            aria-expanded={isInstalledWineOpen}
            onClick={onToggleInstalledWine}
            className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition ${
              isInstalledWineOpen
                ? "accent-selection text-white"
                : "border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
            }`}
          >
            <Layers3 size={15} />
            {t("main.installedWine.viewAction")}
            <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[11px] text-slate-200">
              {installedWineCount}
            </span>
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {bottles.map((bottle) => (
          <BottleCard
            key={bottle.id}
            bottle={bottle}
            onClick={() => onSelectBottle?.(bottle.id)}
            onContextMenu={onBottleContextMenu}
          />
        ))}
      </div>

      <button
        type="button"
        className="accent-primary fixed bottom-8 right-8 z-30 inline-flex h-12 w-12 items-center justify-center rounded-full shadow-xl shadow-black/35 transition hover:scale-105 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent-rgb)/0.45)]"
        aria-label={t("main.createBottle.action")}
        title={t("main.createBottle.action")}
        onClick={onCreateBottle}
      >
        <Plus size={24} />
      </button>
    </div>
  );
}

export function DashboardHomePanel({
  wineVersions,
  dxmtVersions,
  selectedWineVersionId,
  selectedDxmtVersionId,
  installPath,
  isLoadingWineVersions,
  isLoadingDxmtVersions,
  bottles,
  isInstalledWineOpen,
  onToggleInstalledWine,
  onSelectWineVersion,
  onInstallWineVersion,
  onSelectDxmtVersion,
  onInstallDxmtVersion,
  onSelectBottle,
  onBottleContextMenu,
  onCreateBottle,
}: {
  wineVersions: WineVersion[];
  dxmtVersions: DxmtVersion[];
  selectedWineVersionId: string;
  selectedDxmtVersionId: string;
  installPath: string;
  isLoadingWineVersions: boolean;
  isLoadingDxmtVersions: boolean;
  bottles: Bottle[];
  isInstalledWineOpen: boolean;
  onToggleInstalledWine: () => void;
  onSelectWineVersion: (versionId: string) => void;
  onInstallWineVersion?: (versionId: string) => void;
  onSelectDxmtVersion?: (versionId: string) => void;
  onInstallDxmtVersion?: (versionId: string) => void;
  onSelectBottle?: (bottleId: string) => void;
  onBottleContextMenu: (
    event: React.MouseEvent<HTMLButtonElement>,
    bottle: Bottle,
  ) => void;
  onCreateBottle: () => void;
}) {
  const installedWineCount = wineVersions.filter(
    (version) =>
      version.status === "installed" || version.status === "completed",
  ).length;
  const appCount = bottles.reduce(
    (total, bottle) => total + bottle.apps.length,
    0,
  );
  const { t } = useTranslation();

  return (
    <div className="space-y-6 p-6">
      <section>
        <BottleLibraryPanel
          bottles={bottles}
          appCount={appCount}
          installedWineCount={installedWineCount}
          isInstalledWineOpen={isInstalledWineOpen}
          onSelectBottle={onSelectBottle}
          onBottleContextMenu={onBottleContextMenu}
          onToggleInstalledWine={onToggleInstalledWine}
          onCreateBottle={onCreateBottle}
        />
      </section>

      <Dialog
        open={isInstalledWineOpen}
        title={t("main.installedWine.title")}
        description={t("main.installedWine.description")}
        tone={isLoadingWineVersions || isLoadingDxmtVersions ? "info" : "neutral"}
        icon={Layers3}
        placement="center"
        widthClassName="max-w-5xl"
        onClose={onToggleInstalledWine}
      >
        <div className="max-h-[72vh] space-y-5 overflow-y-auto pr-1">
          <InstalledWinePanel
            wineVersions={wineVersions}
            selectedWineVersionId={selectedWineVersionId}
            installPath={installPath}
            className="border-0 bg-transparent p-0 shadow-none"
            onSelectWineVersion={onSelectWineVersion}
            showHeader={false}
          />
          <RuntimeDownloadPanel
            wineVersions={wineVersions}
            dxmtVersions={dxmtVersions}
            selectedWineVersionId={selectedWineVersionId}
            selectedDxmtVersionId={selectedDxmtVersionId}
            installPath={installPath}
            isLoadingWineVersions={isLoadingWineVersions}
            isLoadingDxmtVersions={isLoadingDxmtVersions}
            onSelectWineVersion={onSelectWineVersion}
            onInstallWineVersion={onInstallWineVersion}
            onSelectDxmtVersion={onSelectDxmtVersion}
            onInstallDxmtVersion={onInstallDxmtVersion}
          />
        </div>
      </Dialog>
    </div>
  );
}

function RuntimeDownloadPanel({
  wineVersions,
  dxmtVersions,
  selectedWineVersionId,
  selectedDxmtVersionId,
  installPath,
  isLoadingWineVersions,
  isLoadingDxmtVersions,
  onSelectWineVersion,
  onInstallWineVersion,
  onSelectDxmtVersion,
  onInstallDxmtVersion,
}: {
  wineVersions: WineVersion[];
  dxmtVersions: DxmtVersion[];
  selectedWineVersionId: string;
  selectedDxmtVersionId: string;
  installPath: string;
  isLoadingWineVersions: boolean;
  isLoadingDxmtVersions: boolean;
  onSelectWineVersion: (versionId: string) => void;
  onInstallWineVersion?: (versionId: string) => void;
  onSelectDxmtVersion?: (versionId: string) => void;
  onInstallDxmtVersion?: (versionId: string) => void;
}) {
  const { t } = useTranslation();
  const visibleWineVersions = wineVersions;
  const visibleDxmtVersions = dxmtVersions;

  return (
    <section className="rounded-lg border border-white/10 bg-[#101827] p-5 shadow-2xl shadow-black/20">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-white">{t("main.runtimeDownloads.title")}</h3>
            <StatusBadge label={isLoadingWineVersions || isLoadingDxmtVersions ? t("common.syncing") : t("common.ready")} tone={isLoadingWineVersions || isLoadingDxmtVersions ? "info" : "success"} />
          </div>
          <p className="mt-1 text-sm leading-5 text-slate-500">{t("main.runtimeDownloads.description")}</p>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <div className="min-w-0">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Wine</p>
          <div className="space-y-2">
            {visibleWineVersions.map((version) => (
              <RuntimeCompactCard
                key={version.id}
                version={version}
                icon={<WineIcon size={17} />}
                path={version.path ?? installPath}
                isSelected={version.id === selectedWineVersionId}
                onSelect={onSelectWineVersion}
                onInstall={onInstallWineVersion}
              />
            ))}
            {visibleWineVersions.length === 0 ? <RuntimeEmptyMessage>{t("main.runtimeDownloads.noWine")}</RuntimeEmptyMessage> : null}
          </div>
        </div>

        <div className="min-w-0">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">DXMT</p>
          <div className="space-y-2">
            {visibleDxmtVersions.map((version) => (
              <RuntimeCompactCard
                key={version.id}
                version={version}
                icon={<PackageOpen size={17} />}
                path={version.path}
                isSelected={version.id === selectedDxmtVersionId}
                onSelect={onSelectDxmtVersion}
                onInstall={onInstallDxmtVersion}
              />
            ))}
            {visibleDxmtVersions.length === 0 ? <RuntimeEmptyMessage>{t("main.runtimeDownloads.noDxmt")}</RuntimeEmptyMessage> : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function RuntimeCompactCard({
  version,
  icon,
  path,
  isSelected,
  onSelect,
  onInstall,
}: {
  version: WineVersion | DxmtVersion;
  icon: React.ReactNode;
  path?: string;
  isSelected: boolean;
  onSelect?: (versionId: string) => void;
  onInstall?: (versionId: string) => void;
}) {
  const { t } = useTranslation();
  const isWorking = ["downloading", "installing", "extracting"].includes(version.status);
  const canInstall = version.status === "available" || version.status === "idle" || version.status === "error";

  return (
    <article className={`rounded-lg border p-3 transition ${isSelected ? "accent-selection" : "border-white/10 bg-white/[0.04]"}`}>
      <div className="grid min-w-0 items-center gap-3 md:grid-cols-[minmax(0,1fr)_7rem_auto]">
        <button type="button" className="flex min-w-0 items-center gap-3 text-left" onClick={() => onSelect?.(version.id)}>
          <span className="accent-text flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-800 ring-1 ring-white/10">
            {icon}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-slate-100">{version.name}</span>
            <span className="mt-0.5 block truncate text-[11px] text-slate-500">{version.version}{path ? ` - ${path}` : ""}</span>
          </span>
        </button>
        <div className="min-w-0">
          <ProgressBar progressValue={version.progress} showValue size="sm" tone={isWorking ? "blue" : "emerald"} animated={isWorking} />
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2">
          <StatusBadge label={label_from_status(version.status, t)} tone={tone_from_status(version.status)} />
        <button
          type="button"
          disabled={!canInstall}
          onClick={() => onInstall?.(version.id)}
          className="accent-primary inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-500"
        >
          <Download size={14} />
          {t("common.actions.install")}
        </button>
        </div>
      </div>
    </article>
  );
}

function RuntimeEmptyMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.03] p-5 text-sm leading-6 text-slate-500">
      {children}
    </div>
  );
}

export function BottleDetailPanel({
  bottle,
  selectedWineVersionId,
  wineRuntimePath,
  appLogoSrc,
  onRevealBottle,
  onInstallBottleLauncher,
  onLaunchBottleApp,
  onLaunchBottleAppWithArgs,
  onStopBottleApp,
  onDeleteBottleApp,
  onRegisterBottleExecutable,
}: {
  bottle: Bottle;
  selectedWineVersionId: string;
  wineRuntimePath?: string;
  appLogoSrc: string;
  onRevealBottle?: (path: string) => void;
  onInstallBottleLauncher?: (bottleId: string, launcher: BottleLauncherKind) => void;
  onLaunchBottleApp?: (bottleId: string, appId: string) => void;
  onLaunchBottleAppWithArgs?: (bottleId: string, appId: string, executableArgs: string[]) => void;
  onStopBottleApp?: (bottleId: string, appId: string) => void;
  onDeleteBottleApp?: (bottleId: string, appId: string) => void;
  onRegisterBottleExecutable?: (bottleId: string, executablePath: string) => void;
}) {
  const { t } = useTranslation();
  const [isRecipeOpen, setIsRecipeOpen] = React.useState(false);
  const isBottleWorking = bottle.status === "updating" || Boolean(
    bottle.setupTask && ["setup", "dxmt", "download", "install"].includes(bottle.setupTask.stage),
  );

  return (
    <div className="space-y-5 p-6">
      <BottleActionBar
        bottle={bottle}
        wineRuntimePath={wineRuntimePath}
        onInstallBottleLauncher={onInstallBottleLauncher}
        onRegisterBottleExecutable={onRegisterBottleExecutable}
      />

      <section className="rounded-xl border border-white/10 bg-white/[0.04] p-5">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <StatusBadge
              label={t(`main.bottleStatus.${bottle.status}`)}
              tone={tone_from_bottle_status(bottle.status)}
              animated={isBottleWorking}
            />
            {bottle.setupTask ? (
              <span className={`rounded-md border border-white/10 bg-[#0b1020] px-2 py-1 text-[11px] font-semibold text-slate-400 ${isBottleWorking ? "badge-ripple" : ""}`}>
                {t(`main.installers.stage.${bottle.setupTask.stage}`)}
              </span>
            ) : null}
          </div>
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <h3 className="min-w-0 truncate text-2xl font-bold tracking-normal text-white">
              {bottle.name}
            </h3>
            <button
              type="button"
              onClick={() => setIsRecipeOpen(true)}
              className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
            >
              <Settings size={14} />
              {t("main.recipeViewAction")}
            </button>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            {bottle.description}
          </p>
          <div className="mt-3 grid gap-2 rounded-lg border border-white/10 bg-[#0b1020] p-3 text-xs leading-5 text-slate-400 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <p className="min-w-0 break-all">{bottle.path}</p>
            <button
              type="button"
              onClick={() => onRevealBottle?.(bottle.path)}
              className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
            >
              <FolderOpen size={14} />
              {t("main.bottleInfo.openInFinder")}
            </button>
          </div>
        </div>

        {bottle.setupTask ? (
          <div className="mt-4 rounded-lg border border-white/10 bg-[#0b1020] p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
              <p className="min-w-0 truncate text-xs text-slate-500">
                {bottle.setupTask.message}
              </p>
              <span className="text-[11px] font-semibold text-slate-400">
                {bottle_task_progress_label(bottle.setupTask.stage, t)}
              </span>
            </div>
            <ProgressBar
              progressValue={bottle.setupTask.progress}
              showValue
              size="sm"
              tone={bottle.setupTask.stage === "error" ? "rose" : "emerald"}
              animated={isBottleWorking}
            />
          </div>
        ) : null}
      </section>

      <AppLibraryPanel
        bottle={bottle}
        selectedWineVersionId={selectedWineVersionId}
        appLogoSrc={appLogoSrc}
        onLaunchBottleApp={onLaunchBottleApp}
        onLaunchBottleAppWithArgs={onLaunchBottleAppWithArgs}
        onStopBottleApp={onStopBottleApp}
        onDeleteBottleApp={onDeleteBottleApp}
      />

      <RecipeDialog
        bottle={bottle}
        open={isRecipeOpen}
        onClose={() => setIsRecipeOpen(false)}
      />
    </div>
  );
}

function BottleActionBar({
  bottle,
  wineRuntimePath,
  onInstallBottleLauncher,
  onRegisterBottleExecutable,
}: {
  bottle: Bottle;
  wineRuntimePath?: string;
  onInstallBottleLauncher?: (bottleId: string, launcher: BottleLauncherKind) => void;
  onRegisterBottleExecutable?: (bottleId: string, executablePath: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <section className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3">
      <LauncherInstallIconButton
        bottle={bottle}
        launcher="steam"
        iconSrc={STEAM_ICON_URL}
        label={t("main.installers.steam.title")}
        actionLabel={t("main.installers.installSteam")}
        onInstallBottleLauncher={onInstallBottleLauncher}
      />
      <LauncherInstallIconButton
        bottle={bottle}
        launcher="hoyoplay"
        iconSrc={HOYOPLAY_ICON_URL}
        label={t("main.installers.hoyoplay.title")}
        actionLabel={t("main.installers.installHoyoplay")}
        onInstallBottleLauncher={onInstallBottleLauncher}
      />
      <div className="hidden min-w-8 flex-1 border-t border-dashed border-white/10 sm:block" />
      <DirectExecutableAction
        bottle={bottle}
        wineRuntimePath={wineRuntimePath}
        onRegisterBottleExecutable={onRegisterBottleExecutable}
      />
    </section>
  );
}

function DirectExecutableAction({
  bottle,
  wineRuntimePath,
  onRegisterBottleExecutable,
}: {
  bottle: Bottle;
  wineRuntimePath?: string;
  onRegisterBottleExecutable?: (bottleId: string, executablePath: string) => void;
}) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = React.useState(false);
  const [executablePath, setExecutablePath] = React.useState("");
  const [statusMessage, setStatusMessage] = React.useState("");
  const canRun = executablePath.trim().length > 0;

  async function browse_executable() {
    const result = await window.BTIH_API?.invoke(
      IPC_CHANNELS.APP.SELECT_FILE.channelName,
      {
        title: t("main.runner.selectFileTitle"),
        defaultPath: bottle.path,
        filters: [
          { name: "Windows executables", extensions: ["exe", "msi", "bat", "cmd"] },
          { name: "All files", extensions: ["*"] },
        ],
      },
    );

    if (!result?.canceled && result?.path) {
      setExecutablePath(to_wine_z_path(result.path));
    }
  }

  async function run_executable() {
    if (!canRun) {
      setStatusMessage(t("main.runner.pathRequired"));
      return;
    }

    if (!wineRuntimePath) {
      setStatusMessage(t("main.runner.wineRuntimeMissing", { versionId: bottle.wineVersionId }));
      return;
    }

    setStatusMessage(t("main.runner.starting"));
    const result = await (
      window.BTIH_API?.invoke(
        IPC_CHANNELS.BOTTLE.RUN_EXECUTABLE.channelName,
        {
        bottleId: bottle.id,
        bottleName: bottle.name,
        bottlePath: bottle.path,
        wineVersionId: bottle.wineVersionId,
        wineRuntimePath,
        appName: app_name_from_executable_path(executablePath.trim()),
        executablePath: executablePath.trim(),
        },
      ) ?? Promise.resolve(undefined)
    )
      .catch((error) => ({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }));

    if (result?.ok) {
      setStatusMessage(t("main.runner.started"));
      onRegisterBottleExecutable?.(bottle.id, executablePath.trim());
      setIsOpen(false);
      return;
    }

    setStatusMessage(result?.error || t("main.runner.failed"));
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="accent-primary inline-flex h-11 min-w-36 shrink-0 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition hover:brightness-110"
      >
        <ExternalLink size={16} />
        {t("main.runner.title")}
      </button>
      <Dialog
        open={isOpen}
        title={t("main.runner.title")}
        description={t("main.runner.description")}
        tone="info"
        icon={ExternalLink}
        placement="center"
        widthClassName="max-w-2xl"
        onClose={() => setIsOpen(false)}
        actions={[
          {
            label: t("common.actions.cancel"),
            variant: "secondary",
            onClick: () => setIsOpen(false),
          },
          {
            label: t("main.runner.run"),
            icon: ExternalLink,
            variant: "primary",
            disabled: !canRun,
            onClick: () => void run_executable(),
          },
        ]}
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-white/10 bg-[#0b1020] p-4">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-100">{t("main.runner.manualTitle")}</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">{t("main.runner.manualDescription")}</p>
              </div>
              <button
                type="button"
                onClick={() => void browse_executable()}
                className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
              >
                <FolderOpen size={14} />
                {t("main.runner.browseFile")}
              </button>
            </div>
            <input
              value={executablePath}
              onChange={(event) => setExecutablePath(event.target.value)}
              placeholder={t("main.runner.pathPlaceholder")}
              className="h-11 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-[rgb(var(--accent-rgb)/0.55)]"
            />
            <p className="mt-2 text-xs leading-5 text-slate-500">{t("main.runner.pathHint")}</p>
          </div>

          {statusMessage ? (
            <p className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs leading-5 text-slate-500">
              {statusMessage}
            </p>
          ) : null}
        </div>
      </Dialog>
    </>
  );
}

function to_wine_z_path(targetPath: string): string {
  if (!targetPath.startsWith("/")) {
    return targetPath;
  }

  return `Z:${targetPath.replace(/\//g, "\\")}`;
}

function app_name_from_executable_path(executablePath: string): string {
  const normalizedPath = executablePath.replace(/\\/g, "/");
  const fileName = normalizedPath.split("/").filter(Boolean).pop() ?? "Wine App";

  return fileName.replace(/\.[^.]+$/, "") || "Wine App";
}

function LauncherInstallIconButton({
  bottle,
  launcher,
  iconSrc,
  label,
  actionLabel,
  onInstallBottleLauncher,
}: {
  bottle: Bottle;
  launcher: BottleLauncherKind;
  iconSrc: string;
  label: string;
  actionLabel: string;
  onInstallBottleLauncher?: (bottleId: string, launcher: BottleLauncherKind) => void;
}) {
  const { t } = useTranslation();
  const task = bottle.launcherTasks?.[launcher];
  const isWorking = task ? ["setup", "dxmt", "download", "install"].includes(task.stage) : false;

  return (
    <button
      type="button"
      disabled={isWorking}
      title={isWorking ? `${label} ${t(`main.installers.stage.${task?.stage ?? "install"}`)}` : actionLabel}
      onClick={() => onInstallBottleLauncher?.(bottle.id, launcher)}
      className={`group relative inline-flex h-11 min-w-28 shrink-0 items-center justify-center gap-2 overflow-hidden rounded-xl border border-white/10 bg-[#0b1020] px-3 transition hover:border-white/20 hover:bg-white/[0.08] disabled:opacity-80 ${isWorking ? "disabled:cursor-wait" : "disabled:cursor-not-allowed"}`}
    >
      <FaviconIcon src={iconSrc} label={label} />
      <span className="max-w-24 truncate text-xs font-semibold text-slate-300">{label}</span>
      <span className="pointer-events-none absolute inset-x-2 bottom-1 translate-y-3 rounded-md bg-black/75 px-2 py-1 text-center text-[10px] font-semibold text-white opacity-0 shadow-lg transition group-hover:translate-y-0 group-hover:opacity-100">
        {isWorking ? t("main.installers.installing") : actionLabel}
      </span>
      {task ? (
        <span className="absolute inset-x-2 top-2 h-1 overflow-hidden rounded-full bg-white/10">
          <span
            className={`progress-wave block h-full rounded-full ${task.stage === "error" ? "bg-rose-400" : "bg-emerald-400"}`}
            style={{ width: `${Math.max(0, Math.min(100, task.progress))}%` }}
          />
        </span>
      ) : null}
    </button>
  );
}

function FaviconIcon({ src, label }: { src: string; label: string }) {
  const [hasError, setHasError] = React.useState(false);

  if (hasError) {
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-[10px] font-bold text-slate-100 ring-1 ring-white/10">
        {label.slice(0, 2)}
      </span>
    );
  }

  return (
    <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-lg bg-white/10 p-1 ring-1 ring-white/10">
      <img
        className="h-full w-full object-contain"
        src={src}
        alt=""
        draggable={false}
        onError={() => setHasError(true)}
      />
    </span>
  );
}

function AppLibraryPanel({
  bottle,
  selectedWineVersionId,
  appLogoSrc,
  onLaunchBottleApp,
  onLaunchBottleAppWithArgs,
  onStopBottleApp,
  onDeleteBottleApp,
}: {
  bottle: Bottle;
  selectedWineVersionId: string;
  appLogoSrc: string;
  onLaunchBottleApp?: (bottleId: string, appId: string) => void;
  onLaunchBottleAppWithArgs?: (bottleId: string, appId: string, executableArgs: string[]) => void;
  onStopBottleApp?: (bottleId: string, appId: string) => void;
  onDeleteBottleApp?: (bottleId: string, appId: string) => void;
}) {
  const { t } = useTranslation();
  const [contextMenuState, setContextMenuState] = React.useState<{
    position: ContextMenuPosition;
    appId: string;
  } | null>(null);
  const [selectedLogAppId, setSelectedLogAppId] = React.useState<string | null>(null);
  const [appLogText, setAppLogText] = React.useState("");
  const [isAppLogLoading, setIsAppLogLoading] = React.useState(false);
  const contextApp = bottle.apps.find((app) => app.id === contextMenuState?.appId);
  const selectedLogApp = bottle.apps.find((app) => app.id === selectedLogAppId);
  const appContextMenuItems = React.useMemo<ContextMenuItem[]>(() => {
    if (!contextApp) {
      return [];
    }

    return [
      {
        id: "run",
        label: t("main.appContext.run"),
        icon: ExternalLink,
        onSelect: () => onLaunchBottleApp?.(bottle.id, contextApp.id),
      },
      {
        id: "run-with-args",
        label: t("main.appContext.runWithArgs"),
        icon: Settings,
        onSelect: () => {
          const rawArgs = window.prompt(t("main.appContext.argumentsPrompt"), contextApp.executableArgs?.join(" ") ?? "");

          if (rawArgs === null) {
            return;
          }

          onLaunchBottleAppWithArgs?.(bottle.id, contextApp.id, split_executable_args(rawArgs));
        },
      },
      {
        id: "stop",
        label: t("main.appContext.stop"),
        icon: Square,
        disabled: !contextApp.processId,
        onSelect: () => onStopBottleApp?.(bottle.id, contextApp.id),
      },
      {
        id: "show-logs",
        label: t("main.appContext.showLogs"),
        icon: FileText,
        separatorBefore: true,
        onSelect: () => void open_app_log_dialog(contextApp.id),
      },
      {
        id: "delete",
        label: t("main.appContext.delete"),
        icon: Trash2,
        danger: true,
        onSelect: () => {
          if (window.confirm(t("main.appContext.deleteConfirm", { name: contextApp.name }))) {
            onDeleteBottleApp?.(bottle.id, contextApp.id);
          }
        },
      },
    ];
  }, [bottle.id, contextApp, onDeleteBottleApp, onLaunchBottleApp, onLaunchBottleAppWithArgs, onStopBottleApp, t]);

  async function open_app_log_dialog(appId: string) {
    const app = bottle.apps.find((candidateApp) => candidateApp.id === appId);

    if (!app) {
      return;
    }

    setSelectedLogAppId(appId);
    setIsAppLogLoading(true);
    setAppLogText(t("main.appContext.loadingLogs"));

    try {
      const snapshot = (await window.BTIH_API?.invoke(
        IPC_CHANNELS.APP.GET_LOG_SNAPSHOT.channelName,
        undefined as never,
      )) as LauncherLogSnapshotPayload | undefined;
      const entries = app_log_entries_from_snapshot(snapshot, bottle, app);

      setAppLogText(entries.length > 0
        ? entries.slice(-400).map(format_compact_log_entry).join("\n")
        : t("main.appContext.noLogs"));
    } catch (error) {
      setAppLogText(error instanceof Error ? error.message : String(error));
    } finally {
      setIsAppLogLoading(false);
    }
  }

  function open_app_context_menu(event: React.MouseEvent, appId: string) {
    event.preventDefault();
    setContextMenuState({
      appId,
      position: {
        x: event.clientX,
        y: event.clientY,
      },
    });
  }

  return (
    <>
      <section className="min-h-[24rem] rounded-xl border border-white/10 bg-white/[0.04] p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-white">
              {t("main.bottleGames")}
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              {t("main.bottleApps", { count: bottle.apps.length })}
            </p>
          </div>
        </div>
        {bottle.apps.length === 0 ? (
          <div className="flex min-h-56 items-center justify-center rounded-xl border border-dashed border-white/10 bg-[#0b1020] px-6 text-center text-sm leading-6 text-slate-500">
            {t("main.bottleAppsEmpty")}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {bottle.apps.map((app) => (
              <ImageButton
                key={app.id}
                src={app.iconSrc || appLogoSrc}
                name={app.name}
                subtitle={app.launchError ? `${t("main.appContext.launchFailed")}: ${app.launchError}` : `${app.subtitle} · ${app.lastPlayedKey ? t(app.lastPlayedKey) : app.lastPlayed}`}
                isActive={app.wineVersionId === selectedWineVersionId}
                isRunning={Boolean(app.processId)}
                hasError={Boolean(app.launchError)}
                actionLabel={
                  app.status === "needs-prefix"
                    ? t("common.actions.createPrefix")
                    : t("common.actions.run")
                }
                onClick={() => onLaunchBottleApp?.(bottle.id, app.id)}
                onContextMenu={(event) => open_app_context_menu(event, app.id)}
              />
            ))}
          </div>
        )}
        <ContextMenu
          open={Boolean(contextMenuState && contextApp)}
          position={contextMenuState?.position}
          items={appContextMenuItems}
          onClose={() => setContextMenuState(null)}
        />
      </section>

      <Dialog
        open={Boolean(selectedLogAppId)}
        title={t("main.appContext.appLogsTitle", { name: selectedLogApp?.name ?? "App" })}
        description={t("main.appContext.appLogsDescription")}
        tone={isAppLogLoading ? "info" : "neutral"}
        icon={FileText}
        placement="center"
        widthClassName="max-w-4xl"
        onClose={() => {
          setSelectedLogAppId(null);
          setAppLogText("");
        }}
        actions={[
          {
            label: t("common.actions.close"),
            variant: "secondary",
            onClick: () => {
              setSelectedLogAppId(null);
              setAppLogText("");
            },
          },
        ]}
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
            <p className="min-w-0 truncate text-xs text-slate-500">
              {selectedLogApp?.name ?? "-"} · {bottle.name}
            </p>
            <StatusBadge
              label={isAppLogLoading ? t("common.syncing") : t("common.ready")}
              tone={isAppLogLoading ? "info" : "success"}
            />
          </div>
          <pre className="max-h-[60vh] min-h-80 overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-[#050914] p-4 font-mono text-xs leading-5 text-slate-200 shadow-inner shadow-black/30">
            {appLogText || t("main.appContext.noLogs")}
          </pre>
        </div>
      </Dialog>
    </>
  );
}

function split_executable_args(rawArgs: string): string[] {
  return rawArgs
    .match(/(?:[^\s"]+|"[^"]*")+/g)
    ?.map((arg) => arg.replace(/^"|"$/g, ""))
    .filter(Boolean) ?? [];
}

function app_log_entries_from_snapshot(
  snapshot: LauncherLogSnapshotPayload | undefined,
  bottle: Bottle,
  app: Bottle["apps"][number],
): LauncherLogEntryPayload[] {
  if (!snapshot) {
    return [];
  }

  const bottleTokens = build_log_tokens([bottle.id, bottle.name]);
  const appTokens = build_log_tokens([app.id, app.name]);
  const matchingSessionIds = new Set(
    snapshot.sessions
      .filter((session) => {
        if (session.kind !== "bottle") {
          return false;
        }

        const sessionText = build_log_search_text([
          session.id,
          session.label,
          session.logFileName,
          session.bottleId,
          session.bottleName,
        ]);

        return log_text_matches_any_token(sessionText, bottleTokens)
          && log_text_matches_any_token(sessionText, appTokens);
      })
      .map((session) => session.id),
  );

  return snapshot.entries.filter((entry) => {
    if (entry.category !== "wine") {
      return false;
    }

    if (matchingSessionIds.has(entry.sessionId)) {
      return true;
    }

    const entryText = build_log_search_text([
      entry.sessionId,
      entry.source,
      entry.bottleId,
      entry.bottleName,
      entry.message,
    ]);

    return log_text_matches_any_token(entryText, bottleTokens)
      && log_text_matches_any_token(entryText, appTokens);
  });
}

function build_log_tokens(values: Array<string | undefined>): string[] {
  const tokens = new Set<string>();

  values.forEach((value) => {
    const rawValue = value?.trim().toLowerCase();

    if (!rawValue) {
      return;
    }

    tokens.add(rawValue);

    const slug = normalize_log_slug(rawValue);

    if (slug) {
      tokens.add(slug);
    }
  });

  return Array.from(tokens);
}

function build_log_search_text(values: Array<string | undefined>): string {
  return values
    .flatMap((value) => {
      const rawValue = value?.trim().toLowerCase();

      if (!rawValue) {
        return [];
      }

      const slug = normalize_log_slug(rawValue);

      return slug ? [rawValue, slug] : [rawValue];
    })
    .join(" ");
}

function normalize_log_slug(value: string): string {
  return value
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function log_text_matches_any_token(text: string, tokens: string[]): boolean {
  return tokens.some((token) => token.length > 0 && text.includes(token));
}

function format_compact_log_entry(entry: LauncherLogEntryPayload): string {
  const source = entry.source ? ` [${entry.source}]` : "";

  return `${format_compact_log_time(entry.timestamp)} [${entry.level.toUpperCase()}]${source} ${entry.message}`;
}

function format_compact_log_time(timestamp: string): string {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function RecipeDialog({
  bottle,
  open,
  onClose,
}: {
  bottle: Bottle;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  return (
      <Dialog
        open={open}
        title={t("main.recipeSettings")}
        description={t("main.recipeSettingsDescription")}
        tone="info"
        icon={Settings}
        placement="center"
        widthClassName="max-w-xl"
        onClose={onClose}
        actions={[
          {
            label: t("common.actions.close"),
            variant: "secondary",
            onClick: onClose,
          },
        ]}
      >
        <div className="grid gap-3 text-xs">
          <InfoRow label={t("main.recipeInfo.wineVersion")} value={bottle.wineVersionId} />
          <InfoRow label={t("main.recipeInfo.dxmtVersion")} value={bottle.dxmtVersionId || "-"} />
          <InfoRow label={t("main.recipeInfo.prefixPath")} value={bottle.path} breakAll />
        </div>
      </Dialog>
  );
}

function InfoRow({ label, value, breakAll = false }: { label: string; value?: string; breakAll?: boolean }) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#0b1020] p-3">
      <p className="text-slate-500">{label}</p>
      <p className={`mt-1 text-slate-300 ${breakAll ? "break-all" : "truncate"}`}>{value || "-"}</p>
    </div>
  );
}

export function CreateBottleDialog({
  open,
  wineVersions,
  dxmtVersions,
  selectedWineVersionId,
  selectedDxmtVersionId,
  bottlePrefixPath,
  onSelectBottlePrefixPath,
  onClose,
  onCreateBottle,
}: {
  open: boolean;
  wineVersions: WineVersion[];
  dxmtVersions: DxmtVersion[];
  selectedWineVersionId: string;
  selectedDxmtVersionId: string;
  bottlePrefixPath: string;
  onSelectBottlePrefixPath?: (currentPath: string) => Promise<string | undefined>;
  onClose: () => void;
  onCreateBottle?: (input: CreateBottleInput) => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = React.useState<CreateBottleInput>({
    name: "",
    wineVersionId: selectedWineVersionId,
    dxmtVersionId: selectedDxmtVersionId,
    prefixPath: bottlePrefixPath,
    description: "",
  });
  const installedWineVersions = React.useMemo(
    () =>
      wineVersions.filter(
        (version) =>
          version.status === "installed" || version.status === "completed",
      ),
    [wineVersions],
  );
  const selectableWineVersions = React.useMemo(
    () =>
      installedWineVersions.length > 0 ? installedWineVersions : wineVersions,
    [installedWineVersions, wineVersions],
  );
  const installedDxmtVersions = React.useMemo(
    () =>
      dxmtVersions.filter(
        (version) =>
          version.status === "installed" || version.status === "completed",
      ),
    [dxmtVersions],
  );
  const selectableDxmtVersions = React.useMemo(
    () =>
      installedDxmtVersions.length > 0 ? installedDxmtVersions : dxmtVersions,
    [dxmtVersions, installedDxmtVersions],
  );
  const wineOptions = selectableWineVersions.map((version) => ({
    value: version.id,
    label: version.name,
    description: version.version,
  }));
  const dxmtOptions = selectableDxmtVersions.map((version) => ({
    value: version.id,
    label: version.name,
    description: version.version,
  }));
  const canCreateBottle =
    form.name.trim().length > 0 &&
    form.wineVersionId.trim().length > 0 &&
    form.dxmtVersionId.trim().length > 0 &&
    form.prefixPath.trim().length > 0;
  const normalizedPrefixPath = normalize_bottle_prefix_root(form.prefixPath, form.name);
  const computedBottlePath = create_bottle_path_from_name(normalizedPrefixPath, form.name);

  React.useEffect(() => {
    if (!open) {
      return;
    }

    const nextName = generate_bottle_name();
    setForm({
      name: nextName,
      wineVersionId:
        selectedWineVersionId || selectableWineVersions[0]?.id || "",
      dxmtVersionId:
        selectedDxmtVersionId || selectableDxmtVersions[0]?.id || "",
      prefixPath: bottlePrefixPath,
      description: "",
    });
  }, [bottlePrefixPath, open, selectedDxmtVersionId, selectedWineVersionId, selectableDxmtVersions, selectableWineVersions]);

  function update_form<K extends keyof CreateBottleInput>(
    key: K,
    value: CreateBottleInput[K],
  ) {
    setForm((currentForm) => ({
      ...currentForm,
      [key]: value,
    }));
  }

  function update_name(name: string) {
    setForm((currentForm) => ({
      ...currentForm,
      name,
    }));
  }

  function randomize_name() {
    const nextName = generate_bottle_name();
    setForm((currentForm) => ({
      ...currentForm,
      name: nextName,
    }));
  }

  function update_prefix_path(prefixPath: string) {
    update_form("prefixPath", prefixPath);
  }

  function reset_prefix_path_to_default() {
    setForm((currentForm) => ({
      ...currentForm,
      prefixPath: bottlePrefixPath,
    }));
  }

  async function browse_prefix_path(event?: React.MouseEvent<HTMLButtonElement>) {
    event?.preventDefault();
    event?.stopPropagation();

    const selectedPath = await onSelectBottlePrefixPath?.(form.prefixPath);

    if (selectedPath) {
      update_prefix_path(normalize_bottle_prefix_root(selectedPath, form.name));
    }
  }

  function submit() {
    if (!canCreateBottle) {
      return;
    }

    onCreateBottle?.({
      name: form.name.trim(),
      wineVersionId: form.wineVersionId,
      dxmtVersionId: form.dxmtVersionId,
      prefixPath: normalizedPrefixPath,
      description: form.description.trim(),
    });
    onClose();
  }

  return (
    <Dialog
      open={open}
      title={t("main.createBottle.title")}
      description={t("main.createBottle.description")}
      tone="info"
      icon={Layers3}
      placement="center"
      widthClassName="max-w-xl"
      onClose={onClose}
      actions={[
        {
          label: t("common.actions.cancel"),
          variant: "secondary",
          onClick: onClose,
        },
        {
          label: t("main.createBottle.submit"),
          icon: Plus,
          variant: "primary",
          disabled: !canCreateBottle,
          autoFocus: true,
          onClick: submit,
        },
      ]}
    >
      <div className="grid gap-4">
        <label className="grid gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t("main.createBottle.nameLabel")}
          </span>
          <div className="flex gap-2">
            <input
              value={form.name}
              onChange={(event) => update_name(event.target.value)}
              placeholder={t("main.createBottle.namePlaceholder")}
              className="h-11 min-w-0 flex-1 rounded-lg border border-white/10 bg-[#0b1020] px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-[rgb(var(--accent-rgb)/0.55)]"
            />
            <button
              type="button"
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
              onClick={randomize_name}
            >
              <Sparkles size={16} />
              {t("main.createBottle.randomName")}
            </button>
          </div>
        </label>

        <label className="grid gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t("main.createBottle.wineLabel")}
          </span>
          <SelectMenu
            value={form.wineVersionId}
            label={t("main.createBottle.wineLabel")}
            options={wineOptions}
            onChange={(value) => update_form("wineVersionId", value)}
          />
        </label>

        <label className="grid gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t("main.createBottle.dxmtLabel")}
          </span>
          <SelectMenu
            value={form.dxmtVersionId}
            label={t("main.createBottle.dxmtLabel")}
            options={dxmtOptions}
            onChange={(value) => update_form("dxmtVersionId", value)}
          />
        </label>

        <div className="grid gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t("main.createBottle.pathLabel")}
          </span>
          <div className="flex gap-2">
            <input
              value={form.prefixPath}
              onChange={(event) => update_prefix_path(event.target.value)}
              placeholder={t("main.createBottle.pathPlaceholder")}
              className="h-11 min-w-0 flex-1 rounded-lg border border-white/10 bg-[#0b1020] px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-[rgb(var(--accent-rgb)/0.55)]"
            />
            <button
              type="button"
              onClick={(event) => void browse_prefix_path(event)}
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
            >
              <FolderOpen size={15} />
              {t("common.actions.browse")}
            </button>
            <button
              type="button"
              onClick={reset_prefix_path_to_default}
              className="inline-flex h-11 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
            >
              {t("main.createBottle.defaultPath")}
            </button>
          </div>
          <p className="text-[11px] leading-5 text-slate-500">
            {t("main.createBottle.pathHint")} <span className="break-all text-slate-400">{computedBottlePath}</span>
          </p>
        </div>

        <label className="grid gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t("main.createBottle.descriptionLabel")}
          </span>
          <textarea
            value={form.description}
            onChange={(event) => update_form("description", event.target.value)}
            placeholder={t("main.createBottle.descriptionPlaceholder")}
            rows={3}
            className="resize-none rounded-lg border border-white/10 bg-[#0b1020] px-3 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-[rgb(var(--accent-rgb)/0.55)]"
          />
        </label>
      </div>
    </Dialog>
  );
}
