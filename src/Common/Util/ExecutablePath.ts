export function to_wine_z_path(targetPath: string): string {
  if (!targetPath.startsWith("/")) {
    return targetPath;
  }

  return `Z:${targetPath.replace(/\//g, "\\")}`;
}

export function app_name_from_executable_path(executablePath: string): string {
  const normalizedPath = executablePath.replace(/\\/g, "/");
  const fileName = normalizedPath.split("/").filter(Boolean).pop() ?? "Wine App";

  return fileName.replace(/\.[^.]+$/, "") || "Wine App";
}

export function split_executable_args(rawArgs: string): string[] {
  return rawArgs
    .match(/(?:[^\s"]+|"[^"]*")+/g)
    ?.map((arg) => arg.replace(/^"|"$/g, ""))
    .filter(Boolean) ?? [];
}
