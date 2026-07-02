import type { BottleMetadataPayload, InstalledBottleAppPayload } from "../../Common/Types/IPC";

export interface InstalledApp extends InstalledBottleAppPayload {}

export interface Bottle extends BottleMetadataPayload {}

export interface CreateBottleInput {
  name: string;
  wineVersionId: string;
  dxmtVersionId: string;
  jadeiteVersionId?: string;
  prefixPath: string;
  description: string;
}
