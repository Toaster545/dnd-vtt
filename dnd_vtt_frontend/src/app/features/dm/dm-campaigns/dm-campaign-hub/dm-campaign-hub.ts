import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CampaignService } from '../../../../core/services/campaign.service';
import { SessionService } from '../../../../core/services/session.service';
import { CharacterService } from '../../../../core/services/character.service';
import { ContentService } from '../../../../core/services/content.service';
import { CharacterStatsService } from '../../../../core/services/character-stats.service';
import { ClassChoiceSource } from '../../../../core/utils/character-effects';
import { CampaignHub, CampaignMember } from '../../../../core/models/campaign.model';
import { Session } from '../../../../core/models/session.model';
import { Character } from '../../../../core/models/character.model';
import { portraitDataUri } from '../../../../core/utils/avatar';
import { ConfirmService } from '../../../../shared/confirm.service';
import { NotesPanelComponent } from '../../../../shared/components/notes-panel/notes-panel';
import { CharacterWizardComponent } from '../../dm-create/dm-characters/character-wizard/character-wizard';

function toContentIndex(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

@Component({
  selector: 'app-dm-campaign-hub',
  imports: [FormsModule, RouterLink, MatIconModule, MatTooltipModule, NotesPanelComponent, CharacterWizardComponent],
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

  campaignId = this.route.snapshot.paramMap.get('campaignId')!;

  campaign = signal<CampaignHub | null>(null);
  loading  = signal(true);
  copied   = signal(false);

  editingCharacter = signal<Character | null>(null);
  showWizard       = signal(false);

  showForm = signal(false);
  saving   = signal(false);
  newName        = '';
  newDescription = '';

  descriptionDraft    = '';
  savingDescription   = signal(false);
  uploadingBackground = signal(false);

  partyLevel     = 1;
  savingPartyLevel = signal(false);

  // The character's stored max_hp only reflects whatever level it was last saved at through the
  // wizard — a bulk party-level change doesn't touch it (see CampaignsService.setPartyLevel).
  // Recomputed live per member here, off the same formula the wizard/stats service use, purely
  // for display, so the hub doesn't show a stale number until the DM reopens that character.
  memberMaxHp = signal<Record<string, number>>({});

  // A plain method, not computed() — descriptionDraft is an ngModel-bound field, not a signal, so
  // a computed() here would only re-evaluate when the campaign() signal changes and would ignore
  // every keystroke, leaving the Save button's [disabled] stuck at its first-render value.
  descriptionDirty(): boolean {
    return this.descriptionDraft.trim() !== (this.campaign()?.description ?? '').trim();
  }

  async ngOnInit() { await this.load(); }

  private async load() {
    this.loading.set(true);
    try {
      const campaign = await this.campaignService.getById(this.campaignId);
      this.campaign.set(campaign);
      this.descriptionDraft = campaign.description ?? '';
      this.partyLevel = campaign.members.reduce((max, m) => Math.max(max, m.character_level ?? 1), 1);
      void this.loadMemberMaxHp(campaign.members);
    } finally {
      this.loading.set(false);
    }
  }

  private async loadMemberMaxHp(members: CampaignMember[]) {
    const entries = await Promise.all(members.map(async (member) => {
      try {
        const char = await this.characterService.getCharacter(member.character_id);
        const [classData, raceData, feats, items] = await Promise.all([
          this.content.getClass(toContentIndex(char.class)).catch(() => null),
          this.content.getRace(toContentIndex(char.race)).catch(() => null),
          this.content.getFeats(),
          this.content.getItems(),
        ]);
        const primary = char.classes?.[0];
        const classesForFeats: ClassChoiceSource[] = classData ? [{
          data: classData,
          choices: primary?.choices ?? {},
          level: primary?.level ?? char.level,
          subclass: primary?.subclass ?? char.subclass,
        }] : [];
        const stats = this.statsService.compute(char, classData, raceData, feats, classesForFeats, items);
        return [member.character_id, stats.suggested_max_hp] as const;
      } catch {
        return null;
      }
    }));
    const map: Record<string, number> = {};
    for (const entry of entries) if (entry) map[entry[0]] = entry[1];
    this.memberMaxHp.set(map);
  }

  async saveDescription() {
    this.savingDescription.set(true);
    try {
      this.campaign.set(await this.campaignService.update(this.campaignId, { description: this.descriptionDraft.trim() }));
    } finally {
      this.savingDescription.set(false);
    }
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
      this.campaign.set(await this.campaignService.setPartyLevel(this.campaignId, this.partyLevel));
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
      this.campaign.set(await this.campaignService.setPartyLevel(this.campaignId, next));
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
  async toggleEditAccess(member: CampaignMember, event: Event) {
    event.stopPropagation();
    await this.campaignService.setMemberEditAccess(this.campaignId, member.user_id, !member.edit_unlocked);
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

  async copyJoinCode() {
    const code = this.campaign()?.join_code;
    if (!code) return;
    await navigator.clipboard.writeText(code);
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 1500);
  }

  backToList() {
    void this.router.navigate(['/dm/campaigns']);
  }

  // Prefer the live-recomputed value (see loadMemberMaxHp) — falls back to the stored value while
  // that computation is still in flight, or if it failed for this member.
  // Falls back to the character id as the DiceBear seed for members created before portraits
  // existed — still deterministic per-character, just not one the player ever explicitly picked.
  portraitFor(member: CampaignMember): string {
    return portraitDataUri(member.character_portrait_seed || member.character_id);
  }

  maxHpFor(member: CampaignMember): number | null {
    return this.memberMaxHp()[member.character_id] ?? member.character_max_hp ?? null;
  }

  // Clamped to the live max so a stale current_hp (from before a level-down, before the DM
  // reopens the wizard) doesn't display as over 100%.
  currentHpFor(member: CampaignMember): number | null {
    if (member.character_current_hp == null) return null;
    const max = this.maxHpFor(member);
    return max != null ? Math.min(member.character_current_hp, max) : member.character_current_hp;
  }

  formatDate(iso?: string): string {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }
}
