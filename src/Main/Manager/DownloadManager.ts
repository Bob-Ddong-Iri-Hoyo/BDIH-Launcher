import { Download } from "../Program/Downloader";

type DownloadArgs = Pick<Parameters<typeof Download>[0], "outputDir" | "fileName" | "otherArgs">;
type DownloadTask = ReturnType<typeof Download>;

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

    const download = Download({
      ...args,
      url,
      onStart: () => callbacks.onStart?.(),
      onProgress: (progress) => callbacks.onProgress?.(progress),
      onError: (error) => {
        this.downloads.delete(id);
        callbacks.onError?.(error);
        callbacks.onEnd?.(false);
      },
      onComplete: () => {
        this.downloads.delete(id);
        callbacks.onEnd?.(true);
      },
    });

    this.downloads.set(id, download);
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

  listActiveDownloadIds(): string[] {
    return [...this.downloads.keys()];
  }
}

export const downloadManager = new DownloadManager();
