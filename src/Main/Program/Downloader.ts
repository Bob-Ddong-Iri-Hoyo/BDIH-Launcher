
import { app, net } from "electron";
import { createWriteStream, existsSync, mkdirSync, renameSync, unlinkSync } from "fs";
import path from "path";
import { URL } from "url";

export interface DownloadProps{
    url : string;
    outputDir?: string;
    fileName?: string;
    otherArgs?: string[];
    onStart?: () => void;
    onProgress?: (progress: number) => void;
    onComplete?: () => void;
    onError?: (error: Error) => void;
    onLog?: (message: string) => void;
}

export interface DownloadReturn {
    StopDownload: () => Promise<void>;
}

export interface ParamRunProgramArgument {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  onLog?: (data: string) => void;
  onError?: (data: string) => void;
}
export function Download(props: DownloadProps): DownloadReturn {
    let isDone = false;
    let isStopped = false;
    let request: Electron.ClientRequest | null = null;
    let fileStream: ReturnType<typeof createWriteStream> | null = null;
    let outputPath = "";
    let tempOutputPath = "";

    const finishWithError = (error: Error): void => {
        if (isDone) {
            return;
        }

        isDone = true;
        fileStream?.destroy();

        if (tempOutputPath && existsSync(tempOutputPath)) {
            try {
                unlinkSync(tempOutputPath);
            } catch {
                // Partial download cleanup is best-effort.
            }
        }

        props.onError?.(error);
    };

    const finishSuccessfully = (): void => {
        if (isDone) {
            return;
        }

        isDone = true;
        props.onProgress?.(100);
        props.onComplete?.();
    };

    try {
        const outputDir = props.outputDir ?? get_default_download_dir();
        const fileName = props.fileName ?? get_file_name_from_url(props.url);

        mkdirSync(outputDir, { recursive: true });

        outputPath = path.join(outputDir, fileName);
        tempOutputPath = `${outputPath}.download`;

        if (existsSync(tempOutputPath)) {
            unlinkSync(tempOutputPath);
        }

        props.onLog?.(`Download started: ${props.url}`);
        props.otherArgs?.length && props.onLog?.(`Ignored native download args: ${props.otherArgs.join(" ")}`);
        props.onStart?.();

        fileStream = createWriteStream(tempOutputPath);
        request = net.request({
            method: "GET",
            url: props.url,
        });

        request.on("redirect", (_statusCode, _method, redirectUrl) => {
            props.onLog?.(`Download redirected: ${redirectUrl}`);
            request?.followRedirect();
        });

        request.on("response", (response) => {
            const statusCode = response.statusCode ?? 0;

            if (statusCode < 200 || statusCode >= 300) {
                response.resume();
                finishWithError(new Error(`Download failed with HTTP status ${statusCode}`));
                return;
            }

            const totalBytes = get_header_number(response.headers["content-length"]);
            let receivedBytes = 0;

            response.on("data", (chunk: Buffer) => {
                if (isStopped) {
                    return;
                }

                receivedBytes += chunk.length;
                fileStream?.write(chunk);

                if (totalBytes > 0) {
                    props.onProgress?.(Math.min(100, (receivedBytes / totalBytes) * 100));
                }
            });

            response.on("end", () => {
                if (isStopped || isDone) {
                    return;
                }

                fileStream?.end(() => {
                    try {
                        if (existsSync(outputPath)) {
                            unlinkSync(outputPath);
                        }

                        renameSync(tempOutputPath, outputPath);
                        props.onLog?.(`Download completed: ${outputPath}`);
                        finishSuccessfully();
                    } catch (error) {
                        finishWithError(error instanceof Error ? error : new Error(String(error)));
                    }
                });
            });

            response.on("error", (error) => {
                finishWithError(error);
            });
        });

        request.on("error", (error) => {
            if (isStopped) {
                return;
            }

            finishWithError(error);
        });

        fileStream.on("error", (error) => {
            finishWithError(error);
        });

        request.end();
    } catch (error) {
        finishWithError(error instanceof Error ? error : new Error(String(error)));
    }

    return {
        StopDownload: async () => {
            if (isDone || isStopped) {
                return;
            }

            isStopped = true;
            isDone = true;
            request?.abort();
            fileStream?.destroy();

            if (tempOutputPath && existsSync(tempOutputPath)) {
                try {
                    unlinkSync(tempOutputPath);
                } catch {
                    // Partial download cleanup is best-effort.
                }
            }

            props.onLog?.(`Download stopped: ${props.url}`);
        },
    };
}

function get_default_download_dir(): string {
    if (app.isReady()) {
        return app.getPath("downloads");
    }

    return process.cwd();
}

function get_file_name_from_url(url: string): string {
    try {
        const pathname = new URL(url).pathname;
        const fileName = path.basename(decodeURIComponent(pathname));

        if (fileName && fileName !== "/" && fileName !== ".") {
            return fileName;
        }
    } catch {
        // Fall through to the stable fallback name below.
    }

    return "download";
}

function get_header_number(value: string | string[] | undefined): number {
    const rawValue = Array.isArray(value) ? value[0] : value;
    const parsedValue = rawValue ? Number.parseInt(rawValue, 10) : Number.NaN;

    return Number.isFinite(parsedValue) ? parsedValue : 0;
}
