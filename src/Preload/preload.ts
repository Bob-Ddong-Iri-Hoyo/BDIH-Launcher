import {} from "./Communicate/WineIPC";

import {
  InvokeChannelNames,
  OnChannelNames,
  SendChannelNames,
  PayloadOf,
} from "../Common/Types/IPC";
import { ipcRenderer } from "electron";
import { contextBridge } from "electron";

type voidFunctionType = () => void;

/**
 * Renderer/Main IPC bridge exposed to the isolated renderer world.
 *
 * Keep this file intentionally thin: it should not contain app behavior, only
 * typed wrappers around Electron IPC. The real handlers live in the main
 * process, while the legal channel names and payload contracts live in the
 * shared IPC type file.
 *
 * @see ../Common/Types/IPC.ts for channel names and payload contracts.
 * @see ../Main/Manager/IPCManager.ts for main-process handler registration.
 */

const BTIH_API = {
  /**
   * Request/response IPC.
   *
   * Use this for operations where the renderer needs a result, such as reading
   * preferences, selecting files, installing runtimes, deleting data, or
   * refreshing logs. The generic `C` keeps `payload` tied to the selected
   * channel through `PayloadOf<C>`.
   *
   * @see ../Main/Manager/IPCManager.ts register handlers with ipcMain.handle.
   */
  invoke: async <C extends InvokeChannelNames>(
    channel: C,
    payload: PayloadOf<C>,
  ) => {
    return await ipcRenderer.invoke(channel, payload);
  },

  /**
   * Subscribe to pushed events from the main process.
   *
   * Use this for long-running work updates and live streams, for example
   * Wine/DXMT status, bottle setup progress, process exit, and log updates.
   * Always keep and call the returned unsubscribe function from React effects.
   *
   * @see ../Main/Manager/IPCManager.ts emits these events through WebContents.
   */
  on: <C extends OnChannelNames>(
    channel: C,
    callback: (event: any, data: PayloadOf<C>) => void | Promise<void>,
  ): voidFunctionType => {
    ipcRenderer.on(channel, callback);

    // Return an unsubscribe hook so renderer effects can clean up listeners.
    return () => {
      ipcRenderer.removeListener(channel, callback);
    };
  },

  /**
   * Fire-and-forget IPC.
   *
   * Use this only when the renderer does not need a return value. For anything
   * that can fail in a user-visible way, prefer `invoke` so the main process can
   * return a typed result.
   *
   * @see ../Common/Types/IPC.ts separates send-only channels from invoke ones.
   */
  send: <C extends SendChannelNames>(channel: C, payload: PayloadOf<C>) => {
    ipcRenderer.send(channel, payload);
  },
};

// Small, read-only environment surface for renderer decisions that do not need IPC.
const BTIH_ENV = {
  platform: process.platform,
} as const;

// Context isolation is enabled, so expose only the narrow bridge objects needed by the renderer.
contextBridge.exposeInMainWorld("BTIH_API", BTIH_API);
contextBridge.exposeInMainWorld("BTIH_ENV", BTIH_ENV);

export type BTIH_API = typeof BTIH_API;
export type BTIH_ENV = typeof BTIH_ENV;
