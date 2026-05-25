export interface InstalledApp {
  id: string;
  name: string;
  subtitle: string;
  wineVersionId: string;
  lastPlayed: string;
  lastPlayedKey?: string;
  status: "ready" | "needs-prefix" | "updating";
}

export interface Bottle {
  id: string;
  name: string;
  description: string;
  wineVersionId: string;
  path: string;
  status: "ready" | "needs-setup" | "updating";
  apps: InstalledApp[];
}

export interface CreateBottleInput {
  name: string;
  wineVersionId: string;
  path: string;
  description: string;
}
