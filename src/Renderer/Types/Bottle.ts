import type { BottleMetadataPayload, InstalledBottleAppPayload } from "../../Common/Types/IPC";

export interface InstalledApp extends InstalledBottleAppPayload {
  processId?: string;
  isLaunching?: boolean;
  launchError?: string;
}

export interface Bottle extends Omit<BottleMetadataPayload, "apps"> {
  apps: InstalledApp[];
}

export interface CreateBottleInput {
  name: string;
  wineVersionId: string;
  dxmtVersionId: string;
  jadeiteVersionId?: string;
  prefixPath: string;
  description: string;
}
