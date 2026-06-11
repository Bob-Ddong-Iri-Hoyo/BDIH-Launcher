export type InstallStatus =
  | "idle"
  | "available"
  | "downloading"
  | "installing"
  | "extracting"
  | "installed"
  | "completed"
  | "error";

export type WineType = "official" | "custom";

export interface WineVersion {
  id: string;
  name: string;
  version: string;
  status: InstallStatus;
  path?: string;
  progress: number;
  type: WineType;
  downloadUrl?: string;
}

export interface DxmtVersion {
  id: string;
  name: string;
  version: string;
  status: InstallStatus;
  progress: number;
  downloadUrl?: string;
  path?: string;
}

export interface WineError {
  code: string;
  message: string;
}
