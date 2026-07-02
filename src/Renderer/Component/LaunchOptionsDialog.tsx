import React from "react";
import { Settings2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  BottleLaunchOptionPresetId,
  BottleLaunchOptionsPayload,
  InstalledBottleAppPayload,
} from "../../Common/Types/IPC";
import {
  filter_launch_options_by_manifest,
  is_launch_option_supported_by_manifest,
  launch_option_preset_label,
  launch_options_for_preset_selection,
  LAUNCH_OPTION_PRESET_IDS,
  normalize_launch_options,
  resolve_launch_options_for_app,
} from "../../Common/Util/LaunchOptions";
import type { WineLauncherOptionsManifest } from "../../Common/Types/Wine";
import type { Bottle } from "../Types/Bottle";
import { Dialog } from "./Dialog";
import { Box, Input, InlineText, Select, SelectMenuOption, Stack, Text } from "./Primitives";

type LaunchOptionSectionId = "general" | "dxmt" | "timing" | "network";

export interface LaunchOptionsDialogProps {
  open: boolean;
  bottle?: Bottle;
  initialAppId?: string;
  launcherOptionsManifest?: WineLauncherOptionsManifest;
  onClose: () => void;
  onSave?: (bottleId: string, appId: string, launchOptions: BottleLaunchOptionsPayload) => void;
}

export function LaunchOptionsDialog({
  open,
  bottle,
  initialAppId,
  launcherOptionsManifest,
  onClose,
  onSave,
}: LaunchOptionsDialogProps) {
  const { t } = useTranslation();
  const appOptions = React.useMemo<SelectMenuOption[]>(
    () => (bottle?.apps ?? []).map((app) => ({
      value: app.id,
      label: app.name,
      description: app.subtitle,
    })),
    [bottle?.apps],
  );
  const [selectedAppId, setSelectedAppId] = React.useState("");
  const selectedApp = bottle?.apps.find((app) => app.id === selectedAppId);
  const [draft, setDraft] = React.useState<BottleLaunchOptionsPayload>({ presetId: "auto" });
  const sectionRefs = React.useRef<Record<LaunchOptionSectionId, HTMLDivElement | null>>({
    general: null,
    dxmt: null,
    timing: null,
    network: null,
  });
  const launchOptionSections: Array<{ id: LaunchOptionSectionId; label: string }> = [
    { id: "general", label: t("main.launchOptions.general") },
    { id: "dxmt", label: t("main.launchOptions.dxmt") },
    { id: "timing", label: t("main.launchOptions.timing") },
    { id: "network", label: t("main.launchOptions.network") },
  ];

  React.useEffect(() => {
    if (open) {
      return;
    }

    setSelectedAppId("");
    setDraft({ presetId: "auto" });
  }, [open]);

  React.useEffect(() => {
    if (!open || !bottle) {
      return;
    }

    const nextAppId = initialAppId && bottle.apps.some((app) => app.id === initialAppId)
      ? initialAppId
      : bottle.apps[0]?.id ?? "";

    setSelectedAppId(nextAppId);
  }, [bottle, initialAppId, open]);

  React.useEffect(() => {
    if (!open || !selectedApp) {
      setDraft({ presetId: "auto" });
      return;
    }

    setDraft(normalize_dialog_launch_options(resolve_launch_options_for_app(selectedApp, selectedApp.launchOptions)));
  }, [launcherOptionsManifest, open, selectedApp]);

  function change_preset(presetId: string) {
    setDraft((currentDraft) =>
      normalize_dialog_launch_options(
        launch_options_for_preset_selection(
          selectedApp,
          presetId as BottleLaunchOptionPresetId,
          currentDraft,
        ) ?? { presetId: "auto" },
      ),
    );
  }

  function update_boolean(key: keyof BottleLaunchOptionsPayload, value: boolean) {
    if (!is_option_supported(key)) {
      return;
    }

    setDraft((currentDraft) => ({
      ...currentDraft,
      presetId: "custom",
      [key]: value,
    }));
  }

  function update_number(key: keyof BottleLaunchOptionsPayload, value: string) {
    if (!is_option_supported(key)) {
      return;
    }

    const trimmedValue = value.trim();
    const numberValue = Number(trimmedValue);

    setDraft((currentDraft) => ({
      ...currentDraft,
      presetId: "custom",
      [key]: trimmedValue.length > 0 && Number.isFinite(numberValue) ? numberValue : undefined,
    }));
  }

  function reset_to_auto() {
    setDraft(normalize_dialog_launch_options(resolve_launch_options_for_app(selectedApp, { presetId: "auto" })));
  }

  function register_section(sectionId: LaunchOptionSectionId) {
    return (element: HTMLDivElement | null) => {
      sectionRefs.current[sectionId] = element;
    };
  }

  function scroll_to_section(sectionId: LaunchOptionSectionId) {
    sectionRefs.current[sectionId]?.scrollIntoView({
      block: "start",
      behavior: "smooth",
    });
  }

  function close_dialog() {
    setSelectedAppId("");
    setDraft({ presetId: "auto" });
    onClose();
  }

  function save() {
    if (!bottle || !selectedApp) {
      return;
    }

    onSave?.(
      bottle.id,
      selectedApp.id,
      filter_launch_options_by_manifest(normalize_launch_options(draft), launcherOptionsManifest) ?? { presetId: "auto" },
    );
    close_dialog();
  }

  function normalize_dialog_launch_options(options?: BottleLaunchOptionsPayload): BottleLaunchOptionsPayload {
    return normalize_launch_options(options) ?? { presetId: "auto" };
  }

  function is_option_supported(key: keyof BottleLaunchOptionsPayload): boolean {
    return is_launch_option_supported_by_manifest(key, launcherOptionsManifest);
  }

  function option_support_attrs(key: keyof BottleLaunchOptionsPayload): {
    disabled: boolean;
    disabledReason?: string;
  } {
    const supported = is_option_supported(key);

    return {
      disabled: !supported,
      disabledReason: supported ? undefined : t("main.launchOptions.unsupportedByWine"),
    };
  }

  return (
    <Dialog
      open={open}
      title={t("main.launchOptions.title")}
      description={selectedApp
        ? t("main.launchOptions.description", { name: selectedApp.name })
        : t("main.launchOptions.emptyDescription")}
      tone="info"
      icon={Settings2}
      placement="center"
      widthClassName="max-w-4xl"
      onClose={close_dialog}
      actions={[
        {
          label: t("common.actions.reset"),
          variant: "secondary",
          disabled: !selectedApp,
          onClick: reset_to_auto,
        },
        {
          label: t("common.actions.cancel"),
          variant: "secondary",
          onClick: close_dialog,
        },
        {
          label: t("common.actions.save"),
          variant: "primary",
          disabled: !selectedApp,
          autoFocus: true,
          onClick: save,
        },
      ]}
    >
      {!bottle || bottle.apps.length === 0 ? (
        <Box className="rounded-lg border border-dashed border-white/10 px-4 py-6 text-center text-sm text-slate-500">
          {t("main.launchOptions.empty")}
        </Box>
      ) : (
        <Box className="flex h-[min(68dvh,42rem)] min-h-0 flex-col gap-4">
          <Box className="shrink-0 rounded-xl border border-white/10 bg-[#111a2f]/95 p-3 shadow-lg shadow-black/20">
            <Box className="grid gap-3 lg:grid-cols-2">
              <OptionField label={t("main.launchOptions.targetApp")}>
                <Select
                  value={selectedAppId}
                  options={appOptions}
                  onChange={setSelectedAppId}
                  searchPlaceholder={t("main.launchOptions.searchApps")}
                />
              </OptionField>

              <OptionField label={t("main.launchOptions.preset")}>
                <Select
                  value={draft.presetId ?? "auto"}
                  options={LAUNCH_OPTION_PRESET_IDS.map((presetId) => ({
                    value: presetId,
                    label: t(`main.launchOptions.presets.${presetId}`, launch_option_preset_label(presetId)),
                  }))}
                  onChange={change_preset}
                  searchPlaceholder={t("main.launchOptions.searchPresets")}
                />
              </OptionField>
            </Box>

            <Box className="mt-3 border-t border-white/10 pt-3">
              <InlineText className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {t("main.launchOptions.sections")}
              </InlineText>
              <Box className="mt-2 flex flex-wrap gap-2">
                {launchOptionSections.map((section) => (
                  <button
                    key={section.id}
                    type="button"
                    className="rounded-full border border-white/10 bg-white/[0.045] px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-sky-300/40 hover:bg-sky-400/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-sky-400/30"
                    onClick={() => scroll_to_section(section.id)}
                  >
                    {section.label}
                  </button>
                ))}
              </Box>
            </Box>
          </Box>

          <Box className="min-h-0 flex-1 overflow-y-auto pr-1">
            <Stack className="gap-4 pb-1">
              <OptionSection title={t("main.launchOptions.general")} sectionRef={register_section("general")}>
                <OptionCheckbox label={t("main.launchOptions.enableMsync")} description={t("main.launchOptions.descriptions.enableMsync")} checked={draft.enableMsync} onChange={(checked) => update_boolean("enableMsync", checked)} {...option_support_attrs("enableMsync")} />
                <OptionCheckbox label={t("main.launchOptions.steamWebHelperArgs")} description={t("main.launchOptions.descriptions.steamWebHelperArgs")} checked={draft.steamWebHelperArgs} onChange={(checked) => update_boolean("steamWebHelperArgs", checked)} {...option_support_attrs("steamWebHelperArgs")} />
                <OptionCheckbox label={t("main.launchOptions.hoyoplayInProcessGpu")} description={t("main.launchOptions.descriptions.hoyoplayInProcessGpu")} checked={draft.hoyoplayInProcessGpu} onChange={(checked) => update_boolean("hoyoplayInProcessGpu", checked)} {...option_support_attrs("hoyoplayInProcessGpu")} />
                <OptionCheckbox label={t("main.launchOptions.enableTimeoutFix")} description={t("main.launchOptions.descriptions.enableTimeoutFix")} checked={draft.enableTimeoutFix} onChange={(checked) => update_boolean("enableTimeoutFix", checked)} {...option_support_attrs("enableTimeoutFix")} />
                <OptionCheckbox label={t("main.launchOptions.leftCommandIsCtrl")} description={t("main.launchOptions.descriptions.leftCommandIsCtrl")} checked={draft.leftCommandIsCtrl} onChange={(checked) => update_boolean("leftCommandIsCtrl", checked)} {...option_support_attrs("leftCommandIsCtrl")} />
                <OptionCheckbox label={t("main.launchOptions.retinaMode")} description={t("main.launchOptions.descriptions.retinaMode")} checked={draft.retinaMode} onChange={(checked) => update_boolean("retinaMode", checked)} {...option_support_attrs("retinaMode")} />
                <OptionCheckbox label={t("main.launchOptions.metalHud")} description={t("main.launchOptions.descriptions.metalHud")} checked={draft.metalHud} onChange={(checked) => update_boolean("metalHud", checked)} {...option_support_attrs("metalHud")} />
              </OptionSection>

              <OptionSection title={t("main.launchOptions.dxmt")} sectionRef={register_section("dxmt")}>
                <NumberField
                  label={t("main.launchOptions.dxmtPreferredMaxFrameRate")}
                  description={t("main.launchOptions.descriptions.dxmtPreferredMaxFrameRate")}
                  value={draft.dxmtPreferredMaxFrameRate}
                  min={0}
                  max={1000}
                  step={1}
                  onChange={(value) => update_number("dxmtPreferredMaxFrameRate", value)}
                  {...option_support_attrs("dxmtPreferredMaxFrameRate")}
                />
                <OptionCheckbox
                  label={t("main.launchOptions.dxmtMetalFxSpatialUpscale")}
                  description={t("main.launchOptions.descriptions.dxmtMetalFxSpatialUpscale")}
                  checked={draft.dxmtMetalFxSpatialUpscale}
                  onChange={(checked) => update_boolean("dxmtMetalFxSpatialUpscale", checked)}
                  {...option_support_attrs("dxmtMetalFxSpatialUpscale")}
                />
                <NumberField
                  label={t("main.launchOptions.dxmtMetalFxSpatialUpscaleFactor")}
                  description={t("main.launchOptions.descriptions.dxmtMetalFxSpatialUpscaleFactor")}
                  value={draft.dxmtMetalFxSpatialUpscaleFactor}
                  min={1}
                  max={4}
                  step={0.1}
                  onChange={(value) => update_number("dxmtMetalFxSpatialUpscaleFactor", value)}
                  {...option_support_attrs("dxmtMetalFxSpatialUpscaleFactor")}
                />
              </OptionSection>

              <OptionSection title={t("main.launchOptions.timing")} sectionRef={register_section("timing")}>
                <NumberField
                  label={t("main.launchOptions.earlyExitWaitMs")}
                  description={t("main.launchOptions.descriptions.earlyExitWaitMs")}
                  value={draft.earlyExitWaitMs}
                  min={0}
                  max={60000}
                  step={100}
                  onChange={(value) => update_number("earlyExitWaitMs", value)}
                  {...option_support_attrs("earlyExitWaitMs")}
                />
                <NumberField
                  label={t("main.launchOptions.superviseWaitSeconds")}
                  description={t("main.launchOptions.descriptions.superviseWaitSeconds")}
                  value={draft.superviseWaitSeconds}
                  min={0}
                  max={3600}
                  step={1}
                  onChange={(value) => update_number("superviseWaitSeconds", value)}
                  {...option_support_attrs("superviseWaitSeconds")}
                />
              </OptionSection>

              <OptionSection title={t("main.launchOptions.network")} sectionRef={register_section("network")}>
                <OptionCheckbox label={t("main.launchOptions.networkGate")} description={t("main.launchOptions.descriptions.networkGate")} checked={draft.networkGate} onChange={(checked) => update_boolean("networkGate", checked)} {...option_support_attrs("networkGate")} />
                <NumberField
                  label={t("main.launchOptions.networkGateSeconds")}
                  description={t("main.launchOptions.descriptions.networkGateSeconds")}
                  value={draft.networkGateSeconds}
                  min={0}
                  max={120}
                  step={1}
                  onChange={(value) => update_number("networkGateSeconds", value)}
                  {...option_support_attrs("networkGateSeconds")}
                />
                <OptionCheckbox label={t("main.launchOptions.waitForManualNetworkCut")} description={t("main.launchOptions.descriptions.waitForManualNetworkCut")} checked={draft.waitForManualNetworkCut} onChange={(checked) => update_boolean("waitForManualNetworkCut", checked)} {...option_support_attrs("waitForManualNetworkCut")} />
                <OptionCheckbox label={t("main.launchOptions.autoNetworkCut")} description={t("main.launchOptions.descriptions.autoNetworkCut")} checked={draft.autoNetworkCut} onChange={(checked) => update_boolean("autoNetworkCut", checked)} {...option_support_attrs("autoNetworkCut")} />
                <NumberField
                  label={t("main.launchOptions.autoNetworkReconnectSeconds")}
                  description={t("main.launchOptions.descriptions.autoNetworkReconnectSeconds")}
                  value={draft.autoNetworkReconnectSeconds}
                  min={0}
                  max={600}
                  step={1}
                  onChange={(value) => update_number("autoNetworkReconnectSeconds", value)}
                  {...option_support_attrs("autoNetworkReconnectSeconds")}
                />
                <OptionCheckbox label={t("main.launchOptions.allowDuplicateGame")} description={t("main.launchOptions.descriptions.allowDuplicateGame")} checked={draft.allowDuplicateGame} onChange={(checked) => update_boolean("allowDuplicateGame", checked)} {...option_support_attrs("allowDuplicateGame")} />
              </OptionSection>
            </Stack>
          </Box>
        </Box>
      )}
    </Dialog>
  );
}

function OptionSection({
  title,
  children,
  sectionRef,
}: {
  title: string;
  children: React.ReactNode;
  sectionRef?: (element: HTMLDivElement | null) => void;
}) {
  return (
    <div ref={sectionRef} className="scroll-mt-3 rounded-lg border border-white/10 bg-[#0b1020]/70 p-3">
      <Text className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </Text>
      <Box className="grid gap-2">
        {children}
      </Box>
    </div>
  );
}

function OptionField({
  label,
  description,
  disabled = false,
  disabledReason,
  children,
}: {
  label: string;
  description?: string;
  disabled?: boolean;
  disabledReason?: string;
  children: React.ReactNode;
}) {
  return (
    <Box className={`grid min-h-14 gap-3 rounded-md border border-white/10 bg-white/[0.035] px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(13rem,18rem)] sm:items-center ${
      disabled ? "opacity-45 grayscale" : ""
    }`}>
      <Box className="min-w-0">
        <InlineText className="block text-sm font-medium leading-5 text-slate-200">
          {label}
        </InlineText>
        {description ? (
          <Text className="mt-1 text-[11px] leading-4 text-slate-500">{description}</Text>
        ) : null}
        {disabledReason ? (
          <Text className="mt-1 text-[11px] leading-4 text-slate-500">{disabledReason}</Text>
        ) : null}
      </Box>
      <Box className="min-w-0">
        {children}
      </Box>
    </Box>
  );
}

function OptionCheckbox({
  label,
  description,
  checked,
  disabled = false,
  disabledReason,
  onChange,
}: {
  label: string;
  description?: string;
  checked?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Box
      as="label"
      className={`grid min-h-14 gap-3 rounded-md border border-white/10 bg-white/[0.035] px-3 py-2.5 transition sm:grid-cols-[minmax(0,1fr)_minmax(5rem,8rem)] sm:items-center ${
        disabled
          ? "cursor-not-allowed opacity-45 grayscale"
          : "cursor-pointer hover:border-white/20 hover:bg-white/[0.055]"
      }`}
    >
      <Box className="min-w-0">
        <InlineText className="block text-sm font-medium leading-5 text-slate-200">
          {label}
        </InlineText>
        {description ? (
          <Text className="mt-1 text-[11px] leading-4 text-slate-500">{description}</Text>
        ) : null}
        {disabledReason ? (
          <Text className="mt-1 text-[11px] leading-4 text-slate-500">{disabledReason}</Text>
        ) : null}
      </Box>
      <Box className="flex h-10 items-center justify-start sm:justify-end">
        <input
          type="checkbox"
          checked={Boolean(checked)}
          disabled={disabled}
          className="accent-checkbox h-4 w-4"
          onChange={(event) => onChange(event.target.checked)}
        />
      </Box>
    </Box>
  );
}

function NumberField({
  label,
  description,
  value,
  min,
  max,
  step,
  disabled = false,
  disabledReason,
  onChange,
}: {
  label: string;
  description?: string;
  value?: number;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  disabledReason?: string;
  onChange: (value: string) => void;
}) {
  return (
    <OptionField label={label} description={description} disabled={disabled} disabledReason={disabledReason}>
      <Input
        type="number"
        value={value ?? ""}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        className="h-11 w-full rounded-lg border border-white/10 bg-[#0b1020] px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-[rgb(var(--accent-rgb)/0.55)]"
        onChange={(event) => onChange(event.target.value)}
      />
    </OptionField>
  );
}
