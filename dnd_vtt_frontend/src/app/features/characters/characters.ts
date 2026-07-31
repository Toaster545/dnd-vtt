import { Component, inject, signal, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

const CHAR_VIEWED_KEY = 'dnd-char-viewed';
function markCharacterViewed(id: string) {
  const views: Record<string, number> = JSON.parse(localStorage.getItem(CHAR_VIEWED_KEY) ?? '{}');
  views[id] = Date.now();
  localStorage.setItem(CHAR_VIEWED_KEY, JSON.stringify(views));
}
function sortByRecentlyViewed<T extends { id?: string }>(chars: T[]): T[] {
  const views: Record<string, number> = JSON.parse(localStorage.getItem(CHAR_VIEWED_KEY) ?? '{}');
  return [...chars].sort((a, b) => (views[b.id!] ?? 0) - (views[a.id!] ?? 0));
}
import { MatTooltipModule } from '@angular/material/tooltip';
import { CharacterService } from '../../core/services/character.service';
import { Character } from '../../core/models/character.model';
import { CharacterWizardComponent } from './character-wizard/character-wizard';
import { CharacterPlaySheetComponent } from './character-play-sheet/character-play-sheet';
import { ConfirmService } from '../../shared/confirm.service';

// campaign_name/edit_unlocked are only present on campaign copies (joined in from the campaigns/
// campaign_members tables on the backend) — absent/undefined for a portable template that isn't
// attached to any campaign yet.
type CharacterListItem = Character & { campaign_name?: string; edit_unlocked?: boolean };

@Component({
  selector: 'app-characters',
  imports: [CharacterWizardComponent, CharacterPlaySheetComponent, MatIconModule, MatTooltipModule],
  templateUrl: './characters.html',
  styleUrl: './characters.scss',
})
export class CharactersComponent implements OnInit {
  private characterService = inject(CharacterService);
  private confirm = inject(ConfirmService);
  private router = inject(Router);

  characters = signal<CharacterListItem[]>([]);
  editingCharacter = signal<Character | null>(null);
  showWizard = signal(false);

  sheetCharacter = signal<Character | null>(null);
  sheetCampaignId = signal<string | null>(null);

  async ngOnInit() { await this.load(); }

  private async load() {
    const [templates, copies] = await Promise.all([
      this.characterService.getMyCharacters(),
      this.characterService.getMyCampaignCopies(),
    ]);
    this.characters.set(sortByRecentlyViewed([...copies, ...templates]));
  }

  // Strip campaign_name back off before handing the character to the play sheet — it's a joined
  // display field, not a real character column, and would otherwise get pulled into the JSON
  // data blob the next time the sheet persists a change.
  viewSheet(item: CharacterListItem) {
    if (item.id) markCharacterViewed(item.id);
    const { campaign_name, edit_unlocked, ...character } = item;
    void campaign_name; void edit_unlocked;
    this.sheetCharacter.set(character);
    this.sheetCampaignId.set(character.campaign_id ?? null);
  }

  // A campaign copy is DM-locked to the build wizard by default — the DM can grant full edit
  // access per-member (campaign_members.edit_unlocked, toggled from the campaign hub roster).
  // Mirrors the same rule CharactersService.update() enforces server-side; hiding the button here
  // is UX only, the backend independently drops any disallowed field regardless of this check.
  canEdit(c: CharacterListItem): boolean {
    return !c.campaign_id || !!c.edit_unlocked;
  }

  async onCharacterSheetSaved(character: Character) {
    this.sheetCharacter.set(character);
    await this.load();
  }

  closeSheet() {
    this.sheetCharacter.set(null);
    this.sheetCampaignId.set(null);
  }

  // getMyCampaignCopies() only ever returns campaigns the caller has actively joined as a member
  // (see CharacterService.getMyCampaignCopies), so this always lands on the member hub view, even
  // if the caller also happens to own other campaigns elsewhere.
  openCampaign() {
    const id = this.sheetCampaignId();
    if (!id) return;
    void this.router.navigate(['/home/campaigns', id]);
  }

  openCreate() { this.editingCharacter.set(null); this.showWizard.set(true); }
  openEdit(character: Character) {
    if (character.id) markCharacterViewed(character.id);
    this.editingCharacter.set(character);
    this.showWizard.set(true);
  }
  async onSaved() { this.showWizard.set(false); await this.load(); }
  onCancelled() { this.showWizard.set(false); this.load(); }

  async deleteCharacter(id: string) {
    const char = this.characters().find(c => c.id === id);
    const name = char?.name ?? 'this character';
    if (!await this.confirm.confirm(`Delete "${name}"? This cannot be undone.`, 'Delete Character')) return;
    await this.characterService.deleteCharacter(id);
    await this.load();
  }

  classLabel(c: Character): string {
    return c.subclass ? `${c.subclass} (${c.class})` : c.class;
  }
}
