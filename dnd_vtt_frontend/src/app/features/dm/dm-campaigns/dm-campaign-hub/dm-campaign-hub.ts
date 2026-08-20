import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { CampaignService } from '../../../../core/services/campaign.service';
import { SessionService } from '../../../../core/services/session.service';
import { CharacterService } from '../../../../core/services/character.service';
import { ContentService, DndContentSource } from '../../../../core/services/content.service';
import { CharacterStatsService } from '../../../../core/services/character-stats.service';
import { RecentActivityService } from '../../../../core/services/recent-activity.service';
import { ClassChoiceSource } from '../../../../core/utils/character-effects';
import { CampaignHub, CampaignMember } from '../../../../core/models/campaign.model';
import { Session } from '../../../../core/models/session.model';
import { Character } from '../../../../core/models/character.model';
import { ConfirmService } from '../../../../shared/confirm.service';
import { NotesPanelComponent } from '../../../../shared/components/notes-panel/notes-panel';
import { PartyListComponent } from '../../../../shared/components/party-list/party-list';
import { CharacterWizardComponent } from '../../../characters/character-wizard/character-wizard';
import { CharacterPlaySheetComponent } from '../../../characters/character-play-sheet/character-play-sheet';
import { DescriptionDialogComponent } from '../../../../shared/components/description-dialog/description-dialog';

function toContentIndex(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

@Component({
  selector: 'app-dm-campaign-hub',
  imports: [
    FormsModule, RouterLink, MatIconModule, MatTooltipModule, NotesPanelComponent, PartyListComponent,
    CharacterWizardComponent, CharacterPlaySheetComponent,
  ],
  templateUrl: './dm-campaign-hub.html',
  // Routed in via dm-shell's <router-outlet>, so without a host sizing class this stays an
  // unstyled inline element and the template's flex-1/min-h-0 scroll chain has no bounded parent
  // to size against — same failure mode fixed on PlayerCampaignSessionComponent. Needed here so
  // the embedded character wizard's internal step/preview panes actually scroll instead of
  // collapsing to zero height.
  host: { class: 'flex flex-col flex-1 min-h-0 overflow-hidden' },
})
export class DmCampaignHubComponent implements OnInit {
  private route            = inject(ActivatedRoute);
  private router           = inject(Router);
  private campaignService  = inject(CampaignService);
  private sessionService   = inject(SessionService);
  private characterService = inject(CharacterService);
  private content          = inject(ContentService);
  private statsService     = inject(CharacterStatsService);
  private confirm          = inject(ConfirmService);
  private dialog           = inject(MatDialog);
  private recentActivity   = inject(RecentActivityService);

  campaignId = this.route.snapshot.paramMap.get('campaignId')!;

  campaign = signal<CampaignHub | null>(null);
  loading  = signal(true);
  copied   = signal(false);
  sources  = signal<DndContentSource[]>([]);
  sourcesExpanded = signal(false);
  savingSources = signal(false);
  sourceError = signal<string | null>(null);

  editingCharacter = signal<Character | null>(null);
  showWizard       = signal(false);
  sheetCharacter   = signal<Character | null>(null);
  // Set only when the sheet was opened via the wizard's "View Sheet" button (as opposed to
  // viewMember) — routes closeCharacterSheet() back into the wizard instead of the roster.
  sheetFromWizard  = signal(false);

  showForm = signal(false);
  saving   = signal(false);
  newName        = '';
  newDescription = '';

  uploadingBackground = signal(false);

  partyLevel     = 1;
  savingPartyLevel = signal(false);

  // The character's stored max_hp only reflects whatever level it was last saved at through the
  // wizard — a bulk party-level change doesn't touch it (see CampaignsService.setPartyLevel).
  // Recomputed live per member here, off the same formula the wizard/stats service use, purely
  // for display, so the hub doesn't show a stale number until the DM reopens that character.
  memberMaxHp = signal<Record<string, number>>({});

  async ngOnInit() { await this.load(); }

  private async load() {
    this.recentActivity.markCampaignViewed(this.campaignId);
    this.loading.set(true);
    try {
      const [campaign, sources] = await Promise.all([
        this.campaignService.getById(this.campaignId),
        this.content.getSources(),
      ]);
      this.campaign.set(campaign);
      this.sources.set(sources);
      this.partyLevel = campaign.members.reduce((max, m) => Math.max(max, m.character_level ?? 1), 1);
      void this.loadMemberMaxHp(campaign.members);
    } finally {
      this.loading.set(false);
    }
  }

  sourceAllowed(source: DndContentSource): boolean {
    return this.campaign()?.allowed_sources.includes(source.code) ?? source.locked === true;
  }

  async toggleAllowedSource(source: DndContentSource) {
    const campaign = this.campaign();
    if (!campaign || source.locked || this.savingSources()) return;
    const allowed = new Set(campaign.allowed_sources);
    if (allowed.has(source.code)) allowed.delete(source.code);
    else allowed.add(source.code);
    this.savingSources.set(true);
    this.sourceError.set(null);
    try {
      this.campaign.set(await this.campaignService.update(this.campaignId, {
        allowed_sources: [...allowed],
      }));
    } catch (error) {
      const response = error as { error?: { message?: string | string[] } };
      const message = response?.error?.message;
      this.sourceError.set(
        Array.isArray(message) ? message.join(' ') : message || 'Could not update campaign sources.',
      );
    } finally {
      this.savingSources.set(false);
    }
  }

  private async loadMemberMaxHp(members: CampaignMember[]) {
    const entries = await Promise.all(members.map(async (member) => {
      try {
        const char = await this.characterService.getCharacter(member.character_id);
        const [classData, raceData, backgroundData, feats, items] = await Promise.all([
          this.content.getClass(toContentIndex(char.class)).catch(() => null),
          this.content.getRace(toContentIndex(char.race)).catch(() => null),
          this.content.getBackground(toContentIndex(char.background)).catch(() => null),
          this.content.getFeats(),
          this.content.getItems(this.campaignId),
        ]);
        const primary = char.classes?.[0];
        const classesForFeats: ClassChoiceSource[] = classData ? [{
          data: classData,
          choices: primary?.choices ?? {},
          level: primary?.level ?? char.level,
          subclass: primary?.subclass ?? char.subclass,
        }] : [];
        const stats = this.statsService.compute(
          char, classData, raceData, feats, classesForFeats, items, backgroundData,
        );
        return [member.character_id, stats.suggested_max_hp] as const;
      } catch {
        return null;
      }
    }));
    const map: Record<string, number> = {};
    for (const entry of entries) if (entry) map[entry[0]] = entry[1];
    this.memberMaxHp.set(map);
  }

  async openDescriptionDialog() {
    const description: string | undefined = await firstValueFrom(
      this.dialog.open(DescriptionDialogComponent, {
        data: {
          title: 'Campaign Description',
          description: this.campaign()?.description ?? '',
          placeholder: 'Campaign overview, tone, hooks…',
        },
        width: '480px',
      }).afterClosed(),
    );
    if (description === undefined) return;
    this.campaign.set(await this.campaignService.update(this.campaignId, { description: description.trim() }));
  }

  async onBackgroundFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.uploadingBackground.set(true);
    try {
      this.campaign.set(await this.campaignService.uploadBackground(this.campaignId, file));
    } finally {
      this.uploadingBackground.set(false);
    }
  }

  async clearBackground() {
    this.campaign.set(await this.campaignService.update(this.campaignId, { background_url: null }));
  }

  async createSession() {
    if (!this.newName.trim()) return;
    this.saving.set(true);
    try {
      await this.sessionService.create(this.campaignId, this.newName.trim(), this.newDescription.trim());
      this.newName        = '';
      this.newDescription = '';
      this.showForm.set(false);
      await this.load();
    } finally { this.saving.set(false); }
  }

  async toggleSessionVisibility(session: Session, event: Event) {
    event.stopPropagation();
    event.preventDefault();
    await this.sessionService.setVisibility(session.id, !session.visible_to_players);
    await this.load();
  }

  async setCurrentSession(session: Session, event: Event) {
    event.stopPropagation();
    event.preventDefault();
    const current = this.campaign()?.current_session_id === session.id;
    await this.campaignService.setCurrentSession(this.campaignId, current ? null : session.id);
    await this.load();
  }

  async deleteSession(session: Session, event: Event) {
    event.stopPropagation();
    event.preventDefault();
    if (!await this.confirm.confirm(`Delete "${session.name}"? This cannot be undone.`, 'Delete Session')) return;
    await this.sessionService.remove(session.id);
    await this.load();
  }

  // Manual set from the party level input — applies immediately, no confirmation (mirrors editing
  // a single character's level directly through the wizard).
  async applyPartyLevel() {
    this.savingPartyLevel.set(true);
    try {
      const campaign = await this.campaignService.setPartyLevel(this.campaignId, this.partyLevel);
      this.campaign.set(campaign);
      void this.loadMemberMaxHp(campaign.members);
    } finally {
      this.savingPartyLevel.set(false);
    }
  }

  // "Level Party Up" — bumps everyone to partyLevel + 1, gated by a confirmation since it affects
  // every party member's character at once.
  async levelPartyUp() {
    const next = this.partyLevel + 1;
    if (next > 20) return;
    if (!await this.confirm.confirm(`Level up the whole party to level ${next}?`, 'Level Party Up', 'Level Up')) return;
    this.savingPartyLevel.set(true);
    try {
      const campaign = await this.campaignService.setPartyLevel(this.campaignId, next);
      this.campaign.set(campaign);
      void this.loadMemberMaxHp(campaign.members);
      this.partyLevel = next;
    } finally {
      this.savingPartyLevel.set(false);
    }
  }

  async removeMember(userId: string, name: string) {
    if (!await this.confirm.confirm(`Remove ${name} from this campaign? They can rejoin later with the campaign code.`, 'Remove Player')) return;
    await this.campaignService.removeMember(this.campaignId, userId);
    await this.load();
  }

  // Toggles whether this player can open the character wizard on their own campaign copy (see
  // CharactersService.update's edit_unlocked check) — otherwise only HP/rest/equipment/spell-prep
  // changes from the in-encounter play sheet are player-writable.
  async toggleEditAccess(member: CampaignMember) {
    await this.campaignService.setMemberEditAccess(this.campaignId, member.user_id, !member.edit_unlocked);
    await this.load();
  }

  async togglePartyVisibility(member: CampaignMember) {
    await this.campaignService.setMemberPartyVisibility(
      this.campaignId,
      member.user_id,
      member.visible_to_party === false,
    );
    await this.load();
  }

  // Opens the DM's editable view of a player's campaign copy (member.character_id — see
  // CampaignsService.join(), which clones the player's character into a campaign-scoped row the
  // DM can freely edit without touching the player's original template).
  async openMember(member: CampaignMember) {
    this.editingCharacter.set(await this.characterService.getCharacter(member.character_id));
    this.showWizard.set(true);
  }

  async onCharacterSaved() {
    this.showWizard.set(false);
    await this.load();
  }

  onCharacterCancelled() {
    this.showWizard.set(false);
  }

  async onViewCharacterSheet(id: string) {
    this.showWizard.set(false);
    this.sheetFromWizard.set(true);
    this.sheetCharacter.set(await this.characterService.getCharacter(id));
  }

  // Quick view/edit of HP, rest, equipment, and spell prep — the same play sheet a player uses on
  // their own character, opened here read/write for the DM without going through the full wizard.
  async viewMember(member: CampaignMember) {
    this.sheetFromWizard.set(false);
    this.sheetCharacter.set(await this.characterService.getCharacter(member.character_id));
  }

  // Refreshes the roster's HP/AC badges to match without disturbing loading/sheetCharacter state
  // the way load() would (that flips `loading` true/false, which — checked ahead of
  // sheetCharacter() in the template — would bounce the DM out of the sheet mid-edit).
  async onCharacterSheetSaved(character: Character) {
    this.sheetCharacter.set(character);
    const campaign = await this.campaignService.getById(this.campaignId);
    this.campaign.set(campaign);
    void this.loadMemberMaxHp(campaign.members);
  }

  closeCharacterSheet() {
    if (this.sheetFromWizard()) {
      // sheetCharacter is already the latest saved copy (kept current by onCharacterSheetSaved),
      // so reuse it as the wizard's starting point instead of re-fetching.
      this.editingCharacter.set(this.sheetCharacter());
      this.sheetFromWizard.set(false);
      this.sheetCharacter.set(null);
      this.showWizard.set(true);
      return;
    }
    this.sheetCharacter.set(null);
  }

  async copyJoinCode() {
    const code = this.campaign()?.join_code;
    if (!code) return;
    await navigator.clipboard.writeText(code);
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 1500);
  }

  backToList() {
    void this.router.navigate(['/home/campaigns']);
  }

  formatDate(iso?: string): string {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }
}
