import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
} from "fs";
import path from "path";

export const DXMT_PREFIX_REQUIRED_WINDOWS_FILES = [
  "d3d10core.dll",
  "d3d11.dll",
  "dxgi.dll",
  "winemetal.dll",
] as const;

export function prepare_prefix_dxmt_runtime_files(options: {
  dxmtRuntimePath: string;
  prefixPath: string;
}): void {
  const system32Path = path.join(options.prefixPath, "drive_c", "windows", "system32");
  const syswow64Path = path.join(options.prefixPath, "drive_c", "windows", "syswow64");
  const x64RuntimePath = path.join(options.dxmtRuntimePath, "x86_64-windows");
  const x86RuntimePath = path.join(options.dxmtRuntimePath, "i386-windows");
  const x64FileNames = [...new Set([
    ...DXMT_PREFIX_REQUIRED_WINDOWS_FILES,
    ...safe_readdir(x64RuntimePath).filter(is_dxmt_windows_runtime_file),
  ])];
  const x86FileNames = safe_readdir(x86RuntimePath).filter(is_dxmt_windows_runtime_file);

  mkdirSync(system32Path, { recursive: true });
  mkdirSync(syswow64Path, { recursive: true });

  for (const name of x64FileNames) {
    copy_runtime_file(
      path.join(x64RuntimePath, name),
      path.join(system32Path, name),
      DXMT_PREFIX_REQUIRED_WINDOWS_FILES.some((requiredName) => requiredName === name),
      `DXMT ${name}`,
    );
  }

  for (const name of x86FileNames) {
    copy_runtime_file(
      path.join(x86RuntimePath, name),
      path.join(syswow64Path, name),
      false,
      `DXMT ${name}`,
    );
  }
}

export function is_prefix_dxmt_runtime_ready(prefixPath: string, dxmtRuntimePath: string): boolean {
  const x64RuntimePath = path.join(dxmtRuntimePath, "x86_64-windows");
  const x86RuntimePath = path.join(dxmtRuntimePath, "i386-windows");
  const filePairs = [
    ...[...new Set([
      ...DXMT_PREFIX_REQUIRED_WINDOWS_FILES,
      ...safe_readdir(x64RuntimePath).filter(is_dxmt_windows_runtime_file),
    ])].map((name) => ({
      sourcePath: path.join(x64RuntimePath, name),
      targetPath: path.join(prefixPath, "drive_c", "windows", "system32", name),
    })),
    ...safe_readdir(x86RuntimePath)
      .filter(is_dxmt_windows_runtime_file)
      .map((name) => ({
        sourcePath: path.join(x86RuntimePath, name),
        targetPath: path.join(prefixPath, "drive_c", "windows", "syswow64", name),
      })),
  ];

  return filePairs.every(({ sourcePath, targetPath }) =>
    existsSync(sourcePath) &&
    existsSync(targetPath) &&
    runtime_file_content_matches(sourcePath, targetPath),
  );
}

function copy_runtime_file(
  sourcePath: string,
  destinationPath: string,
  required: boolean,
  label: string,
): void {
  if (!existsSync(sourcePath)) {
    if (required) {
      throw new Error(`Missing ${label}: ${sourcePath}`);
    }

    return;
  }

  mkdirSync(path.dirname(destinationPath), { recursive: true });
  copyFileSync(sourcePath, destinationPath);
}

function safe_readdir(targetPath: string): string[] {
  try {
    return readdirSync(targetPath);
  } catch {
    return [];
  }
}

function is_dxmt_windows_runtime_file(name: string): boolean {
  return name.toLowerCase().endsWith(".dll");
}

function runtime_file_content_matches(leftPath: string, rightPath: string): boolean {
  try {
    return readFileSync(leftPath).equals(readFileSync(rightPath));
  } catch {
    return false;
  }
}
