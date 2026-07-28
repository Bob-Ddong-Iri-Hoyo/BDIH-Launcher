import {
  default_launch_options_for_preset,
  filter_launch_options_by_manifest,
  normalize_launch_options,
} from "../../../src/Common/Util/LaunchOptions";
import { update_inline_dxmt_config } from "../../../src/Common/Util/DxmtConfig";
import type { WineLauncherOptionsManifest } from "../../../src/Common/Types/Wine";
import { launch_option_keys_for_app } from "../../../src/Main/Data/GameProfile";

const dxmtManifest: WineLauncherOptionsManifest = {
  schemaVersion: 1,
  id: "test",
  name: "Test Wine",
  groups: [{
    id: "dxmt",
    title: "DXMT",
    options: [
      { name: "DXMT_CONFIG", type: "string" },
      { name: "DXMT_ENABLE_NVEXT", type: "enum" },
    ],
  }],
};

describe("launch options", () => {
  it("leaves the HSR NVIDIA compatibility paths unspecified by default", () => {
    const defaults = default_launch_options_for_preset("hsr");

    expect(defaults.dxmtPreferredMaxFrameRate).toBe(60);
    expect(defaults).not.toHaveProperty("dxmtGpuPreset");
    expect(defaults).not.toHaveProperty("dxmtGpuVendorId");
    expect(defaults).not.toHaveProperty("dxmtGpuDeviceId");
    expect(defaults).not.toHaveProperty("dxmtEnableNvExt");
  });

  it("normalizes a GPU preset into its PCI vendor and device IDs", () => {
    expect(normalize_launch_options({
      presetId: "custom",
      dxmtGpuPreset: "nvidia-rtx-4090",
      dxmtEnableNvExt: false,
    })).toMatchObject({
      presetId: "custom",
      dxmtGpuPreset: "nvidia-rtx-4090",
      dxmtGpuVendorId: "10de",
      dxmtGpuDeviceId: "2684",
      dxmtEnableNvExt: false,
    });
  });

  it("normalizes Custom PCI IDs and accepts an optional 0x prefix", () => {
    expect(normalize_launch_options({
      presetId: "custom",
      dxmtGpuPreset: "custom",
      dxmtGpuVendorId: "0xABCD",
      dxmtGpuDeviceId: "1234",
    })).toMatchObject({
      dxmtGpuPreset: "custom",
      dxmtGpuVendorId: "abcd",
      dxmtGpuDeviceId: "1234",
    });
  });

  it("migrates the legacy NVIDIA toggle to the RTX 4090 preset", () => {
    expect(normalize_launch_options({
      presetId: "custom",
      dxmtNvidiaVendorId: true,
    } as Parameters<typeof normalize_launch_options>[0] & {
      dxmtNvidiaVendorId: boolean;
    })).toMatchObject({
      dxmtGpuPreset: "nvidia-rtx-4090",
      dxmtGpuVendorId: "10de",
      dxmtGpuDeviceId: "2684",
    });
  });

  it("exposes GPU identity and NVEXT controls for every DXMT app", () => {
    for (const app of [
      {
        id: "hoyo:hsr",
        name: "Honkai: Star Rail",
        executablePath: "C:\\Games\\StarRail.exe",
      },
      {
        id: "hoyo:genshin",
        name: "Genshin Impact",
        executablePath: "C:\\Games\\GenshinImpact.exe",
      },
      {
        id: "manual:game",
        name: "Manual game",
        executablePath: "C:\\Games\\Game.exe",
      },
    ]) {
      expect(launch_option_keys_for_app(app)).toEqual(expect.arrayContaining([
        "dxmtGpuPreset",
        "dxmtGpuVendorId",
        "dxmtGpuDeviceId",
        "dxmtEnableNvExt",
      ]));
    }
  });

  it("keeps GPU identity and NVEXT controls when the Wine manifest supports them", () => {
    expect(filter_launch_options_by_manifest({
      presetId: "custom",
      dxmtGpuPreset: "amd-rx-7900-series",
      dxmtEnableNvExt: true,
    }, dxmtManifest)).toMatchObject({
      dxmtGpuPreset: "amd-rx-7900-series",
      dxmtGpuVendorId: "1002",
      dxmtGpuDeviceId: "744c",
      dxmtEnableNvExt: true,
    });
  });

  it("adds and removes GPU PCI identifiers without changing other DXMT settings", () => {
    const enabled = update_inline_dxmt_config(
      "d3d11.preferredMaxFrameRate=60;",
      [
        ["dxgi.customVendorId", "10de"],
        ["dxgi.customDeviceId", "2684"],
      ],
    );

    expect(enabled).toBe(
      "d3d11.preferredMaxFrameRate=60;dxgi.customVendorId=10de;dxgi.customDeviceId=2684;",
    );
    expect(update_inline_dxmt_config(enabled, [
      ["dxgi.customVendorId", undefined],
      ["dxgi.customDeviceId", undefined],
    ])).toBe("d3d11.preferredMaxFrameRate=60;");
  });
});
