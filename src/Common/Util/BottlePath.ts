const DEFAULT_BOTTLE_PREFIX_ROOT = "~/Library/Application Support/BDIH Launcher/Bottles";

export function bottle_name_to_slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "bottle";
}

export function create_bottle_path_from_name(rootPath: string, name: string): string {
  const slug = bottle_name_to_slug(name);
  const trimmedRoot = rootPath.trim().replace(/\/+$/, "") || DEFAULT_BOTTLE_PREFIX_ROOT;
  const root = trimmedRoot.split("/").pop()?.toLowerCase() === slug
    ? trimmedRoot.split("/").slice(0, -1).join("/") || trimmedRoot
    : trimmedRoot;

  return `${root}/${slug}`;
}

export function normalize_bottle_prefix_root(rootPath: string, name: string): string {
  const slug = bottle_name_to_slug(name);
  const trimmedRoot = rootPath.trim().replace(/\/+$/, "") || DEFAULT_BOTTLE_PREFIX_ROOT;

  if (trimmedRoot.split("/").pop()?.toLowerCase() === slug) {
    return trimmedRoot.split("/").slice(0, -1).join("/") || trimmedRoot;
  }

  return trimmedRoot;
}
