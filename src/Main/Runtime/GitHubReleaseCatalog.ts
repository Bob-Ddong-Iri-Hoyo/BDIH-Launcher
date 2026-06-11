export interface GitHubReleaseAsset {
  name: string;
  browser_download_url: string;
}

export interface GitHubRelease {
  tag_name: string;
  name?: string;
  draft?: boolean;
  prerelease?: boolean;
  assets?: GitHubReleaseAsset[];
}

export interface RuntimeReleaseItem {
  id: string;
  name: string;
  version: string;
  downloadUrl?: string;
}

export async function fetch_github_release_catalog(apiUrl: string, idPrefix: string): Promise<RuntimeReleaseItem[]> {
  const response = await fetch(apiUrl, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "BDIH-Launcher",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch GitHub releases: ${response.status} ${response.statusText}`);
  }

  const releases = (await response.json()) as GitHubRelease[];

  return releases
    .filter((release) => !release.draft)
    .map((release) => {
      const asset = select_runtime_asset(release.assets ?? []);
      const version = release.tag_name;

      return {
        id: `${idPrefix}-${slugify(version)}`,
        name: release.name || version,
        version,
        downloadUrl: asset?.browser_download_url,
      };
    })
    .filter((release) => Boolean(release.downloadUrl));
}

function select_runtime_asset(assets: GitHubReleaseAsset[]): GitHubReleaseAsset | undefined {
  return assets.find((asset) => /\.(zip|tar\.gz|tgz|7z|dmg)$/i.test(asset.name)) ?? assets[0];
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
