import React from "react";
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, Download, FolderOpen, GripVertical, Layers3, LayoutGrid, PackageOpen, Plus, Search, Settings, SlidersHorizontal, Sparkles, Trash2, Wine as WineIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { BottleLaunchOptionsPayload, BottleLauncherKind, BottlePrefixMetadataPayload, DeleteLauncherDataResultPayload } from "../../Common/Types/IPC";
import type { DxmtVersion, JadeiteVersion, WineVersion } from "../../Common/Types/Wine";
import type { Bottle, CreateBottleInput } from "../Types/Bottle";
import { create_bottle_path_from_name, normalize_bottle_prefix_root } from "../../Common/Util/BottlePath";
import { assign_missing_bottle_icon_ids, BOTTLE_ICON_IDS, BottleIconId, is_bottle_icon_id, pick_bottle_icon_id } from "../../Common/Util/BottleIcon";
import bottleIcon1 from "../../../resouces/app/images/bottles/icon1.png";
import bottleIcon2 from "../../../resouces/app/images/bottles/icon2.png";
import bottleIcon3 from "../../../resouces/app/images/bottles/icon3.png";
import bottleIcon4 from "../../../resouces/app/images/bottles/icon4.png";
import bottleIcon5 from "../../../resouces/app/images/bottles/icon5.png";
import bottleIcon6 from "../../../resouces/app/images/bottles/icon6.png";
import bottleIcon7 from "../../../resouces/app/images/bottles/icon7.png";
import bottleIcon8 from "../../../resouces/app/images/bottles/icon8.png";
import bottleIcon10 from "../../../resouces/app/images/bottles/icon10.png";
import bottleIcon11 from "../../../resouces/app/images/bottles/icon11.png";
import bottleIcon12 from "../../../resouces/app/images/bottles/icon12.png";
import bottleIcon13 from "../../../resouces/app/images/bottles/icon13.png";
import { Dialog } from "./Dialog";
import { ProgressBar } from "./ProgressBar";
import { PathAutocompleteInput } from "./PathAutocompleteInput";
import { AppLibraryPanel } from "./AppLibraryPanel";
import { BottleActionBar } from "./BottleActionBar";
import { Badge, Box, Button, IconSlot, Inline, InlineText, Input, List, ListItem, ListItemBody, ListItemDescription, ListItemIcon, ListItemTitle, Stack, Text, Textarea } from "./Primitives";
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

type BottleCardSize = "large" | "medium" | "small" | "compact";

const BOTTLE_CARD_SIZE_STORAGE_KEY = "bdih:bottle-card-size";
const BOTTLE_CARD_SIZES: BottleCardSize[] = ["compact", "small", "medium", "large"];
const BOTTLE_ICON_IMAGE_BY_ID: Record<BottleIconId, string> = {
  icon1: bottleIcon1,
  icon2: bottleIcon2,
  icon3: bottleIcon3,
  icon4: bottleIcon4,
  icon5: bottleIcon5,
  icon6: bottleIcon6,
  icon7: bottleIcon7,
  icon8: bottleIcon8,
  icon10: bottleIcon10,
  icon11: bottleIcon11,
  icon12: bottleIcon12,
  icon13: bottleIcon13,
};
const BOTTLE_GRID_CLASSES: Record<BottleCardSize, string> = {
  large: "grid w-full max-w-[113rem] grid-cols-[repeat(auto-fill,18rem)] justify-start gap-4",
  medium: "grid w-full max-w-[102.5rem] grid-cols-[repeat(auto-fill,14rem)] justify-start gap-3",
  small: "grid grid-cols-[repeat(auto-fill,minmax(8rem,9rem))] justify-start gap-3",
  compact: "grid grid-cols-[repeat(auto-fill,minmax(6.5rem,7.5rem))] justify-start gap-2",
};

function bottle_icon_src(bottle: Pick<Bottle, "id" | "bottleIconId">): string {
  const bottleIconId = is_bottle_icon_id(bottle.bottleIconId)
    ? bottle.bottleIconId
    : pick_bottle_icon_id([], bottle.id);
  return BOTTLE_ICON_IMAGE_BY_ID[bottleIconId];
}

function initial_bottle_card_size(): BottleCardSize {
  try {
    const savedSize = window.localStorage.getItem(BOTTLE_CARD_SIZE_STORAGE_KEY);
    return BOTTLE_CARD_SIZES.includes(savedSize as BottleCardSize)
      ? savedSize as BottleCardSize
      : "large";
  } catch {
    return "large";
  }
}

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

function bottle_name_key(name: string): string {
  return name.normalize("NFC").trim().toLocaleLowerCase();
}

function unique_bottle_name(baseName: string, existingNames: string[]): string {
  const usedNames = new Set(existingNames.map(bottle_name_key));

  if (!usedNames.has(bottle_name_key(baseName))) {
    return baseName;
  }

  for (let suffix = 1; ; suffix += 1) {
    const candidate = `${baseName}${suffix}`;

    if (!usedNames.has(bottle_name_key(candidate))) {
      return candidate;
    }
  }
}

function generate_bottle_name(existingNames: string[] = []) {
  return unique_bottle_name(pick_random_item(CHARACTER_BOTTLE_NAMES), existingNames);
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
  // A completed status without a resolved host path cannot be used to build a
  // Bottle runtime request. Requiring the path prevents a transient download
  // event from creating Bottle metadata that only contains a version id.
  return Boolean(version?.path)
    && (version?.status === "installed" || version?.status === "completed");
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
  iconSrc,
  onClick,
  onContextMenu,
  isEditing = false,
  isDragging = false,
  size = "large",
  dragHandleProps,
}: {
  bottle: Bottle;
  iconSrc?: string;
  onClick: () => void;
  onContextMenu?: (
    event: React.MouseEvent<HTMLButtonElement>,
    bottle: Bottle,
  ) => void;
  isEditing?: boolean;
  isDragging?: boolean;
  size?: BottleCardSize;
  dragHandleProps?: React.ButtonHTMLAttributes<HTMLButtonElement>;
}) {
  const { t } = useTranslation();
  const isRunning = is_bottle_running(bottle);
  const runningAppCount = bottle_running_app_count(bottle);
  const resolvedIconSrc = iconSrc ?? bottle_icon_src(bottle);

  return (
    <Button
      {...dragHandleProps}
      type="button"
      onClick={isEditing ? undefined : onClick}
      onContextMenu={(event) => {
        if (isEditing) {
          event.preventDefault();
          return;
        }

        onContextMenu?.(event, bottle);
      }}
      className={`group relative flex w-full flex-col rounded-lg border text-left transition ${
        isRunning
          ? "border-emerald-300/45 bg-emerald-400/[0.07] shadow-[0_0_28px_rgba(16,185,129,0.16)] hover:border-emerald-200/60 hover:bg-emerald-400/[0.10]"
          : "border-white/10 bg-white/[0.04] hover:border-white/20 hover:bg-white/[0.07]"
      } ${
        isEditing
          ? "cursor-grab border-[rgb(var(--accent-rgb)/0.55)] bg-[rgb(var(--accent-rgb)/0.08)] shadow-[0_10px_30px_rgba(0,0,0,0.2)] active:cursor-grabbing"
          : ""
      } ${isDragging ? "scale-[0.97] opacity-55" : ""} ${
        size === "large"
          ? "h-56 p-4"
          : size === "medium"
            ? "h-44 p-3"
            : size === "small"
              ? "aspect-square p-2"
              : "aspect-square p-2"
      }`}
      aria-label={bottle.name}
      aria-grabbed={isEditing ? isDragging : undefined}
    >
      {size === "compact" ? (
        <Stack className="min-h-0 min-w-0 flex-1 items-center justify-center gap-0.5 text-center">
          <IconSlot className={`flex h-[3.25rem] w-[3.25rem] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#0b1020] ring-1 ${isRunning ? "running-app-icon-frame ring-emerald-300/45" : "ring-white/10"}`}>
            <img src={resolvedIconSrc} alt="" aria-hidden="true" className="h-full w-full object-cover" />
          </IconSlot>
          <InlineText className="w-full shrink-0 truncate text-center text-xs font-semibold leading-4 text-slate-100">
            {bottle.name}
          </InlineText>
          {isEditing ? (
            <IconSlot className="flex h-4 w-6 shrink-0 items-center justify-center rounded-full border border-white/15 bg-black/25 text-slate-200">
              <GripVertical size={11} />
            </IconSlot>
          ) : (
            <StatusBadge
              label={isRunning ? t("main.bottleStatus.running") : t(`main.bottleStatus.${bottle.status}`)}
              tone={isRunning ? "success" : tone_from_bottle_status(bottle.status)}
              animated={isRunning}
              className="!h-4 max-w-full truncate rounded !px-1.5 text-[9px]"
            />
          )}
          <InlineText className="w-full shrink-0 truncate text-center text-[10px] leading-3 text-slate-500">
            {isRunning
              ? t("main.bottleRunningApps", { count: runningAppCount })
              : t("main.bottleApps", { count: bottle.apps.length })}
          </InlineText>
        </Stack>
      ) : size === "small" ? (
        <Stack className="min-h-0 min-w-0 flex-1 items-center justify-center gap-0.5 text-center">
          <IconSlot className={`flex h-[4.75rem] w-[4.75rem] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#0b1020] ring-1 ${isRunning ? "running-app-icon-frame ring-emerald-300/45" : "ring-white/10"}`}>
            <img src={resolvedIconSrc} alt="" aria-hidden="true" className="h-full w-full object-cover" />
          </IconSlot>
          <InlineText className="w-full shrink-0 truncate text-sm font-semibold leading-4 text-slate-100">
            {bottle.name}
          </InlineText>
          {isEditing ? (
            <IconSlot className="flex h-4 w-7 shrink-0 items-center justify-center rounded-full border border-white/15 bg-black/25 text-slate-200">
              <GripVertical size={12} />
            </IconSlot>
          ) : (
            <StatusBadge
              label={isRunning ? t("main.bottleStatus.running") : t(`main.bottleStatus.${bottle.status}`)}
              tone={isRunning ? "success" : tone_from_bottle_status(bottle.status)}
              animated={isRunning}
              className="!h-4 max-w-full truncate rounded !px-1.5 text-[9px]"
            />
          )}
          <InlineText className="w-full shrink-0 truncate text-center text-[10px] leading-3 text-slate-500">
            {isRunning
              ? t("main.bottleRunningApps", { count: runningAppCount })
              : t("main.bottleApps", { count: bottle.apps.length })}
          </InlineText>
        </Stack>
      ) : (
        <>
          <Inline className={`${size === "large" ? "mb-3 gap-3" : "mb-2 gap-2"} min-w-0 items-start`}>
            <IconSlot className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#0b1020] ring-1 ${size === "large" ? "h-20 w-20" : "h-16 w-16"} ${isRunning ? "running-app-icon-frame ring-emerald-300/45" : "ring-white/10"}`}>
              <img src={resolvedIconSrc} alt="" aria-hidden="true" className="h-full w-full object-cover" />
            </IconSlot>
            <Stack className="min-w-0 flex-1 gap-1">
              <Inline className="min-w-0 items-start justify-between gap-1.5">
                <InlineText className={`${size === "large" ? "text-lg leading-6" : "text-[13px] leading-5"} min-w-0 flex-1 line-clamp-2 whitespace-normal [hyphens:none] [overflow-wrap:anywhere] [text-wrap:balance] [word-break:keep-all] font-bold text-slate-100`}>
                  {bottle.name}
                </InlineText>
                {isEditing ? (
                  <IconSlot className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/15 bg-black/25 text-slate-200 shadow-lg">
                    <GripVertical size={16} />
                  </IconSlot>
                ) : (
                  <StatusBadge
                    label={isRunning ? t("main.bottleStatus.running") : t(`main.bottleStatus.${bottle.status}`)}
                    tone={isRunning ? "success" : tone_from_bottle_status(bottle.status)}
                    animated={isRunning}
                    className={size === "large"
                      ? "!h-5 rounded !px-2 text-[10px]"
                      : "!h-5 rounded !px-1.5 text-[9px]"}
                  />
                )}
              </Inline>
              <InlineText className={`${size === "large" ? "line-clamp-4 text-xs" : "line-clamp-2 text-[11px]"} block min-w-0 whitespace-normal break-words leading-5 text-slate-400`}>
                {bottle.description}
              </InlineText>
            </Stack>
          </Inline>
          <Inline className={`${size === "large" ? "pt-3" : "pt-2"} mt-auto items-center justify-between gap-3 text-xs text-slate-400`}>
            <InlineText>
              {isRunning
                ? t("main.bottleRunningApps", { count: runningAppCount })
                : t("main.bottleApps", { count: bottle.apps.length })}
            </InlineText>
            <InlineText className="truncate text-slate-500">{bottle.wineVersionId}</InlineText>
          </Inline>
        </>
      )}
    </Button>
  );
}

function SortableBottleCard({
  bottle,
  iconSrc,
  isEditing,
  size,
  onClick,
  onContextMenu,
}: {
  bottle: Bottle;
  iconSrc: string;
  isEditing: boolean;
  size: BottleCardSize;
  onClick: () => void;
  onContextMenu: (
    event: React.MouseEvent<HTMLButtonElement>,
    bottle: Bottle,
  ) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: bottle.id,
    disabled: !isEditing,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 20 : undefined,
      }}
      className={isDragging ? "relative" : undefined}
    >
      <BottleCard
        bottle={bottle}
        iconSrc={iconSrc}
        onClick={onClick}
        onContextMenu={onContextMenu}
        isEditing={isEditing}
        isDragging={isDragging}
        size={size}
        dragHandleProps={isEditing ? { ...attributes, ...listeners } : undefined}
      />
    </div>
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
  onReorderBottles,
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
  onReorderBottles?: (orderedBottleIds: string[]) => Promise<void> | void;
  onCreateBottle: () => void;
}) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = React.useState("");
  const [isEditing, setIsEditing] = React.useState(false);
  const [isApplyingOrder, setIsApplyingOrder] = React.useState(false);
  const [isSizeMenuOpen, setIsSizeMenuOpen] = React.useState(false);
  const [bottleCardSize, setBottleCardSize] = React.useState<BottleCardSize>(initial_bottle_card_size);
  const sizeMenuRef = React.useRef<HTMLDivElement>(null);
  const lastSelectedSizeRef = React.useRef<BottleCardSize | null>(null);
  const [draftBottleOrder, setDraftBottleOrder] = React.useState<string[]>(() => bottles.map((bottle) => bottle.id));
  const draftBottleOrderRef = React.useRef(draftBottleOrder);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  React.useEffect(() => {
    const bottleIds = bottles.map((bottle) => bottle.id);
    const bottleIdSet = new Set(bottleIds);
    const nextOrder = [
      ...draftBottleOrderRef.current.filter((bottleId) => bottleIdSet.has(bottleId)),
      ...bottleIds.filter((bottleId) => !draftBottleOrderRef.current.includes(bottleId)),
    ];

    draftBottleOrderRef.current = nextOrder;
    setDraftBottleOrder(nextOrder);
  }, [bottles]);

  React.useEffect(() => {
    if (!isSizeMenuOpen) {
      return;
    }

    const windowDragRegions = Array.from(
      document.querySelectorAll<HTMLElement>("[data-window-drag-region]"),
    );

    for (const region of windowDragRegions) {
      region.style.setProperty("-webkit-app-region", "no-drag");
    }

    const close_size_menu_on_outside_pointer = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const isSizeToggle = Boolean(target?.closest('[data-bottle-size-toggle="true"]'));
      const isInsideSizeMenu = Boolean(sizeMenuRef.current?.contains(event.target as Node));

      if (!isInsideSizeMenu && !isSizeToggle) {
        lastSelectedSizeRef.current = null;
        setIsSizeMenuOpen(false);
      }
    };
    const close_size_menu_on_window_blur = () => {
      lastSelectedSizeRef.current = null;
      setIsSizeMenuOpen(false);
    };

    document.addEventListener("pointerdown", close_size_menu_on_outside_pointer, true);
    window.addEventListener("blur", close_size_menu_on_window_blur);

    return () => {
      document.removeEventListener("pointerdown", close_size_menu_on_outside_pointer, true);
      window.removeEventListener("blur", close_size_menu_on_window_blur);

      for (const region of windowDragRegions) {
        region.style.removeProperty("-webkit-app-region");
      }
    };
  }, [isSizeMenuOpen]);

  const orderedBottles = React.useMemo(() => {
    if (!isEditing) {
      return bottles;
    }

    const bottlesById = new Map(bottles.map((bottle) => [bottle.id, bottle]));
    return draftBottleOrder
      .map((bottleId) => bottlesById.get(bottleId))
      .filter((bottle): bottle is Bottle => Boolean(bottle));
  }, [bottles, draftBottleOrder, isEditing]);
  const visibleBottles = React.useMemo(() => {
    const search = searchQuery.normalize("NFC").trim().toLocaleLowerCase();

    if (!search) {
      return orderedBottles;
    }

    return orderedBottles.filter((bottle) => [
      bottle.name,
      bottle.description,
      bottle.wineVersionId,
      ...bottle.apps.flatMap((app) => [app.name, app.subtitle]),
    ].some((value) => value?.normalize("NFC").toLocaleLowerCase().includes(search)));
  }, [orderedBottles, searchQuery]);
  const bottleIconAssignments = React.useMemo(() => new Map(
    assign_missing_bottle_icon_ids(bottles).map((bottle) => [
      bottle.id,
      BOTTLE_ICON_IMAGE_BY_ID[bottle.bottleIconId],
    ]),
  ), [bottles]);

  const begin_edit_mode = () => {
    const nextOrder = bottles.map((bottle) => bottle.id);
    draftBottleOrderRef.current = nextOrder;
    setDraftBottleOrder(nextOrder);
    lastSelectedSizeRef.current = null;
    setIsSizeMenuOpen(false);
    setIsEditing(true);
  };

  const select_bottle_card_size = (size: BottleCardSize) => {
    if (lastSelectedSizeRef.current === size) {
      lastSelectedSizeRef.current = null;
      setIsSizeMenuOpen(false);
      return;
    }

    lastSelectedSizeRef.current = size;
    setBottleCardSize(size);

    try {
      window.localStorage.setItem(BOTTLE_CARD_SIZE_STORAGE_KEY, size);
    } catch {
      // The selected size still applies for the current renderer session.
    }
  };

  const cancel_edit_mode = () => {
    const originalOrder = bottles.map((bottle) => bottle.id);
    draftBottleOrderRef.current = originalOrder;
    setDraftBottleOrder(originalOrder);
    setIsEditing(false);
  };

  const apply_edit_order = async () => {
    if (isApplyingOrder) {
      return;
    }

    setIsApplyingOrder(true);

    try {
      await onReorderBottles?.(draftBottleOrderRef.current);
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to persist bottle order:", error);
    } finally {
      setIsApplyingOrder(false);
    }
  };

  const finish_bottle_drag = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) {
      return;
    }

    const currentOrder = draftBottleOrderRef.current;
    const sourceIndex = currentOrder.indexOf(String(active.id));
    const targetIndex = currentOrder.indexOf(String(over.id));

    if (sourceIndex < 0 || targetIndex < 0) {
      return;
    }

    const nextOrder = arrayMove(currentOrder, sourceIndex, targetIndex);
    draftBottleOrderRef.current = nextOrder;
    setDraftBottleOrder(nextOrder);
  };

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
          <Inline className="h-9 w-64 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-slate-500 focus-within:border-[rgb(var(--accent-rgb)/0.55)] focus-within:bg-white/[0.07]">
            <Search size={15} />
            <Input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t("main.searchReady")}
              aria-label={t("main.searchReady")}
              className="h-auto min-w-0 flex-1 border-0 bg-transparent p-0 text-xs text-slate-100 shadow-none outline-none placeholder:text-slate-500 focus:border-0 focus:ring-0"
            />
          </Inline>
          <div ref={sizeMenuRef} className="relative">
            <Button
              type="button"
              aria-expanded={isSizeMenuOpen}
              aria-label={t("main.bottleSize.title")}
              title={t("main.bottleSize.title")}
              data-bottle-size-toggle="true"
              onClick={() => setIsSizeMenuOpen((isOpen) => {
                lastSelectedSizeRef.current = null;
                return !isOpen;
              })}
              disabled={isEditing}
              className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border transition disabled:cursor-not-allowed disabled:opacity-40 ${
                isSizeMenuOpen
                  ? "accent-selection text-white"
                  : "border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
              }`}
            >
              <LayoutGrid size={16} />
            </Button>
            {isSizeMenuOpen ? (
              <Box className="absolute left-0 top-11 z-40 grid w-64 grid-cols-4 gap-1 rounded-xl border border-white/10 bg-[#0b1020]/95 p-2 shadow-2xl shadow-black/45 backdrop-blur-xl">
                {BOTTLE_CARD_SIZES.map((size) => (
                  <Button
                    key={size}
                    type="button"
                    aria-pressed={bottleCardSize === size}
                    onClick={() => select_bottle_card_size(size)}
                    className={`flex min-w-0 flex-col items-center gap-1 rounded-lg border px-1.5 py-2 text-[10px] font-semibold transition ${
                      bottleCardSize === size
                        ? "accent-selection text-white"
                        : "border-white/8 bg-white/[0.03] text-slate-400 hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
                    }`}
                  >
                    <InlineText className="flex h-5 w-full items-center justify-center">
                      <LayoutGrid size={size === "large" ? 20 : size === "medium" ? 17 : size === "small" ? 14 : 11} />
                    </InlineText>
                    <InlineText className="h-4 w-full truncate text-center leading-4">
                      {t(`main.bottleSize.${size}`)}
                    </InlineText>
                  </Button>
                ))}
              </Box>
            ) : null}
          </div>
          {isEditing ? (
            <Stack className="w-36 gap-1">
              <Button
                type="button"
                aria-pressed="true"
                disabled
                className="accent-selection inline-flex h-8 w-full cursor-default items-center justify-center gap-2 rounded-lg border px-3 text-xs font-semibold text-white disabled:opacity-100"
              >
                <GripVertical size={14} />
                {t("main.bottleEditing")}
              </Button>
              <Inline className="gap-1">
                <Button
                type="button"
                onClick={cancel_edit_mode}
                disabled={isApplyingOrder}
                className="inline-flex h-7 flex-1 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] px-2 text-[11px] font-semibold text-slate-300 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
                >
                  {t("main.bottleEditCancel")}
                </Button>
                <Button
                  type="button"
                  onClick={() => void apply_edit_order()}
                  disabled={isApplyingOrder}
                  className="accent-primary inline-flex h-7 flex-1 items-center justify-center gap-1 rounded-md px-2 text-[11px] font-semibold disabled:cursor-wait disabled:opacity-60"
                >
                  <Check size={12} />
                  {t("main.bottleEditApply")}
                </Button>
              </Inline>
            </Stack>
          ) : (
            <Button
              type="button"
              aria-pressed="false"
              onClick={begin_edit_mode}
              disabled={bottles.length === 0}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-slate-300 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <GripVertical size={15} />
              {t("main.bottleEdit")}
            </Button>
          )}
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

      {isEditing ? (
        <Text className="rounded-lg border border-[rgb(var(--accent-rgb)/0.25)] bg-[rgb(var(--accent-rgb)/0.08)] px-3 py-2 text-xs text-[rgb(var(--accent-soft-text-rgb))]">
          {t("main.bottleEditHint")}
        </Text>
      ) : null}

      {visibleBottles.length > 0 ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={finish_bottle_drag}
        >
          <SortableContext
            items={visibleBottles.map((bottle) => bottle.id)}
            strategy={rectSortingStrategy}
          >
            <Box className={BOTTLE_GRID_CLASSES[bottleCardSize]}>
              {visibleBottles.map((bottle) => (
                <SortableBottleCard
                  key={bottle.id}
                  bottle={bottle}
                  iconSrc={bottleIconAssignments.get(bottle.id) ?? BOTTLE_ICON_IMAGE_BY_ID[BOTTLE_ICON_IDS[0]]}
                  isEditing={isEditing && !isApplyingOrder}
                  size={bottleCardSize}
                  onClick={() => onSelectBottle?.(bottle.id)}
                  onContextMenu={onBottleContextMenu}
                />
              ))}
            </Box>
          </SortableContext>
        </DndContext>
      ) : (
        <Text className="rounded-lg border border-dashed border-white/10 bg-white/[0.025] px-4 py-10 text-center text-sm text-slate-500">
          {t("main.bottleSearchEmpty")}
        </Text>
      )}

      {!isEditing ? (
        <Button
          type="button"
          className="accent-primary fixed bottom-8 right-8 z-30 inline-flex h-12 w-12 items-center justify-center rounded-full shadow-xl shadow-black/35 transition hover:scale-105 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent-rgb)/0.45)]"
          aria-label={t("main.createBottle.action")}
          title={t("main.createBottle.action")}
          onClick={onCreateBottle}
        >
          <Plus size={24} />
        </Button>
      ) : null}
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
  onReorderBottles,
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
  onReorderBottles?: (orderedBottleIds: string[]) => Promise<void> | void;
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
          onReorderBottles={onReorderBottles}
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
        widthClassName="max-w-4xl"
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

      <Box className="grid gap-5">
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

        <Stack className="min-w-0 gap-2">
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
    <Box className={isSelected ? "relative pt-3" : "relative"}>
      {isSelected ? (
        <Badge
          tone="unstyled"
          className="accent-primary absolute left-3 top-3 z-10 inline-flex -translate-y-1/2 items-center justify-center rounded-md border border-white/20 px-2.5 py-1 text-[10px] font-bold leading-none text-white shadow-[0_5px_14px_rgba(0,0,0,0.38)]"
        >
          {t("main.runtimeDownloads.defaultSelection")}
        </Badge>
      ) : null}
      <ListItem as="article" density="compact" tone={isSelected ? "selected" : "default"} className={`flex-col p-2 ${isSelected ? "pt-3.5" : ""}`}>
        <Box className="grid min-w-0 items-stretch gap-2 sm:grid-cols-[minmax(0,1fr)_6rem]">
          <Button
            type="button"
            aria-pressed={isSelected}
            className="grid min-w-0 items-center gap-3 rounded-md p-1.5 text-left transition hover:bg-white/[0.05] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent-rgb)/0.45)] md:grid-cols-[minmax(0,1fr)_8rem_6rem]"
            onClick={() => onSelect?.(version.id)}
          >
            <Inline className="min-w-0 items-center gap-3">
              <ListItemIcon className="accent-text flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-800 ring-1 ring-white/10">
                {icon}
              </ListItemIcon>
              <ListItemBody className="gap-0.5">
                <ListItemTitle title={version.name}>{version.name}</ListItemTitle>
                <ListItemDescription className="text-[11px]">{version.version}{path ? ` - ${path}` : ""}</ListItemDescription>
              </ListItemBody>
            </Inline>
            <Box className="min-w-0">
              <ProgressBar progressValue={progress} showValue size="sm" tone={isWorking ? "blue" : "emerald"} animated={isWorking} />
            </Box>
            <Box className="flex w-24 justify-start md:justify-end">
              <StatusBadge label={label_from_status(version.status, t)} tone={tone_from_status(version.status)} className="w-24 justify-center" />
            </Box>
          </Button>
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
            className={`inline-flex h-8 w-24 shrink-0 self-center justify-self-end items-center justify-center gap-1 rounded-md px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-500 ${
              isInstalled
                ? "border border-rose-300/20 bg-rose-500/10 text-rose-100 hover:border-rose-300/35 hover:bg-rose-500/20"
                : "accent-primary"
            }`}
          >
            {isInstalled ? <Trash2 size={14} /> : <Download size={14} />}
            {isWorking ? `${progress}%` : isInstalled ? t("common.actions.delete") : t("common.actions.install")}
          </Button>
        </Box>
      </ListItem>
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
  onDownloadBottleLauncherInstaller,
  onInstallBottleLauncher,
  onInstallBottleLauncherExecutable,
  onLaunchBottleApp,
  onStopBottleApp,
  onDeleteBottleApp,
  onDeleteBottleAppFiles,
  onReorderBottleApps,
  onRegisterBottleExecutable,
  onUpdateBottlePrefixes,
  onDeleteBottlePrefix,
  onClearBottleDxmtShaderCaches,
  onChangeBottleAppLaunchOptions,
  onChangeBottleRecipe,
  onApplyBottleRecipe,
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
  onDownloadBottleLauncherInstaller?: (bottleId: string, launcher: BottleLauncherKind) => void;
  onInstallBottleLauncher?: (bottleId: string, launcher: BottleLauncherKind) => void;
  onInstallBottleLauncherExecutable?: (bottleId: string, launcher: BottleLauncherKind) => void;
  onLaunchBottleApp?: (bottleId: string, appId: string) => void;
  onStopBottleApp?: (bottleId: string, appId: string) => void;
  onDeleteBottleApp?: (bottleId: string, appId: string) => void;
  onDeleteBottleAppFiles?: (bottleId: string, appId: string) => void;
  onReorderBottleApps?: (bottleId: string, orderedAppIds: string[]) => Promise<void> | void;
  onRegisterBottleExecutable?: (bottleId: string, executablePath: string, prefixPath: string, launchOptions?: BottleLaunchOptionsPayload) => void;
  onUpdateBottlePrefixes?: (bottleId: string, prefixes: BottlePrefixMetadataPayload[]) => void;
  onDeleteBottlePrefix?: (bottleId: string, prefix: BottlePrefixMetadataPayload) => Promise<void> | void;
  onClearBottleDxmtShaderCaches?: (bottleId: string, prefixPaths?: string[]) => Promise<DeleteLauncherDataResultPayload | undefined>;
  onChangeBottleAppLaunchOptions?: (bottleId: string, appId: string, launchOptions: BottleLaunchOptionsPayload) => void;
  onChangeBottleRecipe?: (bottleId: string, patch: Partial<Pick<Bottle, "wineVersionId" | "dxmtVersionId" | "jadeiteVersionId">>) => void;
  onApplyBottleRecipe?: (
    bottleId: string,
    patch: Partial<Pick<Bottle, "wineVersionId" | "dxmtVersionId" | "jadeiteVersionId">> & {
      validateOnly?: boolean;
      reapplyRuntime?: boolean;
      forceReapplyRuntime?: boolean;
    },
    reportProgress: (update: { progress: number; message: string }) => void,
  ) => Promise<{ runtimeUpdated?: boolean } | void> | { runtimeUpdated?: boolean } | void;
  onInstallWineVersion?: (versionId: string) => void;
  onInstallDxmtVersion?: (versionId: string) => void;
  onInstallJadeiteVersion?: (versionId: string) => void;
}) {
  const { t } = useTranslation();
  const [isRecipeOpen, setIsRecipeOpen] = React.useState(false);
  const [isAdvancedSettingsOpen, setIsAdvancedSettingsOpen] = React.useState(false);
  const [selectedCachePrefixPaths, setSelectedCachePrefixPaths] = React.useState<Set<string>>(new Set());
  const [isClearingDxmtCache, setIsClearingDxmtCache] = React.useState(false);
  const [dxmtCacheResult, setDxmtCacheResult] = React.useState<"success" | "error" | null>(null);
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
  const dxmtCachePrefixes = React.useMemo(() => bottle_dxmt_cache_prefixes(bottle), [bottle]);
  const areAllCachePrefixesSelected = dxmtCachePrefixes.length > 0 && dxmtCachePrefixes.every((prefix) =>
    selectedCachePrefixPaths.has(prefix.path),
  );

  function open_advanced_settings() {
    setSelectedCachePrefixPaths(new Set());
    setDxmtCacheResult(null);
    setIsAdvancedSettingsOpen(true);
  }

  function toggle_cache_prefix(prefixPath: string) {
    setSelectedCachePrefixPaths((currentPaths) => {
      const nextPaths = new Set(currentPaths);
      if (nextPaths.has(prefixPath)) nextPaths.delete(prefixPath);
      else nextPaths.add(prefixPath);
      return nextPaths;
    });
    setDxmtCacheResult(null);
  }

  function toggle_all_cache_prefixes() {
    setSelectedCachePrefixPaths(areAllCachePrefixesSelected
      ? new Set()
      : new Set(dxmtCachePrefixes.map((prefix) => prefix.path)));
    setDxmtCacheResult(null);
  }

  async function clear_selected_dxmt_caches() {
    if (isBottleRunning || selectedCachePrefixPaths.size === 0 || !onClearBottleDxmtShaderCaches) return;

    setIsClearingDxmtCache(true);
    setDxmtCacheResult(null);
    try {
      const result = await onClearBottleDxmtShaderCaches(bottle.id, [...selectedCachePrefixPaths]);
      setDxmtCacheResult(result && result.failedPaths.length === 0 ? "success" : "error");
    } catch {
      setDxmtCacheResult("error");
    } finally {
      setIsClearingDxmtCache(false);
    }
  }

  return (
    <Box className="grid min-h-full grid-cols-[minmax(0,1fr)_18rem] gap-4 p-6">
      <AppLibraryPanel
        bottle={bottle}
        selectedWineVersionId={selectedWineVersionId}
        launcherOptionsManifest={launcherOptionsManifest}
        appLogoSrc={appLogoSrc}
        onLaunchBottleApp={onLaunchBottleApp}
        onStopBottleApp={onStopBottleApp}
        onDeleteBottleApp={onDeleteBottleApp}
        onDeleteBottleAppFiles={onDeleteBottleAppFiles}
        onReorderBottleApps={onReorderBottleApps}
        onRegisterBottleExecutable={onRegisterBottleExecutable}
        onUpdateBottlePrefixes={onUpdateBottlePrefixes}
        onDeleteBottlePrefix={onDeleteBottlePrefix}
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
          <Inline className="min-w-0 items-center gap-4 py-1">
            <Box className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] shadow-lg shadow-black/20">
              <img src={bottle_icon_src(bottle)} alt="" aria-hidden="true" className="h-full w-full object-cover" />
            </Box>
            <Stack className="min-w-0 flex-1 self-stretch items-start justify-center gap-1 pb-1 text-left">
              <Box as="h3" className="w-full min-w-0 truncate text-left text-xl font-bold tracking-normal text-white">
                {bottle.name}
              </Box>
              <Text className="w-full line-clamp-2 text-left text-xs leading-5 text-slate-400">
                {bottle.description || t("main.bottleInfo.description")}
              </Text>
            </Stack>
          </Inline>
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
          <Button
            type="button"
            onClick={open_advanced_settings}
            className="inline-flex h-9 w-full shrink-0 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
          >
            <SlidersHorizontal size={13} />
            {t("main.advancedSettings.action")}
          </Button>
        </Stack>

        <BottleActionBar
          bottle={bottle}
          onDownloadBottleLauncherInstaller={onDownloadBottleLauncherInstaller}
          onInstallBottleLauncher={onInstallBottleLauncher}
          onInstallBottleLauncherExecutable={onInstallBottleLauncherExecutable}
          onLaunchBottleApp={onLaunchBottleApp}
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
        onApplyRecipeChange={(patch, reportProgress) => onApplyBottleRecipe?.(bottle.id, patch, reportProgress)}
        onInstallWineVersion={onInstallWineVersion}
        onInstallDxmtVersion={onInstallDxmtVersion}
        onInstallJadeiteVersion={onInstallJadeiteVersion}
      />
      <Dialog
        open={isAdvancedSettingsOpen}
        title={t("main.advancedSettings.title")}
        description={t("main.advancedSettings.description")}
        icon={SlidersHorizontal}
        placement="center"
        widthClassName="max-w-2xl"
        onClose={() => {
          if (!isClearingDxmtCache) setIsAdvancedSettingsOpen(false);
        }}
        closeOnBackdrop={!isClearingDxmtCache}
        showCloseButton={!isClearingDxmtCache}
        actions={[
          {
            label: t("common.actions.close"),
            disabled: isClearingDxmtCache,
            onClick: () => setIsAdvancedSettingsOpen(false),
          },
          {
            label: isClearingDxmtCache ? t("main.advancedSettings.clearing") : t("main.advancedSettings.clearSelected"),
            icon: Trash2,
            variant: "danger",
            disabled: isBottleRunning || isClearingDxmtCache || selectedCachePrefixPaths.size === 0 || !onClearBottleDxmtShaderCaches,
            onClick: () => void clear_selected_dxmt_caches(),
          },
        ]}
      >
        <Stack className="gap-3">
          <Inline className="items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2">
            <Stack className="min-w-0 gap-1">
              <Text className="text-sm font-semibold text-slate-100">{t("main.advancedSettings.shaderCacheTitle")}</Text>
              <Text className="text-xs leading-5 text-slate-500">{t("main.advancedSettings.shaderCacheDescription")}</Text>
            </Stack>
            <Button type="button" variant="glass" size="sm" disabled={dxmtCachePrefixes.length === 0 || isClearingDxmtCache} onClick={toggle_all_cache_prefixes}>
              {areAllCachePrefixesSelected ? t("main.advancedSettings.clearSelection") : t("main.advancedSettings.selectAll")}
            </Button>
          </Inline>

          {isBottleRunning ? (
            <Text className="rounded-lg border border-amber-300/25 bg-amber-400/10 px-3 py-2 text-xs leading-5 text-amber-100">
              {t("main.advancedSettings.runningWarning")}
            </Text>
          ) : null}

          {dxmtCachePrefixes.length > 0 ? (
            <Stack className="max-h-72 gap-2 overflow-y-auto pr-1">
              {dxmtCachePrefixes.map((prefix) => (
                <Box
                  as="label"
                  key={prefix.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 transition ${
                    selectedCachePrefixPaths.has(prefix.path) ? "accent-selection" : "border-white/10 bg-[#0b1020]/70 hover:bg-white/[0.05]"
                  }`}
                >
                  <Input
                    type="checkbox"
                    checked={selectedCachePrefixPaths.has(prefix.path)}
                    disabled={isClearingDxmtCache}
                    className="accent-checkbox mt-1 h-4 w-4 shrink-0"
                    onChange={() => toggle_cache_prefix(prefix.path)}
                  />
                  <Stack className="min-w-0 gap-1">
                    <Text className="truncate text-sm font-semibold text-slate-100">{prefix.name}</Text>
                    <Text className="break-all font-mono text-[11px] leading-5 text-slate-500">{prefix.path}</Text>
                  </Stack>
                </Box>
              ))}
            </Stack>
          ) : (
            <Text className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-4 text-center text-xs text-slate-500">
              {t("main.advancedSettings.noPrefixes")}
            </Text>
          )}

          {dxmtCacheResult ? (
            <Text className={`rounded-lg border px-3 py-2 text-xs leading-5 ${
              dxmtCacheResult === "success" ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-100" : "border-red-300/25 bg-red-400/10 text-red-100"
            }`}>
              {t(dxmtCacheResult === "success" ? "main.advancedSettings.clearComplete" : "main.advancedSettings.clearFailed")}
            </Text>
          ) : null}
        </Stack>
      </Dialog>
    </Box>
  );
}

function bottle_dxmt_cache_prefixes(bottle: Bottle): BottlePrefixMetadataPayload[] {
  const prefixesByPath = new Map<string, BottlePrefixMetadataPayload>();
  const addPrefix = (prefixPath: string | undefined, name?: string, prefix?: BottlePrefixMetadataPayload) => {
    const trimmedPath = prefixPath?.trim();
    if (!trimmedPath) return;

    const normalizedPath = trimmedPath.replace(/[\\/]+$/g, "").toLowerCase();
    if (prefixesByPath.has(normalizedPath)) return;

    const fallbackName = trimmedPath.split(/[\\/]/).filter(Boolean).pop() || "Prefix";
    prefixesByPath.set(normalizedPath, prefix ?? {
      id: `dxmt-cache:${normalizedPath}`,
      name: name || fallbackName,
      path: trimmedPath,
      kind: "custom",
    });
  };

  bottle.prefixes?.forEach((prefix) => addPrefix(prefix.path, prefix.name, prefix));
  bottle.apps.forEach((app) => addPrefix(app.prefixPath, app.name));
  return [...prefixesByPath.values()].sort((left, right) => left.name.localeCompare(right.name));
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
  existingBottleNames = [],
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
  existingBottleNames?: string[];
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
  const hasDuplicateBottleName = form.name.trim().length > 0 && existingBottleNames.some(
    (existingName) => bottle_name_key(existingName) === bottle_name_key(form.name),
  );
  const canCreateBottle =
    form.name.trim().length > 0 &&
    !hasDuplicateBottleName &&
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

    const nextName = generate_bottle_name(existingBottleNames);
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
  }, [bottlePrefixPath, existingBottleNames, open, selectedDxmtVersionId, selectedJadeiteVersionId, selectedWineVersionId, selectableDxmtVersions, selectableJadeiteVersions, selectableWineVersions]);

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
    const nextName = generate_bottle_name(existingBottleNames);
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
              aria-invalid={hasDuplicateBottleName}
              aria-describedby={hasDuplicateBottleName ? "bottle-name-error" : undefined}
              className={`h-10 min-w-0 flex-1 rounded-lg border bg-[#0b1020] px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 ${
                hasDuplicateBottleName
                  ? "border-rose-400/80 ring-2 ring-rose-400/15 focus:border-rose-300"
                  : "border-white/10 focus:border-[rgb(var(--accent-rgb)/0.55)]"
              }`}
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
          {hasDuplicateBottleName ? (
            <Text id="bottle-name-error" className="text-xs font-medium text-rose-300">
              {t("main.createBottle.duplicateName")}
            </Text>
          ) : null}
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
