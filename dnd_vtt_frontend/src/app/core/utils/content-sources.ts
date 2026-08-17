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

// Encounter/reference content from DM-only sources (for example the Monster Manual) is not a
// character option and is therefore always available. Player-option supplements such as EFA
// follow the campaign's allowed-source selection; campaign homebrew is always included.
export function campaignContentEnabled(
  entry: SourcedContent,
  allowedCodes: ReadonlySet<string>,
  sources: readonly DndContentSource[],
): boolean {
  const code = sourceCode(entry, 'XMM');
  if (code === 'HOMEBREW') return true;
  const definition = sources.find(source => source.code === code);
  return definition?.player_options === false || definition?.locked === true || allowedCodes.has(code);
}
