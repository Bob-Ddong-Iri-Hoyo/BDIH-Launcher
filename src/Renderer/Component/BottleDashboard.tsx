import React from "react";
import { Download, FolderOpen, Layers3, PackageOpen, Plus, Search, Settings, Sparkles, Wine as WineIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { BottleLauncherKind } from "../../Common/Types/IPC";
import type { DxmtVersion, WineVersion } from "../../Common/Types/Wine";
import type { Bottle, CreateBottleInput } from "../Types/Bottle";
import { create_bottle_path_from_name, normalize_bottle_prefix_root } from "../../Common/Util/BottlePath";
import { Dialog } from "./Dialog";
import { InstalledWinePanel } from "./InstalledWinePanel";
import { ProgressBar } from "./ProgressBar";
import { AppLibraryPanel } from "./AppLibraryPanel";
import { BottleActionBar } from "./BottleActionBar";
import { Box, Button, IconSlot, Inline, InlineText, Input, SelectMenu, Stack, Text, Textarea } from "./Primitives";
import { RecipeDialog } from "./RecipeDialog";
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
    <Button
      type="button"
      onClick={onClick}
      onContextMenu={(event) => onContextMenu?.(event, bottle)}
      className="group flex min-h-40 w-full flex-col rounded-lg border border-white/10 bg-white/[0.04] p-4 text-left transition hover:border-white/20 hover:bg-white/[0.07]"
      aria-label={bottle.name}
    >
      <Inline className="mb-4 items-start justify-between gap-3">
        <IconSlot className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#0b1020] ring-1 ring-white/10">
          <Layers3 size={24} className="text-slate-200" />
        </IconSlot>
        <StatusBadge
          label={t(`main.bottleStatus.${bottle.status}`)}
          tone={tone_from_bottle_status(bottle.status)}
        />
      </Inline>
      <InlineText className="line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-slate-100">
        {bottle.name}
      </InlineText>
      <InlineText className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
        {bottle.description}
      </InlineText>
      <Inline className="mt-auto items-center justify-between gap-3 pt-4 text-xs text-slate-400">
        <InlineText>{t("main.bottleApps", { count: bottle.apps.length })}</InlineText>
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
        tone={isLoadingWineVersions || isLoadingDxmtVersions ? "info" : "neutral"}
        icon={Layers3}
        placement="center"
        widthClassName="max-w-5xl"
        onClose={onToggleInstalledWine}
      >
        <Stack className="max-h-[72vh] gap-5 overflow-y-auto pr-1">
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
        </Stack>
      </Dialog>
    </Stack>
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
    <Box as="section" className="rounded-lg border border-white/10 bg-[#101827] p-5 shadow-2xl shadow-black/20">
      <Inline className="mb-5 flex-wrap items-start justify-between gap-3">
        <Stack className="min-w-0 gap-1">
          <Inline className="flex-wrap items-center gap-2">
            <Box as="h3" className="text-base font-semibold text-white">{t("main.runtimeDownloads.title")}</Box>
            <StatusBadge label={isLoadingWineVersions || isLoadingDxmtVersions ? t("common.syncing") : t("common.ready")} tone={isLoadingWineVersions || isLoadingDxmtVersions ? "info" : "success"} />
          </Inline>
          <Text className="text-sm leading-5 text-slate-500">{t("main.runtimeDownloads.description")}</Text>
        </Stack>
      </Inline>

      <Box className="grid gap-5 xl:grid-cols-2">
        <Stack className="min-w-0 gap-2">
          <Text className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Wine</Text>
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
        </Stack>

        <Stack className="min-w-0 gap-2">
          <Text className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">DXMT</Text>
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
    <Box as="article" className={`rounded-lg border p-3 transition ${isSelected ? "accent-selection" : "border-white/10 bg-white/[0.04]"}`}>
      <Box className="grid min-w-0 items-center gap-3 md:grid-cols-[minmax(0,1fr)_7rem_auto]">
        <Button type="button" className="flex min-w-0 items-center gap-3 text-left" onClick={() => onSelect?.(version.id)}>
          <IconSlot className="accent-text flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-800 ring-1 ring-white/10">
            {icon}
          </IconSlot>
          <Stack className="min-w-0 gap-0.5">
            <InlineText className="block truncate text-sm font-semibold text-slate-100">{version.name}</InlineText>
            <InlineText className="block truncate text-[11px] text-slate-500">{version.version}{path ? ` - ${path}` : ""}</InlineText>
          </Stack>
        </Button>
        <Box className="min-w-0">
          <ProgressBar progressValue={version.progress} showValue size="sm" tone={isWorking ? "blue" : "emerald"} animated={isWorking} />
        </Box>
        <Inline className="shrink-0 items-center justify-end gap-2">
          <StatusBadge label={label_from_status(version.status, t)} tone={tone_from_status(version.status)} />
          <Button
            type="button"
            disabled={!canInstall}
            onClick={() => onInstall?.(version.id)}
            className="accent-primary inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-500"
          >
            <Download size={14} />
            {t("common.actions.install")}
          </Button>
        </Inline>
      </Box>
    </Box>
  );
}

function RuntimeEmptyMessage({ children }: { children: React.ReactNode }) {
  return (
    <Box className="rounded-lg border border-dashed border-white/10 bg-white/[0.03] p-5 text-sm leading-6 text-slate-500">
      {children}
    </Box>
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
  const isBottleSetupComplete = Boolean(
    bottle.setupTask &&
      !isBottleWorking &&
      bottle.setupTask.stage !== "error" &&
      bottle.setupTask.progress >= 100,
  );

  return (
    <Stack className="gap-4 p-6">
      <AppLibraryPanel
        bottle={bottle}
        selectedWineVersionId={selectedWineVersionId}
        appLogoSrc={appLogoSrc}
        onLaunchBottleApp={onLaunchBottleApp}
        onLaunchBottleAppWithArgs={onLaunchBottleAppWithArgs}
        onStopBottleApp={onStopBottleApp}
        onDeleteBottleApp={onDeleteBottleApp}
      />

      <Box as="section" className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
        <Box className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
          <Stack className="min-w-0 gap-2 rounded-lg border border-white/10 bg-[#0b1020]/70 p-3">
            <Inline className="min-w-0 flex-wrap items-center gap-2">
              <StatusBadge
                label={t(`main.bottleStatus.${bottle.status}`)}
                tone={tone_from_bottle_status(bottle.status)}
                animated={isBottleWorking}
              />
              {bottle.setupTask ? (
                <InlineText className={`rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] font-semibold text-slate-400 ${isBottleWorking ? "badge-ripple" : ""}`}>
                  {t(`main.installers.stage.${bottle.setupTask.stage}`)}
                </InlineText>
              ) : null}
              <Box as="h3" className="min-w-0 flex-1 truncate text-lg font-bold tracking-normal text-white">
                {bottle.name}
              </Box>
              <Button
                type="button"
                onClick={() => setIsRecipeOpen(true)}
                className="inline-flex h-8 shrink-0 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
              >
                <Settings size={13} />
                {t("main.recipeViewAction")}
              </Button>
            </Inline>
            <Text className="line-clamp-1 text-xs leading-5 text-slate-400">
              {bottle.description || t("main.bottleInfo.description")}
            </Text>
            <Text className="truncate font-mono text-[11px] leading-5 text-slate-500">
              {bottle.path}
            </Text>
          </Stack>

          <BottleActionBar
            bottle={bottle}
            wineRuntimePath={wineRuntimePath}
            onInstallBottleLauncher={onInstallBottleLauncher}
            onRegisterBottleExecutable={onRegisterBottleExecutable}
          />
        </Box>

        {bottle.setupTask && !isBottleSetupComplete ? (
          <Stack className="mt-3 gap-2 rounded-lg border border-white/10 bg-[#0b1020] p-3">
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
      </Box>

      <RecipeDialog
        bottle={bottle}
        open={isRecipeOpen}
        onClose={() => setIsRecipeOpen(false)}
        onRevealBottle={onRevealBottle}
      />
    </Stack>
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
      <Box className="grid gap-4">
        <Box as="label" className="grid gap-2">
          <InlineText className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t("main.createBottle.nameLabel")}
          </InlineText>
          <Inline className="gap-2">
            <Input
              value={form.name}
              onChange={(event) => update_name(event.target.value)}
              placeholder={t("main.createBottle.namePlaceholder")}
              className="h-11 min-w-0 flex-1 rounded-lg border border-white/10 bg-[#0b1020] px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-[rgb(var(--accent-rgb)/0.55)]"
            />
            <Button
              type="button"
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
              onClick={randomize_name}
            >
              <Sparkles size={16} />
              {t("main.createBottle.randomName")}
            </Button>
          </Inline>
        </Box>

        <Box as="label" className="grid gap-2">
          <InlineText className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t("main.createBottle.wineLabel")}
          </InlineText>
          <SelectMenu
            value={form.wineVersionId}
            label={t("main.createBottle.wineLabel")}
            options={wineOptions}
            onChange={(value) => update_form("wineVersionId", value)}
          />
        </Box>

        <Box as="label" className="grid gap-2">
          <InlineText className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t("main.createBottle.dxmtLabel")}
          </InlineText>
          <SelectMenu
            value={form.dxmtVersionId}
            label={t("main.createBottle.dxmtLabel")}
            options={dxmtOptions}
            onChange={(value) => update_form("dxmtVersionId", value)}
          />
        </Box>

        <Stack className="gap-2">
          <InlineText className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t("main.createBottle.pathLabel")}
          </InlineText>
          <Inline className="gap-2">
            <Input
              value={form.prefixPath}
              onChange={(event) => update_prefix_path(event.target.value)}
              placeholder={t("main.createBottle.pathPlaceholder")}
              className="h-11 min-w-0 flex-1 rounded-lg border border-white/10 bg-[#0b1020] px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-[rgb(var(--accent-rgb)/0.55)]"
            />
            <Button
              type="button"
              onClick={(event) => void browse_prefix_path(event)}
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
            >
              <FolderOpen size={15} />
              {t("common.actions.browse")}
            </Button>
            <Button
              type="button"
              onClick={reset_prefix_path_to_default}
              className="inline-flex h-11 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
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
            rows={3}
            className="resize-none rounded-lg border border-white/10 bg-[#0b1020] px-3 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-[rgb(var(--accent-rgb)/0.55)]"
          />
        </Box>
      </Box>
    </Dialog>
  );
}
