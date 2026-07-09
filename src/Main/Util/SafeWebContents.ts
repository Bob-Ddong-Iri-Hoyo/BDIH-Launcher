import type { WebContents } from "electron";

/**
 * Sends an IPC event only while the renderer WebContents is still alive.
 *
 * Long-running main-process jobs can outlive the window that started them. In
 * that case Electron throws "Object has been destroyed" if we call send()
 * after the renderer is gone, so status updates must be best-effort.
 */
export function send_to_web_contents<TPayload>(
  sender: WebContents | undefined,
  channelName: string,
  payload: TPayload,
): void {
  if (!sender || sender.isDestroyed()) {
    return;
  }

  try {
    sender.send(channelName, payload);
  } catch {
    // The renderer may be destroyed between isDestroyed() and send().
    // Ignore this because the background task state is still handled by main.
  }
}
