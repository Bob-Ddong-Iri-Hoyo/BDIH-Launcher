import { app } from "electron";
import path from "path";

const APP_ICON_RESOURCE_NAME = "icon.png";

export function get_app_icon_path(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, APP_ICON_RESOURCE_NAME)
    : path.join(process.cwd(), "build", APP_ICON_RESOURCE_NAME);
}
