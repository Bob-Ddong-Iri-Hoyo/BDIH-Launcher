import type { DxmtGpuPresetId } from "../Types/IPC";

export interface DxmtGpuIdentityPreset {
  id: Exclude<DxmtGpuPresetId, "custom">;
  label: string;
  vendorId: string;
  deviceId: string;
}

export const DXMT_GPU_IDENTITY_PRESETS: readonly DxmtGpuIdentityPreset[] = [
  {
    id: "nvidia-rtx-4090",
    label: "NVIDIA GeForce RTX 4090",
    vendorId: "10de",
    deviceId: "2684",
  },
  {
    id: "nvidia-rtx-4080",
    label: "NVIDIA GeForce RTX 4080",
    vendorId: "10de",
    deviceId: "2704",
  },
  {
    id: "nvidia-rtx-4070-ti",
    label: "NVIDIA GeForce RTX 4070 Ti",
    vendorId: "10de",
    deviceId: "2782",
  },
  {
    id: "amd-rx-7900-series",
    label: "AMD Radeon RX 7900 series",
    vendorId: "1002",
    deviceId: "744c",
  },
  {
    id: "amd-rx-6800-series",
    label: "AMD Radeon RX 6800/6900 series",
    vendorId: "1002",
    deviceId: "73bf",
  },
  {
    id: "intel-arc-a770",
    label: "Intel Arc A770",
    vendorId: "8086",
    deviceId: "56a0",
  },
  {
    id: "intel-arc-a750",
    label: "Intel Arc A750",
    vendorId: "8086",
    deviceId: "56a1",
  },
] as const;

export function get_dxmt_gpu_identity_preset(
  presetId: string | undefined,
): DxmtGpuIdentityPreset | undefined {
  return DXMT_GPU_IDENTITY_PRESETS.find((preset) => preset.id === presetId);
}

export function find_dxmt_gpu_identity_preset(
  vendorId: string | undefined,
  deviceId: string | undefined,
): DxmtGpuIdentityPreset | undefined {
  return DXMT_GPU_IDENTITY_PRESETS.find(
    (preset) => preset.vendorId === vendorId && preset.deviceId === deviceId,
  );
}
