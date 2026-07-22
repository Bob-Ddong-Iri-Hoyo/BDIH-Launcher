import { readFile } from "fs/promises";
import path from "path";
import {
  EXECUTION_DESCRIPTOR_SCHEMA_VERSION,
} from "../../Common/Constant/DataSchema";
import type {
  AppDataCompatibilityContract,
  CompatibilityIssue,
  CompatibilityReport,
  CompatibilityStatus,
  DataSchemaResource,
  StableReturnPoint,
} from "../../Common/Types/Compatibility";
import {
  get_bottle_registry_path,
  get_settings_path,
} from "../Environment/AppPaths";

interface MetadataRecord {
  [key: string]: unknown;
}

/**
 * Compares persisted data with the contract recorded by the Stable build that
 * created a return point. User-selected Wine/DXMT versions are intentionally
 * not reverted or treated as schema changes.
 */
export class CompatibilityManager {
  async checkStableReturn(
    returnPoint: StableReturnPoint,
    currentDataRootPath: string,
  ): Promise<CompatibilityReport> {
    const issues: CompatibilityIssue[] = [];
    const observedSchemas: Partial<Record<DataSchemaResource, number>> = {
      executionDescriptor: EXECUTION_DESCRIPTOR_SCHEMA_VERSION,
    };
    const settings = await read_json_record(get_settings_path());

    if (settings.status === "invalid") {
      issues.push(invalid_metadata_issue("settings", get_settings_path()));
    } else {
      const settingsSchema = schema_version_or_legacy(settings.value?.schemaVersion);

      if (settingsSchema === undefined) {
        issues.push(invalid_metadata_issue("settings", get_settings_path()));
      } else {
        observedSchemas.settings = settingsSchema;
      }
    }

    const registryPath = get_bottle_registry_path(currentDataRootPath);
    const registry = await read_json_record(registryPath);

    if (registry.status === "invalid") {
      issues.push(invalid_metadata_issue("bottleRegistry", registryPath));
    } else {
      const registrySchema = schema_version_or_legacy(registry.value?.version);

      if (registrySchema === undefined) {
        issues.push(invalid_metadata_issue("bottleRegistry", registryPath));
      } else {
        observedSchemas.bottleRegistry = registrySchema;
      }
      const bottleMetadata = await inspect_bottle_metadata_schemas(registry.value);

      observedSchemas.bottleMetadata = bottleMetadata.maximumVersion;
      issues.push(...bottleMetadata.issues);
    }

    for (const [resource, observedVersion] of Object.entries(observedSchemas) as Array<[DataSchemaResource, number]>) {
      const supported = returnPoint.contract.schemas[resource];

      if (!supported) {
        issues.push({
          resource,
          status: "unknown",
          code: "invalid-metadata",
          message: `Stable ${returnPoint.stableVersion} did not record a ${resource} compatibility contract.`,
          currentVersion: observedVersion,
        });
        continue;
      }

      const issue = compare_schema(resource, observedVersion, supported);

      if (issue) {
        issues.push(issue);
      }
    }

    return {
      status: aggregate_status(issues),
      targetAppVersion: returnPoint.stableVersion,
      checkedAt: new Date().toISOString(),
      issues,
      observedSchemas,
      preservesUserMetadata: true,
    };
  }

  missingReturnPointReport(): CompatibilityReport {
    return {
      status: "unknown",
      checkedAt: new Date().toISOString(),
      issues: [{
        resource: "returnPoint",
        status: "unknown",
        code: "missing-return-point",
        message: "No previous Stable compatibility contract is available. Only the latest Stable transition can be attempted.",
      }],
      observedSchemas: {},
      preservesUserMetadata: true,
    };
  }
}

function compare_schema(
  resource: DataSchemaResource,
  observedVersion: number,
  supported: AppDataCompatibilityContract["schemas"][DataSchemaResource],
): CompatibilityIssue | undefined {
  if (observedVersion > supported.maximumReadable) {
    return {
      resource,
      status: "incompatible",
      code: "schema-too-new",
      message: `${resource} schema ${observedVersion} is newer than the target Stable maximum ${supported.maximumReadable}.`,
      currentVersion: observedVersion,
      supportedMinimum: supported.minimumReadable,
      supportedMaximum: supported.maximumReadable,
    };
  }

  if (observedVersion < supported.minimumReadable) {
    return {
      resource,
      status: "needs-transform",
      code: "schema-too-old",
      message: `${resource} schema ${observedVersion} must be transformed to at least ${supported.minimumReadable}.`,
      currentVersion: observedVersion,
      supportedMinimum: supported.minimumReadable,
      supportedMaximum: supported.maximumReadable,
    };
  }

  return undefined;
}

async function inspect_bottle_metadata_schemas(registry?: MetadataRecord): Promise<{
  maximumVersion: number;
  issues: CompatibilityIssue[];
}> {
  const bottles = Array.isArray(registry?.bottles)
    ? registry.bottles.filter(is_record)
    : [];
  const metadataPaths = new Map<string, string>();

  for (const bottle of bottles) {
    const bottleId = typeof bottle.id === "string" ? bottle.id : undefined;
    const bottlePath = typeof bottle.path === "string" ? bottle.path : undefined;

    if (bottlePath) {
      metadataPaths.set(path.join(bottlePath, "bdih-bottle.json"), bottleId ?? bottlePath);
    }

    const prefixes = Array.isArray(bottle.prefixes) ? bottle.prefixes.filter(is_record) : [];
    const apps = Array.isArray(bottle.apps) ? bottle.apps.filter(is_record) : [];

    for (const candidate of [...prefixes, ...apps]) {
      const prefixPath = typeof candidate.path === "string"
        ? candidate.path
        : typeof candidate.prefixPath === "string"
          ? candidate.prefixPath
          : undefined;

      if (prefixPath) {
        metadataPaths.set(path.join(prefixPath, "bdih-bottle.json"), bottleId ?? prefixPath);
      }
    }
  }

  let maximumVersion = 1;
  const issues: CompatibilityIssue[] = [];

  for (const [metadataPath, resourceId] of metadataPaths) {
    const metadata = await read_json_record(metadataPath);

    if (metadata.status === "missing") {
      continue;
    }

    if (metadata.status === "invalid") {
      issues.push({
        ...invalid_metadata_issue("bottleMetadata", metadataPath),
        resourceId,
      });
      continue;
    }

    const metadataSchema = schema_version_or_legacy(metadata.value?.schemaVersion);

    if (metadataSchema === undefined) {
      issues.push({
        ...invalid_metadata_issue("bottleMetadata", metadataPath),
        resourceId,
      });
      continue;
    }

    maximumVersion = Math.max(maximumVersion, metadataSchema);
  }

  return { maximumVersion, issues };
}

async function read_json_record(targetPath: string): Promise<{
  status: "ok" | "missing" | "invalid";
  value?: MetadataRecord;
}> {
  try {
    const parsed = JSON.parse(await readFile(targetPath, "utf8"));

    return is_record(parsed)
      ? { status: "ok", value: parsed }
      : { status: "invalid" };
  } catch (error) {
    if (is_missing_file_error(error)) {
      return { status: "missing" };
    }

    return { status: "invalid" };
  }
}

function invalid_metadata_issue(
  resource: Extract<DataSchemaResource, "settings" | "bottleRegistry" | "bottleMetadata">,
  targetPath: string,
): CompatibilityIssue {
  return {
    resource,
    status: "unknown",
    code: "invalid-metadata",
    message: `${resource} metadata could not be read: ${targetPath}`,
  };
}

function aggregate_status(issues: CompatibilityIssue[]): CompatibilityStatus {
  if (issues.some((issue) => issue.status === "incompatible")) {
    return "incompatible";
  }

  if (issues.some((issue) => issue.status === "unknown")) {
    return "unknown";
  }

  if (issues.some((issue) => issue.status === "needs-transform")) {
    return "needs-transform";
  }

  return "compatible";
}

function schema_version_or_legacy(value: unknown): number | undefined {
  if (value === undefined) {
    return 1;
  }

  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : undefined;
}

function is_record(value: unknown): value is MetadataRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function is_missing_file_error(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && (error as NodeJS.ErrnoException).code === "ENOENT";
}

export const compatibilityManager = new CompatibilityManager();
