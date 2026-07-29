import { Component, inject, signal, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CharacterService } from '../../../core/services/character.service';
import { Character } from '../../../core/models/character.model';
import { CharacterPlaySheetComponent } from '../../dm/dm-play/character-play-sheet/character-play-sheet';

// campaign_name is only present on campaign copies (joined in from the campaigns table on the
// backend) — absent/undefined for a portable template that isn't attached to any campaign yet.
type CharacterListItem = Character & { campaign_name?: string };

// The player-facing counterpart to DmCharactersComponent's template list — but unified: shows
// every character this player has, both campaign-bound local copies (campaign_id set, joined
// with the campaign name) and standalone templates not yet attached to any campaign. Every row
// opens the same play sheet used in a live battle-map session (see PlayerCampaignSessionComponent
// / PlayerCampaignHubComponent), so a player can check stats or adjust HP/resources/spells
// without needing to be in an active encounter — the "Create" tab's wizard remains the place for
// full editing of a template's build.
@Component({
  selector: 'app-player-characters',
  imports: [MatIconModule, MatTooltipModule, CharacterPlaySheetComponent],
  templateUrl: './player-characters.html',
  host: { class: 'flex flex-col flex-1 min-h-0 overflow-hidden' },
})
export class PlayerCharactersComponent implements OnInit {
  private characterService = inject(CharacterService);
  private router = inject(Router);

  characters = signal<CharacterListItem[]>([]);
  loading    = signal(true);

  sheetCharacter = signal<Character | null>(null);
  sheetCampaignId = signal<string | null>(null);

  async ngOnInit() { await this.load(); }

  private async load() {
    const [templates, copies] = await Promise.all([
      this.characterService.getMyCharacters(),
      this.characterService.getMyCampaignCopies(),
    ]);
    const merged = [...copies, ...templates].sort(
      (a, b) => new Date(b.updated_at ?? 0).getTime() - new Date(a.updated_at ?? 0).getTime(),
    );
    this.characters.set(merged);
    this.loading.set(false);
  }

  // Strip campaign_name back off before handing the character to the play sheet — it's a joined
  // display field, not a real character column, and would otherwise get pulled into the JSON
  // data blob the next time the sheet persists a change.
  viewCharacter(item: CharacterListItem) {
    const { campaign_name, ...character } = item;
    void campaign_name;
    this.sheetCharacter.set(character);
    this.sheetCampaignId.set(character.campaign_id ?? null);
  }

  async onCharacterSheetSaved(character: Character) {
    this.sheetCharacter.set(character);
    await this.load();
  }

  closeSheet() {
    this.sheetCharacter.set(null);
    this.sheetCampaignId.set(null);
  }

  openCampaign() {
    const id = this.sheetCampaignId();
    if (id) void this.router.navigate(['/player/campaigns', id]);
  }

  classLabel(c: Character): string {
    return c.subclass ? `${c.subclass} (${c.class})` : c.class;
  }
}
