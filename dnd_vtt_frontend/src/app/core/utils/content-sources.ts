import { DndContentSource, DndSourceReference } from '../services/content.service';

export interface SourcedContent { source?: Pick<DndSourceReference, 'code'> }

export function sourceCode(entry: SourcedContent, fallback = 'XPHB'): string {
  return entry.source?.code || fallback;
}

// Homebrew belongs to the campaign library rather than a player-selectable book. Locked core
// sources are always available; optional first-party books must be explicitly enabled.
export function characterContentEnabled(
  entry: SourcedContent,
  enabledCodes: ReadonlySet<string>,
  sources: readonly DndContentSource[] = [],
): boolean {
  const code = sourceCode(entry);
  if (code === 'HOMEBREW') return true;
  const definition = sources.find(source => source.code === code);
  return definition?.locked === true || enabledCodes.has(code);
}
