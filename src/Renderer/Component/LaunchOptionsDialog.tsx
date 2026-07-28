import React from "react";
import { Plus, Settings2, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  BottleEnvironmentVariablePayload,
  BottleLaunchOptionPresetId,
  BottleLaunchOptionsPayload,
  DxmtGpuPresetId,
  InstalledBottleAppPayload,
} from "../../Common/Types/IPC";
import {
  DXMT_GPU_IDENTITY_PRESETS,
  get_dxmt_gpu_identity_preset,
} from "../../Common/Constant/DxmtGpuPresets";
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
import type { RuntimeLaunchOptionKey } from "../../Common/Types/DataProtoType";
import {
  launch_option_keys_for_app,
  resolve_app_runtime_profile,
} from "../../Main/Data/GameProfile";
import type { Bottle } from "../Types/Bottle";
import { Dialog } from "./Dialog";
import { Box, Button, Input, Inline, InlineText, Select, SelectMenuOption, Stack, Text } from "./Primitives";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog";

type LaunchOptionSectionId = "general" | "dxmt" | "timing" | "network" | "directInput";
type LaunchOptionSectionKey = RuntimeLaunchOptionKey | "environmentVariables";

const SECTION_OPTION_KEYS: Record<LaunchOptionSectionId, readonly LaunchOptionSectionKey[]> = {
  general: [
    "enableMsync",
    "steamWebHelperArgs",
    "hoyoplayInProcessGpu",
    "enableTimeoutFix",
    "leftCommandIsCtrl",
    "retinaMode",
    "metalHud",
  ],
  dxmt: [
    "dxmtPreferredMaxFrameRate",
    "dxmtGpuPreset",
    "dxmtGpuVendorId",
    "dxmtGpuDeviceId",
    "dxmtEnableNvExt",
    "dxmtMetalFxSpatialUpscale",
    "dxmtMetalFxSpatialUpscaleFactor",
  ],
  timing: ["earlyExitWaitMs", "superviseWaitSeconds"],
  network: [
    "networkGate",
    "networkGateSeconds",
    "waitForManualNetworkCut",
    "autoNetworkCut",
    "autoNetworkReconnectSeconds",
    "allowDuplicateGame",
  ],
  directInput: ["environmentVariables"],
};

export interface LaunchOptionsDialogProps {
  open: boolean;
  bottle?: Bottle;
  initialAppId?: string;
  launcherOptionsManifest?: WineLauncherOptionsManifest;
  onClose: () => void;
  onSave?: (
    bottleId: string,
    appId: string,
    launchOptions: BottleLaunchOptionsPayload,
  ) => Promise<void> | void;
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
  const [savedDraft, setSavedDraft] = React.useState<BottleLaunchOptionsPayload>({ presetId: "auto" });
  const [activeSection, setActiveSection] = React.useState<LaunchOptionSectionId>("general");
  const [isUnsavedDialogOpen, setIsUnsavedDialogOpen] = React.useState(false);
  const [pendingAppId, setPendingAppId] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string>();
  const runtimeProfile = React.useMemo(() => resolve_app_runtime_profile(selectedApp), [selectedApp]);
  const allowedOptionKeys = React.useMemo(
    () => new Set<RuntimeLaunchOptionKey>(launch_option_keys_for_app(selectedApp)),
    [selectedApp],
  );
  const hasUnsavedChanges = !launch_options_equal(draft, savedDraft);
  const launchOptionSections: Array<{ id: LaunchOptionSectionId; label: string }> = [
    { id: "general", label: t("main.launchOptions.general") },
    { id: "dxmt", label: t("main.launchOptions.dxmt") },
    { id: "timing", label: t("main.launchOptions.timing") },
    { id: "network", label: t("main.launchOptions.network") },
    { id: "directInput", label: t("main.launchOptions.directInput") },
  ];
  const visibleSections = launchOptionSections.filter((section) =>
    section.id === "directInput" || section.id === "dxmt" || SECTION_OPTION_KEYS[section.id].some(
      (key) =>
        allowedOptionKeys.has(key as RuntimeLaunchOptionKey) &&
        is_launch_option_supported_by_manifest(key, launcherOptionsManifest),
    ),
  );
  const visibleSectionKey = visibleSections.map((section) => section.id).join("|");
  const profilePresetId = runtimeProfile && LAUNCH_OPTION_PRESET_IDS.includes(runtimeProfile.id as BottleLaunchOptionPresetId)
    ? runtimeProfile.id as BottleLaunchOptionPresetId
    : undefined;
  const availablePresetIds = LAUNCH_OPTION_PRESET_IDS.filter((presetId) =>
    presetId === "auto" || presetId === "custom" || presetId === profilePresetId,
  );

  React.useEffect(() => {
    if (open) {
      return;
    }

    setSelectedAppId("");
    setDraft({ presetId: "auto" });
    setSavedDraft({ presetId: "auto" });
    setActiveSection("general");
    setIsUnsavedDialogOpen(false);
    setPendingAppId(null);
    setIsSaving(false);
    setSaveError(undefined);
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

    const nextDraft = normalize_dialog_launch_options(resolve_launch_options_for_app(selectedApp, selectedApp.launchOptions));

    setDraft(nextDraft);
    setSavedDraft(nextDraft);
    setActiveSection("general");
  }, [launcherOptionsManifest, open, selectedApp]);

  React.useEffect(() => {
    if (!visibleSections.some((section) => section.id === activeSection)) {
      setActiveSection(visibleSections[0]?.id ?? "general");
    }
  }, [activeSection, visibleSectionKey]);

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

  function update_dxmt_gpu_preset(value: string) {
    if (!is_option_supported("dxmtGpuPreset")) {
      return;
    }

    setDraft((currentDraft) => {
      if (value === "none") {
        return {
          ...currentDraft,
          presetId: "custom",
          dxmtGpuPreset: undefined,
          dxmtGpuVendorId: undefined,
          dxmtGpuDeviceId: undefined,
        };
      }

      if (value === "custom") {
        return {
          ...currentDraft,
          presetId: "custom",
          dxmtGpuPreset: "custom",
        };
      }

      const gpuPreset = get_dxmt_gpu_identity_preset(value);

      if (!gpuPreset) {
        return currentDraft;
      }

      return {
        ...currentDraft,
        presetId: "custom",
        dxmtGpuPreset: gpuPreset.id,
        dxmtGpuVendorId: gpuPreset.vendorId,
        dxmtGpuDeviceId: gpuPreset.deviceId,
      };
    });
  }

  function update_dxmt_gpu_custom_id(
    key: "dxmtGpuVendorId" | "dxmtGpuDeviceId",
    value: string,
  ) {
    if (!is_option_supported(key)) {
      return;
    }

    setDraft((currentDraft) => ({
      ...currentDraft,
      presetId: "custom",
      dxmtGpuPreset: "custom",
      [key]: value.toLowerCase(),
    }));
  }

  function add_environment_variable() {
    setDraft((currentDraft) => ({
      ...currentDraft,
      presetId: "custom",
      environmentVariables: [
        ...(currentDraft.environmentVariables ?? []),
        { name: "", value: "" },
      ],
    }));
  }

  function update_environment_variable(
    index: number,
    field: keyof BottleEnvironmentVariablePayload,
    value: string,
  ) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      presetId: "custom",
      environmentVariables: (currentDraft.environmentVariables ?? []).map((variable, variableIndex) =>
        variableIndex === index ? { ...variable, [field]: value } : variable,
      ),
    }));
  }

  function remove_environment_variable(index: number) {
    setDraft((currentDraft) => {
      const environmentVariables = (currentDraft.environmentVariables ?? []).filter(
        (_variable, variableIndex) => variableIndex !== index,
      );

      return {
        ...currentDraft,
        presetId: "custom",
        environmentVariables: environmentVariables.length > 0 ? environmentVariables : undefined,
      };
    });
  }

  function reset_to_auto() {
    setDraft(normalize_dialog_launch_options(resolve_launch_options_for_app(selectedApp, { presetId: "auto" })));
  }

  function close_dialog() {
    setIsUnsavedDialogOpen(false);
    setPendingAppId(null);
    setSelectedAppId("");
    setDraft({ presetId: "auto" });
    setSavedDraft({ presetId: "auto" });
    onClose();
  }

  async function save_current_draft(): Promise<boolean> {
    if (!bottle || !selectedApp || isSaving) {
      return false;
    }

    const nextDraft = filter_launch_options_by_allowed_keys(
      filter_launch_options_by_manifest(normalize_launch_options(draft), launcherOptionsManifest) ?? { presetId: "auto" },
      allowedOptionKeys,
    );

    setIsSaving(true);
    setSaveError(undefined);

    try {
      await onSave?.(
        bottle.id,
        selectedApp.id,
        nextDraft,
      );
      setDraft(nextDraft);
      setSavedDraft(nextDraft);
      return true;
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  async function save() {
    if (!await save_current_draft()) {
      return;
    }

    close_dialog();
  }

  function request_close() {
    if (isSaving) {
      return;
    }

    setPendingAppId(null);

    if (hasUnsavedChanges) {
      setIsUnsavedDialogOpen(true);
      return;
    }

    close_dialog();
  }

  function request_app_change(nextAppId: string) {
    if (nextAppId === selectedAppId || isSaving) {
      return;
    }

    if (hasUnsavedChanges) {
      setPendingAppId(nextAppId);
      setIsUnsavedDialogOpen(true);
      return;
    }

    setSelectedAppId(nextAppId);
  }

  function finish_pending_navigation() {
    const nextAppId = pendingAppId;

    setIsUnsavedDialogOpen(false);
    setPendingAppId(null);

    if (nextAppId) {
      setSelectedAppId(nextAppId);
      return;
    }

    close_dialog();
  }

  async function save_and_navigate() {
    if (await save_current_draft()) {
      finish_pending_navigation();
      return;
    }

    setIsUnsavedDialogOpen(false);
  }

  function normalize_dialog_launch_options(options?: BottleLaunchOptionsPayload): BottleLaunchOptionsPayload {
    return normalize_launch_options(options) ?? { presetId: "auto" };
  }

  function is_option_supported(key: keyof BottleLaunchOptionsPayload): boolean {
    return is_launch_option_supported_by_manifest(key, launcherOptionsManifest);
  }

  function is_option_allowed(key: RuntimeLaunchOptionKey): boolean {
    return allowedOptionKeys.has(key) && is_option_supported(key);
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
    <>
    <Dialog
      open={open && !isUnsavedDialogOpen}
      title={t("main.launchOptions.title")}
      description={selectedApp
        ? t("main.launchOptions.description", { name: selectedApp.name })
        : t("main.launchOptions.emptyDescription")}
      tone="info"
      icon={Settings2}
      placement="center"
      widthClassName="max-w-4xl"
      onClose={request_close}
      actions={[
        {
          label: t("common.actions.reset"),
          variant: "secondary",
          disabled: !selectedApp || isSaving,
          onClick: reset_to_auto,
        },
        {
          label: t("common.actions.cancel"),
          variant: "secondary",
          disabled: isSaving,
          onClick: request_close,
        },
        {
          label: t("common.actions.save"),
          variant: "primary",
          disabled:
            isSaving
            || !selectedApp
            || !environment_variables_are_valid(draft.environmentVariables)
            || !dxmt_gpu_identity_is_valid(draft),
          autoFocus: true,
          onClick: () => void save(),
        },
      ]}
    >
      {saveError ? (
        <Text className="mb-3 select-text rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-2 text-xs leading-5 text-red-200">
          {t("main.launchOptions.saveError", { error: saveError })}
        </Text>
      ) : null}
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
                  onChange={request_app_change}
                  searchPlaceholder={t("main.launchOptions.searchApps")}
                />
              </OptionField>

              <OptionField label={t("main.launchOptions.preset")}>
                <Select
                  value={draft.presetId ?? "auto"}
                  options={availablePresetIds.map((presetId) => ({
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
              <Box className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                {visibleSections.map((section) => {
                  const isActive = activeSection === section.id;

                  return (
                  <button
                    key={section.id}
                    type="button"
                    className={`rounded-lg border px-3 py-2.5 text-left transition focus:outline-none focus:ring-2 focus:ring-sky-400/30 ${
                      isActive
                        ? "accent-selection"
                        : "border-white/10 bg-white/[0.035] text-slate-400 hover:bg-white/[0.07] hover:text-white"
                    }`}
                    onClick={() => setActiveSection(section.id)}
                  >
                    <InlineText className="block text-xs font-semibold">{section.label}</InlineText>
                    <InlineText className="mt-1 block text-[11px] leading-4 text-slate-500">
                      {t(`main.launchOptions.sectionDescriptions.${section.id}`)}
                    </InlineText>
                  </button>
                  );
                })}
              </Box>
            </Box>
          </Box>

          <Box className="min-h-0 flex-1 overflow-y-auto pr-1">
            <Stack className="gap-4 pb-1">
              {activeSection === "general" ? (
              <OptionSection title={t("main.launchOptions.general")}>
                {is_option_allowed("enableMsync") ? <OptionCheckbox label={t("main.launchOptions.enableMsync")} description={t("main.launchOptions.descriptions.enableMsync")} checked={draft.enableMsync} onChange={(checked) => update_boolean("enableMsync", checked)} {...option_support_attrs("enableMsync")} /> : null}
                {is_option_allowed("steamWebHelperArgs") ? <OptionCheckbox label={t("main.launchOptions.steamWebHelperArgs")} description={t("main.launchOptions.descriptions.steamWebHelperArgs")} checked={draft.steamWebHelperArgs} onChange={(checked) => update_boolean("steamWebHelperArgs", checked)} {...option_support_attrs("steamWebHelperArgs")} /> : null}
                {is_option_allowed("hoyoplayInProcessGpu") ? <OptionCheckbox label={t("main.launchOptions.hoyoplayInProcessGpu")} description={t("main.launchOptions.descriptions.hoyoplayInProcessGpu")} checked={draft.hoyoplayInProcessGpu} onChange={(checked) => update_boolean("hoyoplayInProcessGpu", checked)} {...option_support_attrs("hoyoplayInProcessGpu")} /> : null}
                {is_option_allowed("enableTimeoutFix") ? <OptionCheckbox label={t("main.launchOptions.enableTimeoutFix")} description={t("main.launchOptions.descriptions.enableTimeoutFix")} checked={draft.enableTimeoutFix} onChange={(checked) => update_boolean("enableTimeoutFix", checked)} {...option_support_attrs("enableTimeoutFix")} /> : null}
                {is_option_allowed("leftCommandIsCtrl") ? <OptionCheckbox label={t("main.launchOptions.leftCommandIsCtrl")} description={t("main.launchOptions.descriptions.leftCommandIsCtrl")} checked={draft.leftCommandIsCtrl} onChange={(checked) => update_boolean("leftCommandIsCtrl", checked)} {...option_support_attrs("leftCommandIsCtrl")} /> : null}
                {is_option_allowed("retinaMode") ? <OptionCheckbox label={t("main.launchOptions.retinaMode")} description={t("main.launchOptions.descriptions.retinaMode")} checked={draft.retinaMode} onChange={(checked) => update_boolean("retinaMode", checked)} {...option_support_attrs("retinaMode")} /> : null}
                {is_option_allowed("metalHud") ? <OptionCheckbox label={t("main.launchOptions.metalHud")} description={t("main.launchOptions.descriptions.metalHud")} checked={draft.metalHud} onChange={(checked) => update_boolean("metalHud", checked)} {...option_support_attrs("metalHud")} /> : null}
              </OptionSection>
              ) : null}

              {activeSection === "dxmt" ? (
              <OptionSection title={t("main.launchOptions.dxmt")}>
                {allowedOptionKeys.has("dxmtPreferredMaxFrameRate") ? (
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
                ) : null}
                {allowedOptionKeys.has("dxmtGpuPreset") ? (
                <DxmtGpuIdentityField
                  presetId={draft.dxmtGpuPreset}
                  vendorId={draft.dxmtGpuVendorId}
                  deviceId={draft.dxmtGpuDeviceId}
                  onPresetChange={update_dxmt_gpu_preset}
                  onVendorIdChange={(value) => update_dxmt_gpu_custom_id("dxmtGpuVendorId", value)}
                  onDeviceIdChange={(value) => update_dxmt_gpu_custom_id("dxmtGpuDeviceId", value)}
                  {...option_support_attrs("dxmtGpuVendorId")}
                />
                ) : null}
                {allowedOptionKeys.has("dxmtEnableNvExt") ? (
                <OptionCheckbox
                  label={t("main.launchOptions.dxmtEnableNvExt")}
                  description={t("main.launchOptions.descriptions.dxmtEnableNvExt")}
                  checked={draft.dxmtEnableNvExt}
                  onChange={(checked) => update_boolean("dxmtEnableNvExt", checked)}
                  {...option_support_attrs("dxmtEnableNvExt")}
                />
                ) : null}
                {allowedOptionKeys.has("dxmtMetalFxSpatialUpscale") ? (
                <OptionCheckbox
                  label={t("main.launchOptions.dxmtMetalFxSpatialUpscale")}
                  description={t("main.launchOptions.descriptions.dxmtMetalFxSpatialUpscale")}
                  checked={draft.dxmtMetalFxSpatialUpscale}
                  onChange={(checked) => update_boolean("dxmtMetalFxSpatialUpscale", checked)}
                  {...option_support_attrs("dxmtMetalFxSpatialUpscale")}
                />
                ) : null}
                {allowedOptionKeys.has("dxmtMetalFxSpatialUpscaleFactor") ? (
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
                ) : null}
              </OptionSection>
              ) : null}

              {activeSection === "timing" ? (
              <OptionSection title={t("main.launchOptions.timing")}>
                {is_option_allowed("earlyExitWaitMs") ? (
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
                ) : null}
                {is_option_allowed("superviseWaitSeconds") ? (
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
                ) : null}
              </OptionSection>
              ) : null}

              {activeSection === "network" ? (
              <OptionSection title={t("main.launchOptions.network")}>
                {is_option_allowed("networkGate") ? <OptionCheckbox label={t("main.launchOptions.networkGate")} description={t("main.launchOptions.descriptions.networkGate")} checked={draft.networkGate} onChange={(checked) => update_boolean("networkGate", checked)} {...option_support_attrs("networkGate")} /> : null}
                {is_option_allowed("networkGateSeconds") ? (
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
                ) : null}
                {is_option_allowed("waitForManualNetworkCut") ? <OptionCheckbox label={t("main.launchOptions.waitForManualNetworkCut")} description={t("main.launchOptions.descriptions.waitForManualNetworkCut")} checked={draft.waitForManualNetworkCut} onChange={(checked) => update_boolean("waitForManualNetworkCut", checked)} {...option_support_attrs("waitForManualNetworkCut")} /> : null}
                {is_option_allowed("autoNetworkCut") ? <OptionCheckbox label={t("main.launchOptions.autoNetworkCut")} description={t("main.launchOptions.descriptions.autoNetworkCut")} checked={draft.autoNetworkCut} onChange={(checked) => update_boolean("autoNetworkCut", checked)} {...option_support_attrs("autoNetworkCut")} /> : null}
                {is_option_allowed("autoNetworkReconnectSeconds") ? (
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
                ) : null}
                {is_option_allowed("allowDuplicateGame") ? <OptionCheckbox label={t("main.launchOptions.allowDuplicateGame")} description={t("main.launchOptions.descriptions.allowDuplicateGame")} checked={draft.allowDuplicateGame} onChange={(checked) => update_boolean("allowDuplicateGame", checked)} {...option_support_attrs("allowDuplicateGame")} /> : null}
              </OptionSection>
              ) : null}

              {activeSection === "directInput" ? (
              <OptionSection title={t("main.launchOptions.directInput")}>
                <EnvironmentVariableEditor
                  variables={draft.environmentVariables ?? []}
                  onAdd={add_environment_variable}
                  onChange={update_environment_variable}
                  onRemove={remove_environment_variable}
                />
              </OptionSection>
              ) : null}
            </Stack>
          </Box>
        </Box>
      )}
    </Dialog>
    <UnsavedChangesDialog
      open={open && isUnsavedDialogOpen}
      onContinueEditing={() => {
        setIsUnsavedDialogOpen(false);
        setPendingAppId(null);
      }}
      onDiscard={finish_pending_navigation}
      onSave={() => void save_and_navigate()}
      disabled={isSaving}
    />
    </>
  );
}

function OptionSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#0b1020]/70 p-3">
      <Text className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </Text>
      <Box className="grid gap-2">
        {children}
      </Box>
    </div>
  );
}

function launch_options_equal(
  left?: BottleLaunchOptionsPayload,
  right?: BottleLaunchOptionsPayload,
): boolean {
  return JSON.stringify(normalize_launch_options(left) ?? {})
    === JSON.stringify(normalize_launch_options(right) ?? {});
}

function filter_launch_options_by_allowed_keys(
  options: BottleLaunchOptionsPayload,
  allowedKeys: ReadonlySet<RuntimeLaunchOptionKey>,
): BottleLaunchOptionsPayload {
  const filtered = { ...options };

  for (const key of Object.keys(filtered) as Array<keyof BottleLaunchOptionsPayload>) {
    if (key !== "presetId" && key !== "environmentVariables" && !allowedKeys.has(key as RuntimeLaunchOptionKey)) {
      delete filtered[key];
    }
  }

  return filtered;
}

function EnvironmentVariableEditor({
  variables,
  onAdd,
  onChange,
  onRemove,
}: {
  variables: BottleEnvironmentVariablePayload[];
  onAdd: () => void;
  onChange: (index: number, field: keyof BottleEnvironmentVariablePayload, value: string) => void;
  onRemove: (index: number) => void;
}) {
  const { t } = useTranslation();
  const isValid = environment_variables_are_valid(variables);

  return (
    <Stack className="gap-2">
      <Text className="text-xs leading-5 text-slate-500">
        {t("main.launchOptions.environmentVariablesDescription")}
      </Text>
      {variables.length === 0 ? (
        <Text className="rounded-lg border border-dashed border-white/10 px-3 py-5 text-center text-xs text-slate-500">
          {t("main.launchOptions.environmentVariablesEmpty")}
        </Text>
      ) : null}
      {variables.map((variable, index) => (
        <Box
          key={index}
          className="grid gap-2 rounded-lg border border-white/10 bg-white/[0.035] p-2 sm:grid-cols-[minmax(10rem,0.8fr)_minmax(12rem,1.2fr)_2.5rem]"
        >
          <Input
            value={variable.name}
            placeholder={t("main.launchOptions.environmentVariableName")}
            aria-label={t("main.launchOptions.environmentVariableName")}
            spellCheck={false}
            className="h-10 w-full rounded-lg border border-white/10 bg-[#0b1020] px-3 font-mono text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-[rgb(var(--accent-rgb)/0.55)]"
            onChange={(event) => onChange(index, "name", event.target.value)}
          />
          <Input
            value={variable.value}
            placeholder={t("main.launchOptions.environmentVariableValue")}
            aria-label={t("main.launchOptions.environmentVariableValue")}
            spellCheck={false}
            className="h-10 w-full rounded-lg border border-white/10 bg-[#0b1020] px-3 font-mono text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-[rgb(var(--accent-rgb)/0.55)]"
            onChange={(event) => onChange(index, "value", event.target.value)}
          />
          <Button
            type="button"
            variant="ghost"
            size="md"
            className="h-10 w-10 justify-center text-rose-300 hover:bg-rose-500/10 hover:text-rose-200"
            title={t("main.launchOptions.removeEnvironmentVariable")}
            onClick={() => onRemove(index)}
          >
            <Trash2 size={15} />
          </Button>
        </Box>
      ))}
      {!isValid ? (
        <Text className="text-xs leading-5 text-rose-300">
          {t("main.launchOptions.environmentVariableInvalid")}
        </Text>
      ) : null}
      <Inline>
        <Button type="button" variant="glass" size="sm" icon={<Plus size={14} />} onClick={onAdd}>
          {t("main.launchOptions.addEnvironmentVariable")}
        </Button>
      </Inline>
    </Stack>
  );
}

function environment_variables_are_valid(variables?: BottleEnvironmentVariablePayload[]): boolean {
  if (!variables || variables.length === 0) {
    return true;
  }

  const names = new Set<string>();

  return variables.every((variable) => {
    const name = variable.name.trim();
    const isValid = /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !names.has(name);

    names.add(name);
    return isValid;
  });
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

function DxmtGpuIdentityField({
  presetId,
  vendorId,
  deviceId,
  disabled = false,
  disabledReason,
  onPresetChange,
  onVendorIdChange,
  onDeviceIdChange,
}: {
  presetId?: DxmtGpuPresetId;
  vendorId?: string;
  deviceId?: string;
  disabled?: boolean;
  disabledReason?: string;
  onPresetChange: (value: string) => void;
  onVendorIdChange: (value: string) => void;
  onDeviceIdChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const isCustom = presetId === "custom" || (!presetId && Boolean(vendorId || deviceId));
  const selectedValue = isCustom ? "custom" : presetId ?? "none";
  const isValid = dxmt_gpu_identity_is_valid({
    dxmtGpuPreset: isCustom ? "custom" : presetId,
    dxmtGpuVendorId: vendorId,
    dxmtGpuDeviceId: deviceId,
  });
  const options: SelectMenuOption[] = [
    {
      value: "none",
      label: t("main.launchOptions.dxmtGpuIdentityNone"),
      description: t("main.launchOptions.dxmtGpuIdentityNoneDescription"),
    },
    ...DXMT_GPU_IDENTITY_PRESETS.map((preset) => ({
      value: preset.id,
      label: preset.label,
      description: `${preset.vendorId}:${preset.deviceId}`,
    })),
    {
      value: "custom",
      label: t("main.launchOptions.dxmtGpuIdentityCustom"),
      description: t("main.launchOptions.dxmtGpuIdentityCustomDescription"),
    },
  ];

  return (
    <OptionField
      label={t("main.launchOptions.dxmtGpuIdentity")}
      description={t("main.launchOptions.descriptions.dxmtGpuIdentity")}
      disabled={disabled}
      disabledReason={disabledReason}
    >
      <fieldset disabled={disabled} className="m-0 min-w-0 border-0 p-0">
        <Stack className="gap-2">
          <Select
            value={selectedValue}
            options={options}
            onChange={onPresetChange}
            searchPlaceholder={t("main.launchOptions.dxmtGpuIdentitySearch")}
          />
          {isCustom ? (
            <Box className="grid gap-2 sm:grid-cols-2">
              <Box as="label" className="grid gap-1">
                <InlineText className="text-[11px] text-slate-500">
                  {t("main.launchOptions.dxmtGpuVendorId")}
                </InlineText>
                <Input
                  value={vendorId ?? ""}
                  maxLength={6}
                  placeholder="10de"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="h-10 w-full rounded-lg border border-white/10 bg-[#0b1020] px-3 font-mono text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-[rgb(var(--accent-rgb)/0.55)]"
                  onChange={(event) => onVendorIdChange(event.target.value)}
                />
              </Box>
              <Box as="label" className="grid gap-1">
                <InlineText className="text-[11px] text-slate-500">
                  {t("main.launchOptions.dxmtGpuDeviceId")}
                </InlineText>
                <Input
                  value={deviceId ?? ""}
                  maxLength={6}
                  placeholder="2684"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="h-10 w-full rounded-lg border border-white/10 bg-[#0b1020] px-3 font-mono text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-[rgb(var(--accent-rgb)/0.55)]"
                  onChange={(event) => onDeviceIdChange(event.target.value)}
                />
              </Box>
            </Box>
          ) : null}
          {!isValid ? (
            <Text className="text-xs leading-5 text-rose-300">
              {t("main.launchOptions.dxmtGpuPciIdInvalid")}
            </Text>
          ) : null}
        </Stack>
      </fieldset>
    </OptionField>
  );
}

function dxmt_gpu_identity_is_valid(options: Pick<
  BottleLaunchOptionsPayload,
  "dxmtGpuPreset" | "dxmtGpuVendorId" | "dxmtGpuDeviceId"
>): boolean {
  if (
    options.dxmtGpuPreset !== "custom"
    && !options.dxmtGpuVendorId
    && !options.dxmtGpuDeviceId
  ) {
    return true;
  }

  if (options.dxmtGpuPreset !== "custom") {
    return Boolean(get_dxmt_gpu_identity_preset(options.dxmtGpuPreset));
  }

  return pci_id_is_valid(options.dxmtGpuVendorId)
    && pci_id_is_valid(options.dxmtGpuDeviceId);
}

function pci_id_is_valid(value: string | undefined): boolean {
  return /^[0-9a-f]{4}$/i.test(value?.trim().replace(/^0x/i, "") ?? "");
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
