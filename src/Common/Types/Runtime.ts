import type { InstallStatus } from "./Wine";

export type RuntimePackageKind = "wine" | "dxmt";

export interface RuntimePackageVersion {
  id: string;
  name: string;
  version: string;
  status: InstallStatus;
  progress: number;
  kind: RuntimePackageKind;
  downloadUrl?: string;
  path?: string;
}
