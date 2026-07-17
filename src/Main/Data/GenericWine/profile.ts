export interface GenericWineProfile {
  kind: "generic";
  id: "generic-wine";
  displayName: string;
}

export const GENERIC_WINE_PROFILE = {
  kind: "generic",
  id: "generic-wine",
  displayName: "Generic Wine application",
} satisfies GenericWineProfile;
