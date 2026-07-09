import { Download } from "../Program/Downloader";
import { downloadByCurl } from "../Program/Curl";

type DownloadArgs = Pick<Parameters<typeof Download>[0], "outputDir" | "fileName" | "otherArgs">;
type DownloadTask = {
  StopDownload: () => Promise<void>;
};

export interface DownloadCallbacks {
  onStart?: () => void;
  onProgress?: (progress: number) => void;
  onError?: (error: Error) => void;
  onEnd?: (success: boolean) => void;
}

export class DownloadManager {
  private readonly downloads = new Map<string, DownloadTask>();

  startDownload(
    id: string,
    url: string,
    args: DownloadArgs,
    callbacks: DownloadCallbacks = {},
  ): string {
    if (this.downloads.has(id)) {
      throw new Error(`Download already exists: ${id}`);
    }

    let activeDownload: DownloadTask | undefined;
    let stopped = false;
    let fallbackStarted = false;
    let nativeReady = false;
    let pendingNativeError: Error | undefined;
    let didStart = false;

    const notifyStart = () => {
      if (didStart) {
        return;
      }

      didStart = true;
      callbacks.onStart?.();
    };

    const finishSuccess = () => {
      if (stopped) {
        return;
      }

      this.downloads.delete(id);
      callbacks.onEnd?.(true);
    };

    const finishFailure = (error: Error) => {
      if (stopped) {
        return;
      }

      this.downloads.delete(id);
      callbacks.onError?.(error);
      callbacks.onEnd?.(false);
    };

    const startCurlFallback = (nativeError: Error) => {
      if (stopped || fallbackStarted) {
        return;
      }

      fallbackStarted = true;

      try {
        const curlDownload = downloadByCurl(url, args, {
          onStart: notifyStart,
          onProgress: (progress) => callbacks.onProgress?.(progress),
          onError: finishFailure,
          onEnd: (success) => {
            if (success) {
              finishSuccess();
              return;
            }

            finishFailure(nativeError);
          },
        });

        activeDownload = {
          StopDownload: () => curlDownload.StopCurl(),
        };
      } catch (error) {
        finishFailure(error instanceof Error ? error : nativeError);
      }
    };

    this.downloads.set(id, {
      StopDownload: async () => {
        stopped = true;
        await activeDownload?.StopDownload();
      },
    });

    const nativeDownload = Download({
      ...args,
      url,
      onStart: notifyStart,
      onProgress: (progress) => callbacks.onProgress?.(progress),
      onError: (error) => {
        if (!nativeReady) {
          pendingNativeError = error;
          return;
        }

        startCurlFallback(error);
      },
      onComplete: finishSuccess,
    });

    activeDownload = nativeDownload;
    nativeReady = true;

    if (pendingNativeError) {
      startCurlFallback(pendingNativeError);
    }

    return id;
  }

  async stopDownload(id: string): Promise<void> {
    const download = this.downloads.get(id);

    if (!download) {
      return;
    }

    await download.StopDownload();
    this.downloads.delete(id);
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.downloads.keys()].map((id) => this.stopDownload(id)));
  }

  listActiveDownloadIds(): string[] {
    return [...this.downloads.keys()];
  }
}

export const downloadManager = new DownloadManager();
