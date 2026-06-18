import { Layers3, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { WineVersion } from "../../Common/Types/Wine";
import { Box, Button, Inline, Stack, Surface, Text } from "./Primitives";
import { StatusBadge } from "./StatusBadge";
import { WineVersionCard } from "./WineVersionCard";

/**
 * Props for rendering installed Wine runtime choices.
 *
 * The parent owns selection and installation state; this panel only filters and
 * presents versions that are ready for bottle creation or launching.
 */
export interface InstalledWinePanelProps {
  wineVersions: WineVersion[];
  selectedWineVersionId?: string;
  installPath?: string;
  className?: string;
  onSelectWineVersion?: (versionId: string) => void;
  onClose?: () => void;
  showHeader?: boolean;
}

const VISIBLE_WINE_STATUSES = new Set([
  "installed",
  "completed",
]);

/** Returns Wine versions that should appear in the installed-runtime picker. */
export function get_visible_installed_wine_versions(wineVersions: WineVersion[]) {
  return wineVersions.filter((version) => VISIBLE_WINE_STATUSES.has(version.status));
}

/**
 * Installed Wine runtime selector panel.
 *
 * Use it in runtime management dialogs or bottle creation surfaces when users
 * need to see which Wine builds are installed and choose the active one.
 */
export function InstalledWinePanel({
  wineVersions,
  selectedWineVersionId,
  installPath,
  className = "",
  onSelectWineVersion,
  onClose,
  showHeader = true,
}: InstalledWinePanelProps) {
  const { t } = useTranslation();
  const visibleWineVersions = get_visible_installed_wine_versions(wineVersions);
  const listClassName = showHeader ? "mt-5" : "";

  return (
    <Surface tone="deep" padding="lg" className={`bg-[#101827] shadow-2xl shadow-black/20 ${className}`}>
      {showHeader ? (
        <Inline align="start" justify="between" gap="md">
          <Inline align="start" gap="md" className="min-w-0">
            <Box className="accent-subtle accent-text flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1 accent-ring">
              <Layers3 size={20} />
            </Box>
            <Stack gap="xs" className="min-w-0">
              <Inline gap="sm" wrap>
                <Text tone="strong" size="base" weight="semibold">
                  {t("main.installedWine.title")}
                </Text>
                <StatusBadge label={`${visibleWineVersions.length}`} tone="neutral" />
              </Inline>
              <Text tone="muted" size="sm">
                {t("main.installedWine.description")}
              </Text>
            </Stack>
          </Inline>
          {onClose ? (
            <Button
              variant="glass"
              size="sm"
              className="w-9 px-0 text-slate-400"
              aria-label={t("common.actions.close")}
              icon={<X size={17} />}
              onClick={onClose}
            />
          ) : null}
        </Inline>
      ) : null}

      {visibleWineVersions.length > 0 ? (
        <Stack gap="md" className={listClassName}>
          {visibleWineVersions.map((version) => (
            <WineVersionCard
              key={version.id}
              version={version}
              installPath={installPath}
              isSelected={version.id === selectedWineVersionId}
              showInstallAction={false}
              onSelect={onSelectWineVersion}
            />
          ))}
        </Stack>
      ) : (
        <Box className={showHeader ? "mt-5" : ""}>
          <Surface tone="subtle" padding="lg" className="border-dashed text-sm leading-6 text-slate-500">
            {t("main.installedWine.empty")}
          </Surface>
        </Box>
      )}
    </Surface>
  );
}
