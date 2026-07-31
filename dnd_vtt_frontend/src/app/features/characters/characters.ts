import { Component, inject, signal, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CharacterService } from '../../core/services/character.service';
import { RecentActivityService } from '../../core/services/recent-activity.service';
import { Character } from '../../core/models/character.model';
import { ConfirmService } from '../../shared/confirm.service';

// campaign_name/edit_unlocked are only present on campaign copies (joined in from the campaigns/
// campaign_members tables on the backend) — absent/undefined for a portable template that isn't
// attached to any campaign yet.
type CharacterListItem = Character & { campaign_name?: string; edit_unlocked?: boolean };

// The list only — creating/editing (the wizard) and viewing/playing (the sheet) are their own
// routes (/home/characters/new, /home/characters/:id/edit, /home/characters/:id — see
// character-wizard-page/ and character-sheet-page/), not signal-toggled sub-views of this
// component, so they're deep-linkable and can carry their own route data.
@Component({
  selector: 'app-characters',
  imports: [MatIconModule, MatTooltipModule],
  templateUrl: './characters.html',
  styleUrl: './characters.scss',
  host: { class: 'flex flex-col flex-1 min-h-0' },
})
export class CharactersComponent implements OnInit {
  private characterService = inject(CharacterService);
  private recentActivity = inject(RecentActivityService);
  private confirm = inject(ConfirmService);
  private router = inject(Router);

  characters = signal<CharacterListItem[]>([]);

  async ngOnInit() { await this.load(); }

  private async load() {
    const [templates, copies] = await Promise.all([
      this.characterService.getMyCharacters(),
      this.characterService.getMyCampaignCopies(),
    ]);
    this.characters.set(this.recentActivity.sortByRecentlyViewed([...copies, ...templates]));
  }

  // A campaign copy is DM-locked to the build wizard by default — the DM can grant full edit
  // access per-member (campaign_members.edit_unlocked, toggled from the campaign hub roster).
  // Mirrors the same rule CharactersService.update() enforces server-side; hiding the button here
  // is UX only, the backend independently drops any disallowed field regardless of this check.
  canEdit(c: CharacterListItem): boolean {
    return !c.campaign_id || !!c.edit_unlocked;
  }

  openRow(c: CharacterListItem) {
    void this.router.navigate(this.canEdit(c) ? ['/home/characters', c.id, 'edit'] : ['/home/characters', c.id]);
  }

  viewSheet(c: CharacterListItem) {
    void this.router.navigate(['/home/characters', c.id]);
  }

  openEdit(c: CharacterListItem) {
    void this.router.navigate(['/home/characters', c.id, 'edit']);
  }

  openCreate() {
    void this.router.navigate(['/home/characters/new']);
  }

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
