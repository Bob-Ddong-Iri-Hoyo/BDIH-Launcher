import { Layers3, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { JadeiteVersion, WineVersion } from "../../Common/Types/Wine";
import { Box, Button, Inline, List, Stack, Surface, Text } from "./Primitives";
import { RuntimeVersionSelect } from "./RuntimeVersionSelect";
import { StatusBadge } from "./StatusBadge";
import { WineVersionCard } from "./WineVersionCard";
import { DialogCloseButton } from "./Dialog";

/**
 * Props for rendering installed Wine runtime choices.
 *
 * The parent owns selection and installation state; this panel only filters and
 * presents versions that are ready for bottle creation or launching.
 */
export interface InstalledWinePanelProps {
  wineVersions: WineVersion[];
  jadeiteVersions?: JadeiteVersion[];
  selectedWineVersionId?: string;
  selectedJadeiteVersionId?: string;
  installPath?: string;
  className?: string;
  onSelectWineVersion?: (versionId: string) => void;
  onSelectJadeiteVersion?: (versionId: string) => void;
  onInstallJadeiteVersion?: (versionId: string) => void;
  onDeleteJadeiteVersion?: (versionId: string) => void;
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
  jadeiteVersions = [],
  selectedWineVersionId,
  selectedJadeiteVersionId,
  installPath,
  className = "",
  onSelectWineVersion,
  onSelectJadeiteVersion,
  onInstallJadeiteVersion,
  onDeleteJadeiteVersion,
  onClose,
  showHeader = true,
}: InstalledWinePanelProps) {
  const { t } = useTranslation();
  const visibleWineVersions = get_visible_installed_wine_versions(wineVersions);
  const listClassName = showHeader ? "mt-5" : "";
  const selectedJadeiteVersion = jadeiteVersions.find((version) => version.id === selectedJadeiteVersionId);
  const canDeleteSelectedJadeite = Boolean(
    selectedJadeiteVersion
      && (selectedJadeiteVersion.status === "installed" || selectedJadeiteVersion.status === "completed")
      && onDeleteJadeiteVersion,
  );

  return (
    <Surface tone="deep" padding="lg" className={`bg-[#101827] shadow-2xl shadow-black/20 ${className}`}>
      {showHeader ? (
        <Inline className="items-start justify-between gap-3">
          <Inline className="min-w-0 items-start gap-3">
            <Box className="accent-subtle accent-text flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1 accent-ring">
              <Layers3 size={20} />
            </Box>
            <Stack className="min-w-0 gap-1">
              <Inline className="flex-wrap gap-2">
                <Text className="text-base font-semibold text-slate-100">
                  {t("main.installedWine.title")}
                </Text>
                <StatusBadge label={`${visibleWineVersions.length}`} tone="neutral" />
              </Inline>
              <Text className="text-sm text-slate-500">
                {t("main.installedWine.description")}
              </Text>
            </Stack>
          </Inline>
          {onClose ? (
            <DialogCloseButton
              onClose={onClose}
              variant="glass"
              size="sm"
              iconSize={17}
              className="w-9 px-0 text-slate-400"
              aria-label={t("common.actions.close")}
            />
          ) : null}
        </Inline>
      ) : null}

      {visibleWineVersions.length > 0 ? (
        <List className={`gap-3 ${listClassName}`}>
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
        </List>
      ) : (
        <Box className={showHeader ? "mt-5" : ""}>
          <Surface tone="subtle" padding="lg" className="border-dashed text-sm leading-6 text-slate-500">
            {t("main.installedWine.empty")}
          </Surface>
        </Box>
      )}

      {jadeiteVersions.length > 0 ? (
        <Surface tone="subtle" padding="md" className="mt-5 border-white/10">
          <Stack className="gap-3">
            <Inline className="items-start justify-between gap-3">
              <Stack className="gap-1">
                <Text className="text-sm font-semibold text-slate-100">
                  Jadeite Runtime
                </Text>
                <Text className="text-xs leading-5 text-slate-500">
                  HoYo Star Rail recipes can use this runtime when the selected Wine build supports the overseer route.
                </Text>
              </Stack>
              {canDeleteSelectedJadeite ? (
                <Button
                  type="button"
                  variant="glass"
                  size="sm"
                  className="shrink-0 text-rose-200"
                  onClick={() => {
                    if (selectedJadeiteVersionId) {
                      onDeleteJadeiteVersion?.(selectedJadeiteVersionId);
                    }
                  }}
                >
                  <Trash2 size={14} />
                  Delete
                </Button>
              ) : null}
            </Inline>
            <RuntimeVersionSelect
              label="Jadeite"
              value={selectedJadeiteVersionId ?? ""}
              versions={jadeiteVersions}
              onChange={onSelectJadeiteVersion}
              onInstall={onInstallJadeiteVersion}
            />
          </Stack>
        </Surface>
      ) : null}
    </Surface>
  );
}
