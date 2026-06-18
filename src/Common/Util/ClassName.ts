export type ClassNameValue = string | false | null | undefined;

export function join_classes(...classes: ClassNameValue[]): string {
  return classes.filter(Boolean).join(" ");
}
