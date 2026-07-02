import React from "react";
import { Download, FolderOpen, Layers3, PackageOpen, Plus, Search, Settings, Sparkles, Trash2, Wine as WineIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { BottleLaunchOptionsPayload, BottleLauncherKind } from "../../Common/Types/IPC";
import type { DxmtVersion, JadeiteVersion, WineVersion } from "../../Common/Types/Wine";
import type { Bottle, CreateBottleInput } from "../Types/Bottle";
import { create_bottle_path_from_name, normalize_bottle_prefix_root } from "../../Common/Util/BottlePath";
import { Dialog } from "./Dialog";
import { ProgressBar } from "./ProgressBar";
import { PathAutocompleteInput } from "./PathAutocompleteInput";
import { AppLibraryPanel } from "./AppLibraryPanel";
import { BottleActionBar } from "./BottleActionBar";
import { Box, Button, IconSlot, Inline, InlineText, Input, List, ListItem, ListItemBody, ListItemDescription, ListItemIcon, ListItemTitle, Stack, Text, Textarea } from "./Primitives";
import { RecipeDialog } from "./RecipeDialog";
import { RuntimeVersionSelect } from "./RuntimeVersionSelect";
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

/** Maps bottle lifecycle state to the shared status badge tone. */
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

/**
 * Breadcrumb for navigating between the bottle library and a selected bottle.
 *
 * Use it in headers where the user should understand whether actions apply to
 * all bottles or to the current bottle only.
 */
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
    <Box
      as="nav"
      className="flex min-w-0 items-center gap-2 text-xl font-bold text-white"
      aria-label={t("main.breadcrumbLabel")}
    >
      <Button
        type="button"
        onClick={onBottleHome}
        className="min-w-0 truncate rounded-md px-1 text-left transition hover:bg-white/10 hover:text-[rgb(var(--accent-soft-text-rgb))]"
      >
        {t("main.bottleHome")}
      </Button>
      {bottleName ? (
        <>
          <InlineText className="text-slate-500">&gt;</InlineText>
          <Button
            type="button"
            onClick={onBottleClick}
            className="min-w-0 truncate rounded-md px-1 text-left text-slate-100 transition hover:bg-white/10 hover:text-[rgb(var(--accent-soft-text-rgb))]"
            aria-current="page"
          >
            {bottleName}
          </Button>
        </>
      ) : null}
    </Box>
  );
}

function is_runtime_version_ready(version?: WineVersion | DxmtVersion | JadeiteVersion): boolean {
  return Boolean(version?.path) || version?.status === "installed" || version?.status === "completed";
}

export function is_bottle_running(bottle: Bottle): boolean {
  return bottle.apps.some((app) => Boolean(app.processId));
}

function bottle_running_app_count(bottle: Bottle): number {
  return bottle.apps.filter((app) => Boolean(app.processId)).length;
}

/**
 * Clickable bottle summary card.
 *
 * Use this in bottle grids to expose status, app count, selected runtime, and a
 * right-click surface for bottle-level actions.
 */
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
  const isRunning = is_bottle_running(bottle);
  const runningAppCount = bottle_running_app_count(bottle);

  return (
    <Button
      type="button"
      onClick={onClick}
      onContextMenu={(event) => onContextMenu?.(event, bottle)}
      className={`group flex min-h-40 w-full flex-col rounded-lg border p-4 text-left transition ${
        isRunning
          ? "border-emerald-300/45 bg-emerald-400/[0.07] shadow-[0_0_28px_rgba(16,185,129,0.16)] hover:border-emerald-200/60 hover:bg-emerald-400/[0.10]"
          : "border-white/10 bg-white/[0.04] hover:border-white/20 hover:bg-white/[0.07]"
      }`}
      aria-label={bottle.name}
    >
      <Inline className="mb-4 items-start justify-between gap-3">
        <IconSlot className={`flex h-12 w-12 items-center justify-center rounded-lg bg-[#0b1020] ring-1 ${isRunning ? "running-app-icon-frame ring-emerald-300/45" : "ring-white/10"}`}>
          <Layers3 size={24} className="text-slate-200" />
        </IconSlot>
        <StatusBadge
          label={isRunning ? t("main.bottleStatus.running") : t(`main.bottleStatus.${bottle.status}`)}
          tone={isRunning ? "success" : tone_from_bottle_status(bottle.status)}
          animated={isRunning}
        />
      </Inline>
      <InlineText className="line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-slate-100">
        {bottle.name}
      </InlineText>
      <InlineText className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
        {bottle.description}
      </InlineText>
      <Inline className="mt-auto items-center justify-between gap-3 pt-4 text-xs text-slate-400">
        <InlineText>
          {isRunning
            ? t("main.bottleRunningApps", { count: runningAppCount })
            : t("main.bottleApps", { count: bottle.apps.length })}
        </InlineText>
        <InlineText className="truncate text-slate-500">{bottle.wineVersionId}</InlineText>
      </Inline>
    </Button>
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
    <Stack className="gap-4">
      <Inline className="flex-wrap items-center justify-between gap-3">
        <Stack className="gap-1">
          <Box as="h3" className="text-base font-semibold text-white">
            {t("main.bottleLibrary")}
          </Box>
          <Text className="text-xs text-slate-500">
            {t("main.bottleLibraryDescription", { count: appCount })}
          </Text>
        </Stack>
        <Inline className="flex-wrap items-center gap-2">
          <Inline className="h-9 w-64 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-slate-500">
            <Search size={15} />
            <InlineText className="text-xs">{t("main.searchReady")}</InlineText>
          </Inline>
          <Button
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
            <InlineText className="rounded-md bg-white/10 px-1.5 py-0.5 text-[11px] text-slate-200">
              {installedWineCount}
            </InlineText>
          </Button>
        </Inline>
      </Inline>

      <Box className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {bottles.map((bottle) => (
          <BottleCard
            key={bottle.id}
            bottle={bottle}
            onClick={() => onSelectBottle?.(bottle.id)}
            onContextMenu={onBottleContextMenu}
          />
        ))}
      </Box>

      <Button
        type="button"
        className="accent-primary fixed bottom-8 right-8 z-30 inline-flex h-12 w-12 items-center justify-center rounded-full shadow-xl shadow-black/35 transition hover:scale-105 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent-rgb)/0.45)]"
        aria-label={t("main.createBottle.action")}
        title={t("main.createBottle.action")}
        onClick={onCreateBottle}
      >
        <Plus size={24} />
      </Button>
    </Stack>
  );
}

/**
 * Bottle dashboard home view.
 *
 * Use this when no bottle is selected. It combines the bottle library, installed
 * runtime dialog, runtime downloads, and create-bottle affordance.
 */
export function DashboardHomePanel({
  wineVersions,
  dxmtVersions,
  jadeiteVersions = [],
  selectedWineVersionId,
  selectedDxmtVersionId,
  selectedJadeiteVersionId = "",
  installPath,
  isLoadingWineVersions,
  isLoadingDxmtVersions,
  isLoadingJadeiteVersions = false,
  bottles,
  isInstalledWineOpen,
  onToggleInstalledWine,
  onSelectWineVersion,
  onInstallWineVersion,
  onSelectDxmtVersion,
  onInstallDxmtVersion,
  onDeleteWineVersion,
  onDeleteDxmtVersion,
  onSelectJadeiteVersion,
  onInstallJadeiteVersion,
  onDeleteJadeiteVersion,
  onSelectBottle,
  onBottleContextMenu,
  onCreateBottle,
}: {
  wineVersions: WineVersion[];
  dxmtVersions: DxmtVersion[];
  jadeiteVersions?: JadeiteVersion[];
  selectedWineVersionId: string;
  selectedDxmtVersionId: string;
  selectedJadeiteVersionId?: string;
  installPath: string;
  isLoadingWineVersions: boolean;
  isLoadingDxmtVersions: boolean;
  isLoadingJadeiteVersions?: boolean;
  bottles: Bottle[];
  isInstalledWineOpen: boolean;
  onToggleInstalledWine: () => void;
  onSelectWineVersion: (versionId: string) => void;
  onInstallWineVersion?: (versionId: string) => void;
  onSelectDxmtVersion?: (versionId: string) => void;
  onInstallDxmtVersion?: (versionId: string) => void;
  onDeleteWineVersion?: (versionId: string) => void;
  onDeleteDxmtVersion?: (versionId: string) => void;
  onSelectJadeiteVersion?: (versionId: string) => void;
  onInstallJadeiteVersion?: (versionId: string) => void;
  onDeleteJadeiteVersion?: (versionId: string) => void;
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
    <Stack className="gap-6 p-6">
      <Box as="section">
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
      </Box>

      <Dialog
        open={isInstalledWineOpen}
        title={t("main.installedWine.title")}
        description={t("main.installedWine.description")}
        tone={isLoadingWineVersions || isLoadingDxmtVersions || isLoadingJadeiteVersions ? "info" : "neutral"}
        icon={Layers3}
        placement="center"
        widthClassName="max-w-5xl"
        onClose={onToggleInstalledWine}
      >
        <Stack className="max-h-[72vh] gap-5 overflow-y-auto pr-1">
          <RuntimeDownloadPanel
            wineVersions={wineVersions}
            dxmtVersions={dxmtVersions}
            jadeiteVersions={jadeiteVersions}
            selectedWineVersionId={selectedWineVersionId}
            selectedDxmtVersionId={selectedDxmtVersionId}
            selectedJadeiteVersionId={selectedJadeiteVersionId}
            installPath={installPath}
            isLoadingWineVersions={isLoadingWineVersions}
            isLoadingDxmtVersions={isLoadingDxmtVersions}
            isLoadingJadeiteVersions={isLoadingJadeiteVersions}
            onSelectWineVersion={onSelectWineVersion}
            onInstallWineVersion={onInstallWineVersion}
            onSelectDxmtVersion={onSelectDxmtVersion}
            onInstallDxmtVersion={onInstallDxmtVersion}
            onDeleteWineVersion={onDeleteWineVersion}
            onDeleteDxmtVersion={onDeleteDxmtVersion}
            onSelectJadeiteVersion={onSelectJadeiteVersion}
            onInstallJadeiteVersion={onInstallJadeiteVersion}
            onDeleteJadeiteVersion={onDeleteJadeiteVersion}
          />
        </Stack>
      </Dialog>
    </Stack>
  );
}

function RuntimeDownloadPanel({
  wineVersions,
  dxmtVersions,
  jadeiteVersions = [],
  selectedWineVersionId,
  selectedDxmtVersionId,
  selectedJadeiteVersionId = "",
  installPath,
  isLoadingWineVersions,
  isLoadingDxmtVersions,
  isLoadingJadeiteVersions,
  onSelectWineVersion,
  onInstallWineVersion,
  onSelectDxmtVersion,
  onInstallDxmtVersion,
  onDeleteWineVersion,
  onDeleteDxmtVersion,
  onSelectJadeiteVersion,
  onInstallJadeiteVersion,
  onDeleteJadeiteVersion,
}: {
  wineVersions: WineVersion[];
  dxmtVersions: DxmtVersion[];
  jadeiteVersions?: JadeiteVersion[];
  selectedWineVersionId: string;
  selectedDxmtVersionId: string;
  selectedJadeiteVersionId?: string;
  installPath: string;
  isLoadingWineVersions: boolean;
  isLoadingDxmtVersions: boolean;
  isLoadingJadeiteVersions: boolean;
  onSelectWineVersion: (versionId: string) => void;
  onInstallWineVersion?: (versionId: string) => void;
  onSelectDxmtVersion?: (versionId: string) => void;
  onInstallDxmtVersion?: (versionId: string) => void;
  onDeleteWineVersion?: (versionId: string) => void;
  onDeleteDxmtVersion?: (versionId: string) => void;
  onSelectJadeiteVersion?: (versionId: string) => void;
  onInstallJadeiteVersion?: (versionId: string) => void;
  onDeleteJadeiteVersion?: (versionId: string) => void;
}) {
  const { t } = useTranslation();
  const visibleWineVersions = wineVersions;
  const visibleDxmtVersions = dxmtVersions;
  const visibleJadeiteVersions = jadeiteVersions;

  return (
    <Box as="section" className="rounded-lg border border-white/10 bg-[#101827] p-5 shadow-2xl shadow-black/20">
      <Inline className="mb-5 flex-wrap items-start justify-between gap-3">
        <Stack className="min-w-0 gap-1">
          <Inline className="flex-wrap items-center gap-2">
            <Box as="h3" className="text-base font-semibold text-white">{t("main.runtimeDownloads.title")}</Box>
            <StatusBadge label={isLoadingWineVersions || isLoadingDxmtVersions || isLoadingJadeiteVersions ? t("common.syncing") : t("common.ready")} tone={isLoadingWineVersions || isLoadingDxmtVersions || isLoadingJadeiteVersions ? "info" : "success"} />
          </Inline>
          <Text className="text-sm leading-5 text-slate-500">{t("main.runtimeDownloads.description")}</Text>
        </Stack>
      </Inline>

      <Box className="grid gap-5 xl:grid-cols-2">
        <Stack className="min-w-0 gap-2">
          <Text className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Wine</Text>
          <List>
            {visibleWineVersions.map((version) => (
              <RuntimeCompactCard
                key={version.id}
                version={version}
                icon={<WineIcon size={17} />}
                path={version.path ?? installPath}
                isSelected={version.id === selectedWineVersionId}
                onSelect={onSelectWineVersion}
                onInstall={onInstallWineVersion}
                onDelete={onDeleteWineVersion}
              />
            ))}
          </List>
          {visibleWineVersions.length === 0 ? <RuntimeEmptyMessage>{t("main.runtimeDownloads.noWine")}</RuntimeEmptyMessage> : null}
        </Stack>

        <Stack className="min-w-0 gap-2">
          <Text className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">DXMT</Text>
          <List>
            {visibleDxmtVersions.map((version) => (
              <RuntimeCompactCard
                key={version.id}
                version={version}
                icon={<PackageOpen size={17} />}
                path={version.path}
                isSelected={version.id === selectedDxmtVersionId}
                onSelect={onSelectDxmtVersion}
                onInstall={onInstallDxmtVersion}
                onDelete={onDeleteDxmtVersion}
              />
            ))}
          </List>
          {visibleDxmtVersions.length === 0 ? <RuntimeEmptyMessage>{t("main.runtimeDownloads.noDxmt")}</RuntimeEmptyMessage> : null}
        </Stack>

        <Stack className="min-w-0 gap-2 xl:col-span-2">
          <Text className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Jadeite</Text>
          <List>
            {visibleJadeiteVersions.map((version) => (
              <RuntimeCompactCard
                key={version.id}
                version={version}
                icon={<PackageOpen size={17} />}
                path={version.path}
                isSelected={version.id === selectedJadeiteVersionId}
                onSelect={onSelectJadeiteVersion}
                onInstall={onInstallJadeiteVersion}
                onDelete={onDeleteJadeiteVersion}
              />
            ))}
          </List>
          {visibleJadeiteVersions.length === 0 ? <RuntimeEmptyMessage>Jadeite runtime catalog is not available.</RuntimeEmptyMessage> : null}
        </Stack>
      </Box>
    </Box>
  );
}

function RuntimeCompactCard({
  version,
  icon,
  path,
  isSelected,
  onSelect,
  onInstall,
  onDelete,
}: {
  version: WineVersion | DxmtVersion | JadeiteVersion;
  icon: React.ReactNode;
  path?: string;
  isSelected: boolean;
  onSelect?: (versionId: string) => void;
  onInstall?: (versionId: string) => void;
  onDelete?: (versionId: string) => void;
}) {
  const { t } = useTranslation();
  const isWorking = ["downloading", "installing", "extracting"].includes(version.status);
  const isInstalled = version.status === "installed" || version.status === "completed";
  const canInstall = version.status === "available" || version.status === "idle" || version.status === "error";
  const progress = isInstalled ? 100 : Math.max(0, Math.min(100, Math.round(version.progress ?? 0)));

  return (
    <ListItem as="article" density="compact" tone={isSelected ? "selected" : "default"} className="flex-col p-3">
      <Box className="grid min-w-0 items-center gap-3 md:grid-cols-[minmax(0,1fr)_8rem_14rem]">
        <Button type="button" className="flex min-w-0 items-center gap-3 text-left" onClick={() => onSelect?.(version.id)}>
          <ListItemIcon className="accent-text flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-800 ring-1 ring-white/10">
            {icon}
          </ListItemIcon>
          <ListItemBody className="gap-0.5">
            <ListItemTitle>{version.name}</ListItemTitle>
            <ListItemDescription className="text-[11px]">{version.version}{path ? ` - ${path}` : ""}</ListItemDescription>
          </ListItemBody>
        </Button>
        <Box className="min-w-0">
          <ProgressBar progressValue={progress} showValue size="sm" tone={isWorking ? "blue" : "emerald"} animated={isWorking} />
        </Box>
        <Inline className="shrink-0 items-center justify-end gap-2">
          <Box className="flex w-24 justify-end">
            <StatusBadge label={label_from_status(version.status, t)} tone={tone_from_status(version.status)} className="w-24 justify-center" />
          </Box>
          <Button
            type="button"
            disabled={isWorking || (isInstalled ? !onDelete : !canInstall || !onInstall)}
            onClick={() => {
              if (isInstalled) {
                onDelete?.(version.id);
                return;
              }

              onInstall?.(version.id);
            }}
            className={`inline-flex h-8 w-24 shrink-0 items-center justify-center gap-1 rounded-md px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-500 ${
              isInstalled
                ? "border border-rose-300/20 bg-rose-500/10 text-rose-100 hover:border-rose-300/35 hover:bg-rose-500/20"
                : "accent-primary"
            }`}
          >
            {isInstalled ? <Trash2 size={14} /> : <Download size={14} />}
            {isWorking ? `${progress}%` : isInstalled ? t("common.actions.delete") : t("common.actions.install")}
          </Button>
        </Inline>
      </Box>
    </ListItem>
  );
}

function RuntimeEmptyMessage({ children }: { children: React.ReactNode }) {
  return (
    <Box className="rounded-lg border border-dashed border-white/10 bg-white/[0.03] p-5 text-sm leading-6 text-slate-500">
      {children}
    </Box>
  );
}

/**
 * Detail view for a single selected bottle.
 *
 * Use this after bottle selection to show installed apps first, then compact
 * bottle metadata, setup progress, recipe details, and bottle-scoped actions.
 */
export function BottleDetailPanel({
  bottle,
  selectedWineVersionId,
  wineVersions,
  dxmtVersions,
  jadeiteVersions,
  wineRuntimePath,
  appLogoSrc,
  onRevealBottle,
  onInstallBottleLauncher,
  onLaunchBottleApp,
  onLaunchBottleAppWithArgs,
  onStopBottleApp,
  onDeleteBottleApp,
  onDeleteBottleAppFiles,
  onRegisterBottleExecutable,
  onChangeBottleAppLaunchOptions,
  onChangeBottleRecipe,
  onInstallWineVersion,
  onInstallDxmtVersion,
  onInstallJadeiteVersion,
}: {
  bottle: Bottle;
  selectedWineVersionId: string;
  wineVersions: WineVersion[];
  dxmtVersions: DxmtVersion[];
  jadeiteVersions?: JadeiteVersion[];
  wineRuntimePath?: string;
  appLogoSrc: string;
  onRevealBottle?: (path: string) => void;
  onInstallBottleLauncher?: (bottleId: string, launcher: BottleLauncherKind) => void;
  onLaunchBottleApp?: (bottleId: string, appId: string) => void;
  onLaunchBottleAppWithArgs?: (bottleId: string, appId: string, executableArgs: string[]) => void;
  onStopBottleApp?: (bottleId: string, appId: string) => void;
  onDeleteBottleApp?: (bottleId: string, appId: string) => void;
  onDeleteBottleAppFiles?: (bottleId: string, appId: string) => void;
  onRegisterBottleExecutable?: (bottleId: string, executablePath: string) => void;
  onChangeBottleAppLaunchOptions?: (bottleId: string, appId: string, launchOptions: BottleLaunchOptionsPayload) => void;
  onChangeBottleRecipe?: (bottleId: string, patch: Partial<Pick<Bottle, "wineVersionId" | "dxmtVersionId" | "jadeiteVersionId">>) => void;
  onInstallWineVersion?: (versionId: string) => void;
  onInstallDxmtVersion?: (versionId: string) => void;
  onInstallJadeiteVersion?: (versionId: string) => void;
}) {
  const { t } = useTranslation();
  const [isRecipeOpen, setIsRecipeOpen] = React.useState(false);
  const isBottleWorking = bottle.status === "updating" || Boolean(
    bottle.setupTask && ["setup", "dxmt", "download", "install"].includes(bottle.setupTask.stage),
  );
  const isBottleSetupComplete = Boolean(
    bottle.setupTask &&
      !isBottleWorking &&
      bottle.setupTask.stage !== "error" &&
      bottle.setupTask.progress >= 100,
  );
  const shouldShowSetupProgress = Boolean(
    bottle.setupTask && (isBottleWorking || bottle.setupTask.stage === "error"),
  );
  const isBottleRunning = is_bottle_running(bottle);
  const runningAppCount = bottle_running_app_count(bottle);
  const dxmtPackagePath = bottle.dxmtVersionId
    ? dxmtVersions.find((version) => version.id === bottle.dxmtVersionId)?.path
    : undefined;
  const launcherOptionsManifest = wineVersions.find((version) => version.id === bottle.wineVersionId)?.launcherOptionsManifest;

  return (
    <Box className="grid min-h-full grid-cols-[minmax(0,1fr)_18rem] gap-4 p-6">
      <AppLibraryPanel
        bottle={bottle}
        selectedWineVersionId={selectedWineVersionId}
        launcherOptionsManifest={launcherOptionsManifest}
        appLogoSrc={appLogoSrc}
        onLaunchBottleApp={onLaunchBottleApp}
        onLaunchBottleAppWithArgs={onLaunchBottleAppWithArgs}
        onStopBottleApp={onStopBottleApp}
        onDeleteBottleApp={onDeleteBottleApp}
        onDeleteBottleAppFiles={onDeleteBottleAppFiles}
        onRegisterBottleExecutable={onRegisterBottleExecutable}
        onChangeBottleAppLaunchOptions={onChangeBottleAppLaunchOptions}
      />

      <Stack as="aside" className={`sticky top-6 self-start gap-3 rounded-xl border bg-white/[0.035] p-3 ${
        isBottleRunning
          ? "border-emerald-300/35 shadow-[0_0_34px_rgba(16,185,129,0.14)]"
          : "border-white/10"
      }`}>
        <Stack className="min-w-0 gap-2 rounded-lg border border-white/10 bg-[#0b1020]/70 p-3">
          <Inline className="min-w-0 flex-wrap items-center gap-2">
            {isBottleRunning ? (
              <StatusBadge
                label={t("main.bottleStatus.running")}
                tone="success"
                animated
              />
            ) : null}
            <StatusBadge
              label={t(`main.bottleStatus.${bottle.status}`)}
              tone={tone_from_bottle_status(bottle.status)}
              animated={isBottleWorking}
            />
            {shouldShowSetupProgress ? (
              <InlineText className={`rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] font-semibold text-slate-400 ${isBottleWorking ? "badge-ripple" : ""}`}>
                {t(`main.installers.stage.${bottle.setupTask.stage}`)}
              </InlineText>
            ) : null}
          </Inline>
          <Box as="h3" className="min-w-0 truncate text-xl font-bold tracking-normal text-white">
            {bottle.name}
          </Box>
          <Text className="line-clamp-2 text-xs leading-5 text-slate-400">
            {bottle.description || t("main.bottleInfo.description")}
          </Text>
          <Text className="break-all font-mono text-[11px] leading-5 text-slate-500">
            {bottle.path}
          </Text>
          {isBottleRunning ? (
            <Text className="rounded-lg border border-emerald-300/20 bg-emerald-400/10 px-3 py-2 text-xs font-semibold leading-5 text-emerald-100">
              {t("main.bottleRunningDescription", { count: runningAppCount })}
            </Text>
          ) : null}
          <Button
            type="button"
            onClick={() => setIsRecipeOpen(true)}
            className="mt-1 inline-flex h-9 w-full shrink-0 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
          >
            <Settings size={13} />
            {t("main.recipeViewAction")}
          </Button>
        </Stack>

        <BottleActionBar
          bottle={bottle}
          wineRuntimePath={wineRuntimePath}
          dxmtPackagePath={dxmtPackagePath}
          onInstallBottleLauncher={onInstallBottleLauncher}
          onLaunchBottleApp={onLaunchBottleApp}
          onRegisterBottleExecutable={onRegisterBottleExecutable}
        />

        {shouldShowSetupProgress ? (
          <Stack className="gap-2 rounded-lg border border-white/10 bg-[#0b1020] p-3">
            <Inline className="flex-wrap items-center justify-between gap-3">
              <Text className="min-w-0 truncate text-xs text-slate-500">
                {bottle.setupTask.message}
              </Text>
              <InlineText className="text-[11px] font-semibold text-slate-400">
                {bottle_task_progress_label(bottle.setupTask.stage, t)}
              </InlineText>
            </Inline>
            <ProgressBar
              progressValue={bottle.setupTask.progress}
              showValue
              size="sm"
              tone={bottle.setupTask.stage === "error" ? "rose" : "emerald"}
              animated={isBottleWorking}
            />
          </Stack>
        ) : null}
        {isBottleSetupComplete ? (
          <Text className="rounded-lg border border-emerald-300/20 bg-emerald-400/10 px-3 py-2 text-xs font-semibold leading-5 text-emerald-100">
            {bottle.setupTask?.message || t("main.recipeInfo.applyComplete")}
          </Text>
        ) : null}
      </Stack>

      <RecipeDialog
        bottle={bottle}
        open={isRecipeOpen}
        onClose={() => setIsRecipeOpen(false)}
        onRevealBottle={onRevealBottle}
        wineVersions={wineVersions}
        dxmtVersions={dxmtVersions}
        jadeiteVersions={jadeiteVersions}
        onWineVersionChange={(wineVersionId) => onChangeBottleRecipe?.(bottle.id, { wineVersionId })}
        onDxmtVersionChange={(dxmtVersionId) => onChangeBottleRecipe?.(bottle.id, { dxmtVersionId })}
        onJadeiteVersionChange={(jadeiteVersionId) => onChangeBottleRecipe?.(bottle.id, { jadeiteVersionId })}
        onInstallWineVersion={onInstallWineVersion}
        onInstallDxmtVersion={onInstallDxmtVersion}
        onInstallJadeiteVersion={onInstallJadeiteVersion}
      />
    </Box>
  );
}

/**
 * Modal form for creating a bottle.
 *
 * Use it when collecting the bottle name, prefix root, Wine runtime, DXMT
 * runtime, Jadeite runtime, and optional description before handing a
 * normalized creation input back to the store or main process.
 */
export function CreateBottleDialog({
  open,
  wineVersions,
  dxmtVersions,
  jadeiteVersions = [],
  selectedWineVersionId,
  selectedDxmtVersionId,
  selectedJadeiteVersionId,
  bottlePrefixPath,
  onSelectBottlePrefixPath,
  onClose,
  onCreateBottle,
  onInstallWineVersion,
  onInstallDxmtVersion,
  onInstallJadeiteVersion,
}: {
  open: boolean;
  wineVersions: WineVersion[];
  dxmtVersions: DxmtVersion[];
  jadeiteVersions?: JadeiteVersion[];
  selectedWineVersionId: string;
  selectedDxmtVersionId: string;
  selectedJadeiteVersionId?: string;
  bottlePrefixPath: string;
  onSelectBottlePrefixPath?: (currentPath: string) => Promise<string | undefined>;
  onClose: () => void;
  onCreateBottle?: (input: CreateBottleInput) => void;
  onInstallWineVersion?: (versionId: string) => void;
  onInstallDxmtVersion?: (versionId: string) => void;
  onInstallJadeiteVersion?: (versionId: string) => void;
}) {
  const { t } = useTranslation();
  const wasCreateBottleOpenRef = React.useRef(false);
  const [form, setForm] = React.useState<CreateBottleInput>({
    name: "",
    wineVersionId: selectedWineVersionId,
    dxmtVersionId: selectedDxmtVersionId,
    jadeiteVersionId: selectedJadeiteVersionId,
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
  const selectableJadeiteVersions = React.useMemo(
    () => jadeiteVersions,
    [jadeiteVersions],
  );
  const canCreateBottle =
    form.name.trim().length > 0 &&
    form.wineVersionId.trim().length > 0 &&
    form.dxmtVersionId.trim().length > 0 &&
    form.prefixPath.trim().length > 0 &&
    is_runtime_version_ready(wineVersions.find((version) => version.id === form.wineVersionId)) &&
    is_runtime_version_ready(dxmtVersions.find((version) => version.id === form.dxmtVersionId));
  const normalizedPrefixPath = normalize_bottle_prefix_root(form.prefixPath, form.name);
  const computedBottlePath = create_bottle_path_from_name(normalizedPrefixPath, form.name);

  React.useEffect(() => {
    if (!open) {
      wasCreateBottleOpenRef.current = false;
      return;
    }
    if (wasCreateBottleOpenRef.current) {
      return;
    }
    wasCreateBottleOpenRef.current = true;

    const nextName = generate_bottle_name();
    setForm({
      name: nextName,
      wineVersionId:
        selectedWineVersionId || selectableWineVersions[0]?.id || "",
      dxmtVersionId:
        selectedDxmtVersionId || selectableDxmtVersions[0]?.id || "",
      jadeiteVersionId:
        selectedJadeiteVersionId || selectableJadeiteVersions[0]?.id || "",
      prefixPath: bottlePrefixPath,
      description: "",
    });
  }, [bottlePrefixPath, open, selectedDxmtVersionId, selectedJadeiteVersionId, selectedWineVersionId, selectableDxmtVersions, selectableJadeiteVersions, selectableWineVersions]);

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
      jadeiteVersionId: form.jadeiteVersionId,
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
      <Box className="grid gap-3">
        <Box as="label" className="grid gap-2">
          <InlineText className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t("main.createBottle.nameLabel")}
          </InlineText>
          <Inline className="flex-wrap gap-2">
            <Input
              value={form.name}
              onChange={(event) => update_name(event.target.value)}
              placeholder={t("main.createBottle.namePlaceholder")}
              className="h-10 min-w-0 flex-1 rounded-lg border border-white/10 bg-[#0b1020] px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-[rgb(var(--accent-rgb)/0.55)]"
            />
            <Button
              type="button"
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
              onClick={randomize_name}
            >
              <Sparkles size={16} />
              {t("main.createBottle.randomName")}
            </Button>
          </Inline>
        </Box>

        <Box className="grid gap-2">
          <RuntimeVersionSelect
            label={t("main.createBottle.wineLabel")}
            value={form.wineVersionId}
            versions={wineVersions}
            onChange={(value) => update_form("wineVersionId", value)}
            onInstall={onInstallWineVersion}
          />
        </Box>

        <Box className="grid gap-2">
          <RuntimeVersionSelect
            label={t("main.createBottle.dxmtLabel")}
            value={form.dxmtVersionId}
            versions={dxmtVersions}
            onChange={(value) => update_form("dxmtVersionId", value)}
            onInstall={onInstallDxmtVersion}
          />
        </Box>

        {jadeiteVersions.length > 0 ? (
          <Box className="grid gap-2">
            <RuntimeVersionSelect
              label="Jadeite"
              value={form.jadeiteVersionId || selectableJadeiteVersions[0]?.id || ""}
              versions={jadeiteVersions}
              onChange={(value) => update_form("jadeiteVersionId", value)}
              onInstall={onInstallJadeiteVersion}
            />
          </Box>
        ) : null}

        <Stack className="gap-2">
          <InlineText className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t("main.createBottle.pathLabel")}
          </InlineText>
          <Inline className="flex-wrap gap-2">
            <PathAutocompleteInput
              value={form.prefixPath}
              defaultPath={bottlePrefixPath}
              onChange={update_prefix_path}
              placeholder={t("main.createBottle.pathPlaceholder")}
              className="h-10 min-w-0 flex-1 rounded-lg border border-white/10 bg-[#0b1020] px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-[rgb(var(--accent-rgb)/0.55)]"
            />
            <Button
              type="button"
              onClick={(event) => void browse_prefix_path(event)}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
            >
              <FolderOpen size={15} />
              {t("common.actions.browse")}
            </Button>
            <Button
              type="button"
              onClick={reset_prefix_path_to_default}
              className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
            >
              {t("main.createBottle.defaultPath")}
            </Button>
          </Inline>
          <Text className="text-[11px] leading-5 text-slate-500">
            {t("main.createBottle.pathHint")} <InlineText className="break-all text-slate-400">{computedBottlePath}</InlineText>
          </Text>
        </Stack>

        <Box as="label" className="grid gap-2">
          <InlineText className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t("main.createBottle.descriptionLabel")}
          </InlineText>
          <Textarea
            value={form.description}
            onChange={(event) => update_form("description", event.target.value)}
            placeholder={t("main.createBottle.descriptionPlaceholder")}
            rows={2}
            className="resize-none rounded-lg border border-white/10 bg-[#0b1020] px-3 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-[rgb(var(--accent-rgb)/0.55)]"
          />
        </Box>
      </Box>
    </Dialog>
  );
}
