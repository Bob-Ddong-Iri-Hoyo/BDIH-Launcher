import type {
  AppDataCompatibilityContract,
  DataSchemaResource,
} from "../Types/Compatibility";

export const SETTINGS_SCHEMA_VERSION = 1;
export const BOTTLE_REGISTRY_SCHEMA_VERSION = 1;
export const BOTTLE_METADATA_SCHEMA_VERSION = 1;
export const EXECUTION_DESCRIPTOR_SCHEMA_VERSION = 1;

const CURRENT_SCHEMA_VERSIONS: Record<DataSchemaResource, number> = {
  settings: SETTINGS_SCHEMA_VERSION,
  bottleRegistry: BOTTLE_REGISTRY_SCHEMA_VERSION,
  bottleMetadata: BOTTLE_METADATA_SCHEMA_VERSION,
  executionDescriptor: EXECUTION_DESCRIPTOR_SCHEMA_VERSION,
};

/**
 * Builds the data contract from code-owned schema constants. Release authors
 * do not maintain a Stable/Beta compatibility matrix; the running Stable app
 * records this contract automatically before it enters Beta.
 */
export function create_app_data_compatibility_contract(
  appVersion: string,
): AppDataCompatibilityContract {
  return {
    contractVersion: 1,
    appVersion,
    schemas: Object.fromEntries(
      Object.entries(CURRENT_SCHEMA_VERSIONS).map(([resource, current]) => [
        resource,
        {
          minimumReadable: 1,
          maximumReadable: current,
          current,
        },
      ]),
    ) as AppDataCompatibilityContract["schemas"],
  };
}
