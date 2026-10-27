/** Converts a display name ("Half Elf") to a content index ("half-elf"). */
export function toContentIndex(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}
