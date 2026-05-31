import React from "react";
import { Layers3, Plus, Search, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { WineVersion } from "../../Common/Types/Wine";
import type { Bottle, CreateBottleInput } from "../Types/Bottle";
import { Dialog } from "./Dialog";
import { ImageButton } from "./ImageButton";
import { InstalledWinePanel } from "./InstalledWinePanel";
import { ProgressBar } from "./ProgressBar";
import {
  StatusBadge,
  label_from_status,
  tone_from_status,
} from "./StatusBadge";

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

function pick_random_item(items: string[]) {
  return items[Math.floor(Math.random() * items.length)];
}

function generate_bottle_name() {
  return pick_random_item(CHARACTER_BOTTLE_NAMES);
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#0b1020]/70 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-white">{value}</p>
    </div>
  );
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

function DashboardHeroPanel({
  wineVersionCount,
  installedWineCount,
  bottleCount,
  isLoadingWineVersions,
  imageSrc,
}: {
  wineVersionCount: number;
  installedWineCount: number;
  bottleCount: number;
  isLoadingWineVersions: boolean;
  imageSrc: string;
}) {
  const { t } = useTranslation();

  return (
    <div className="min-h-60 overflow-hidden rounded-lg border border-white/10 bg-white/[0.04]">
      <div className="grid h-full grid-cols-[minmax(0,1fr)_16rem]">
        <div className="flex min-w-0 flex-col justify-between p-6">
          <div>
            <StatusBadge
              label={
                isLoadingWineVersions ? t("common.syncing") : t("common.ready")
              }
              tone={isLoadingWineVersions ? "info" : "success"}
            />
            <h3 className="mt-4 text-2xl font-bold tracking-normal text-white">
              {t("main.heroTitle")}
            </h3>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
              {t("main.heroDescription")}
            </p>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <Metric
              label={t("main.metrics.wineCatalog")}
              value={`${wineVersionCount}`}
            />
            <Metric
              label={t("main.metrics.installed")}
              value={`${installedWineCount}`}
            />
            <Metric
              label={t("main.metrics.bottles")}
              value={`${bottleCount}`}
            />
          </div>
        </div>
        <div className="hidden border-l border-white/10 bg-[#101827] p-5 md:block">
          <img
            src={imageSrc}
            alt={t("common.appName")}
            className="h-full w-full rounded-lg object-cover"
          />
        </div>
      </div>
    </div>
  );
}

function SelectedWineSummaryPanel({
  selectedWineVersion,
  installPath,
  isWorking,
}: {
  selectedWineVersion?: WineVersion;
  installPath: string;
  isWorking: boolean;
}) {
  const { t } = useTranslation();

  return (
    <aside className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-white">
          {t("main.selectedWine")}
        </h3>
        {selectedWineVersion && (
          <StatusBadge
            label={label_from_status(selectedWineVersion.status, t)}
            tone={tone_from_status(selectedWineVersion.status)}
          />
        )}
      </div>

      {selectedWineVersion ? (
        <div className="space-y-4">
          <div>
            <p className="text-lg font-bold text-white">
              {selectedWineVersion.name}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {selectedWineVersion.type} · {selectedWineVersion.version}
            </p>
          </div>
          <ProgressBar
            progressValue={selectedWineVersion.progress}
            descriptionText={
              isWorking ? t("main.workProgress") : t("main.installProgress")
            }
            showValue
            tone={isWorking ? "blue" : "emerald"}
          />
          <p className="break-all rounded-lg border border-white/10 bg-[#0b1020] p-3 text-xs leading-5 text-slate-400">
            {selectedWineVersion.path ?? installPath}
          </p>
        </div>
      ) : (
        <p className="text-sm text-slate-500">{t("main.noWineSelected")}</p>
      )}
    </aside>
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
  selectedWineVersion,
  selectedWineVersionId,
  installPath,
  isLoadingWineVersions,
  bottles,
  heroImageSrc,
  isInstalledWineOpen,
  onToggleInstalledWine,
  onSelectWineVersion,
  onSelectBottle,
  onBottleContextMenu,
  onCreateBottle,
}: {
  wineVersions: WineVersion[];
  selectedWineVersion?: WineVersion;
  selectedWineVersionId: string;
  installPath: string;
  isLoadingWineVersions: boolean;
  bottles: Bottle[];
  heroImageSrc: string;
  isInstalledWineOpen: boolean;
  onToggleInstalledWine: () => void;
  onSelectWineVersion: (versionId: string) => void;
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
  const workingVersion = wineVersions.find((version) =>
    ["downloading", "installing", "extracting"].includes(version.status),
  );
  const appCount = bottles.reduce(
    (total, bottle) => total + bottle.apps.length,
    0,
  );

  return (
    <div className="space-y-6 p-6">
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(20rem,0.8fr)]">
        <DashboardHeroPanel
          wineVersionCount={wineVersions.length}
          installedWineCount={installedWineCount}
          bottleCount={bottles.length}
          isLoadingWineVersions={isLoadingWineVersions}
          imageSrc={heroImageSrc}
        />
        <SelectedWineSummaryPanel
          selectedWineVersion={selectedWineVersion}
          installPath={installPath}
          isWorking={Boolean(workingVersion)}
        />
      </section>

      <section
        className={`grid gap-6 ${isInstalledWineOpen ? "xl:grid-cols-[minmax(0,1fr)_28rem]" : ""}`}
      >
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

        {isInstalledWineOpen && (
          <InstalledWinePanel
            wineVersions={wineVersions}
            selectedWineVersionId={selectedWineVersionId}
            installPath={installPath}
            className="xl:sticky xl:top-6"
            onSelectWineVersion={onSelectWineVersion}
            onClose={onToggleInstalledWine}
          />
        )}
      </section>
    </div>
  );
}

export function BottleDetailPanel({
  bottle,
  selectedWineVersionId,
  appLogoSrc,
  onBottleHome,
}: {
  bottle: Bottle;
  selectedWineVersionId: string;
  appLogoSrc: string;
  onBottleHome?: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-6 p-6">
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-6">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <StatusBadge
                label={t(`main.bottleStatus.${bottle.status}`)}
                tone={tone_from_bottle_status(bottle.status)}
              />
              <h3 className="mt-4 text-2xl font-bold tracking-normal text-white">
                {bottle.name}
              </h3>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                {bottle.description}
              </p>
            </div>
            <button
              type="button"
              onClick={onBottleHome}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
            >
              {t("main.backToBottleHome")}
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-white/10 bg-[#0b1020] p-3 text-xs">
              <p className="text-slate-500">{t("main.selectedWine")}</p>
              <p className="mt-1 font-semibold text-slate-200">
                {bottle.wineVersionId}
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-[#0b1020] p-3 text-xs">
              <p className="text-slate-500">{t("main.bottlePath")}</p>
              <p className="mt-1 break-all text-slate-300">{bottle.path}</p>
            </div>
          </div>
        </div>

        <aside className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
          <h3 className="text-base font-semibold text-white">
            {t("main.recipeSettings")}
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {t("main.recipeSettingsDescription")}
          </p>
          <button
            type="button"
            className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
          >
            {t("main.openRecipeSettings")}
          </button>
        </aside>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-white">
              {t("main.bottleGames")}
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              {t("main.bottleApps", { count: bottle.apps.length })}
            </p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {bottle.apps.map((app) => (
            <ImageButton
              key={app.id}
              src={appLogoSrc}
              name={app.name}
              subtitle={`${app.subtitle} · ${app.lastPlayedKey ? t(app.lastPlayedKey) : app.lastPlayed}`}
              isActive={app.wineVersionId === selectedWineVersionId}
              actionLabel={
                app.status === "needs-prefix"
                  ? t("common.actions.createPrefix")
                  : t("common.actions.run")
              }
            />
          ))}
        </div>
      </section>
    </div>
  );
}

export function CreateBottleDialog({
  open,
  wineVersions,
  selectedWineVersionId,
  onClose,
  onCreateBottle,
}: {
  open: boolean;
  wineVersions: WineVersion[];
  selectedWineVersionId: string;
  onClose: () => void;
  onCreateBottle?: (input: CreateBottleInput) => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = React.useState<CreateBottleInput>({
    name: "",
    wineVersionId: selectedWineVersionId,
    path: "",
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
  const canCreateBottle =
    form.name.trim().length > 0 && form.wineVersionId.trim().length > 0;

  React.useEffect(() => {
    if (!open) {
      return;
    }

    setForm({
      name: generate_bottle_name(),
      wineVersionId:
        selectedWineVersionId || selectableWineVersions[0]?.id || "",
      path: "",
      description: "",
    });
  }, [open, selectedWineVersionId, selectableWineVersions]);

  function update_form<K extends keyof CreateBottleInput>(
    key: K,
    value: CreateBottleInput[K],
  ) {
    setForm((currentForm) => ({
      ...currentForm,
      [key]: value,
    }));
  }

  function submit() {
    if (!canCreateBottle) {
      return;
    }

    onCreateBottle?.({
      name: form.name.trim(),
      wineVersionId: form.wineVersionId,
      path: form.path.trim(),
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
              onChange={(event) => update_form("name", event.target.value)}
              placeholder={t("main.createBottle.namePlaceholder")}
              className="h-11 min-w-0 flex-1 rounded-lg border border-white/10 bg-[#0b1020] px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-[rgb(var(--accent-rgb)/0.55)]"
            />
            <button
              type="button"
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
              onClick={() => update_form("name", generate_bottle_name())}
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
          <select
            value={form.wineVersionId}
            onChange={(event) =>
              update_form("wineVersionId", event.target.value)
            }
            className="h-11 rounded-lg border border-white/10 bg-[#0b1020] px-3 text-sm text-slate-100 outline-none transition focus:border-[rgb(var(--accent-rgb)/0.55)]"
          >
            {selectableWineVersions.map((version) => (
              <option key={version.id} value={version.id}>
                {version.name}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t("main.createBottle.pathLabel")}
          </span>
          <input
            value={form.path}
            onChange={(event) => update_form("path", event.target.value)}
            placeholder={t("main.createBottle.pathPlaceholder")}
            className="h-11 rounded-lg border border-white/10 bg-[#0b1020] px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-[rgb(var(--accent-rgb)/0.55)]"
          />
        </label>

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
