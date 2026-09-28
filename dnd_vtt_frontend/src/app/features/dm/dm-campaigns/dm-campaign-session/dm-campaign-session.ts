import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { EncounterService } from '../../../../core/services/encounter.service';
import { ContentService, DndMonster } from '../../../../core/services/content.service';
import { CharacterService } from '../../../../core/services/character.service';
import { CharacterStatsService } from '../../../../core/services/character-stats.service';
import { SessionService } from '../../../../core/services/session.service';
import { CampaignService } from '../../../../core/services/campaign.service';
import { ClassChoiceSource } from '../../../../core/utils/character-effects';
import { campaignContentEnabled } from '../../../../core/utils/content-sources';
import { Encounter } from '../../../../core/models/encounter.model';
import { Character } from '../../../../core/models/character.model';
import { CampaignMember } from '../../../../core/models/campaign.model';
import { Session } from '../../../../core/models/session.model';
import { ConfirmService } from '../../../../shared/confirm.service';
import { WikiEmbedComponent } from '../../../wiki/wiki-embed.component';
import { PartyListComponent } from '../../../../shared/components/party-list/party-list';
import { CharacterWizardComponent } from '../../../characters/character-wizard/character-wizard';
import { CharacterPlaySheetComponent } from '../../../characters/character-play-sheet/character-play-sheet';
import { DescriptionDialogComponent } from '../../../../shared/components/description-dialog/description-dialog';
import { EncounterFormDialogComponent, EncounterFormDialogData } from './encounter-form-dialog/encounter-form-dialog';

function toContentIndex(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

@Component({
  selector: 'app-dm-campaign-session',
  imports: [
    FormsModule, RouterLink, MatIconModule, MatTooltipModule, WikiEmbedComponent, PartyListComponent,
    CharacterWizardComponent, CharacterPlaySheetComponent,
  ],
  templateUrl: './dm-campaign-session.html',
  // Routed in via dm-shell's <router-outlet>, so without a host sizing class this stays an
  // unstyled inline element and the template's flex-1/min-h-0/overflow-y-auto root div has no
  // bounded parent to size against — it just grows to content height instead of filling the
  // screen. Same fix as DmCampaignHubComponent / PlayerCampaignSessionComponent.
  host: { class: 'flex flex-col flex-1 min-h-0 overflow-hidden' },
})
export class DmCampaignSessionComponent implements OnInit {

  private route             = inject(ActivatedRoute);
  private router            = inject(Router);
  private encounterService  = inject(EncounterService);
  private content           = inject(ContentService);
  private characterService  = inject(CharacterService);
  private statsService      = inject(CharacterStatsService);
  private sessionService    = inject(SessionService);
  private campaignService   = inject(CampaignService);
  private confirm           = inject(ConfirmService);
  private dialog            = inject(MatDialog);

  campaignId = this.route.snapshot.paramMap.get('campaignId')!;
  sessionId  = this.route.snapshot.paramMap.get('sessionId')!;

  session      = signal<Session | null>(null);
  campaignName = signal<string | null>(null);
  encounters = signal<Encounter[]>([]);

  // The embedded wiki panel prefers a page named after this session, then one named after the campaign.
  readonly wikiTitles = computed(() =>
    [this.session()?.name, this.campaignName()].filter((n): n is string => !!n),
  );
  monsters   = signal<DndMonster[]>([]);
  characters = signal<Character[]>([]);
  members    = signal<CampaignMember[]>([]);
  loading    = signal(true);

  // Same live-recomputed HP as DmCampaignHubComponent.memberMaxHp — kept here too so the party
  // tab reads identically on both pages instead of falling back to the member's stored (possibly
  // stale) character_max_hp.
  memberMaxHp = signal<Record<string, number>>({});

  editingCharacter = signal<Character | null>(null);
  showWizard       = signal(false);
  sheetCharacter   = signal<Character | null>(null);

  uploadingBackground = signal(false);

  // The encounter (if any) currently active anywhere in the campaign — a campaign only ever has
  // one, enforced server-side. Drives both the "Start" disabled state on every other encounter and
  // the cross-session banner below.
  activeEncounter  = signal<Encounter | null>(null);
  // id of the encounter whose start/stop request is currently in flight, if any.
  busyEncounterId  = signal<string | null>(null);
  actionError      = signal<string | null>(null);

  // Active encounter first (so a just-started one jumps to the top of the list), otherwise the
  // backend's created_at DESC order.
  sortedEncounters = computed(() => {
    const list = this.encounters();
    const active = list.filter(e => e.status === 'active');
    const rest = list.filter(e => e.status !== 'active');
    return [...active, ...rest];
  });

  async ngOnInit() {
    const [session, encounters, monsters, characters, campaign, sources, activeEncounter] = await Promise.all([
      this.sessionService.getById(this.sessionId),
      this.encounterService.getBySession(this.sessionId),
      this.content.getMonsters(this.campaignId),
      this.characterService.getMyCharacters(),
      this.campaignService.getById(this.campaignId),
      this.content.getSources(),
      this.encounterService.getActiveForCampaign(this.campaignId),
    ]);
    this.session.set(session);
    this.campaignName.set(campaign.name);
    this.encounters.set(encounters);
    const allowed = new Set(campaign.allowed_sources);
    this.monsters.set(monsters.filter(monster => campaignContentEnabled(monster, allowed, sources)));
    this.characters.set(characters);
    this.members.set(campaign.members);
    this.activeEncounter.set(activeEncounter);
    this.loading.set(false);
    void this.loadMemberMaxHp(campaign.members);
  }

  // Re-fetches the roster after a management action (edit access/visibility/remove) or a
  // character save — mirrors DmCampaignHubComponent.load()'s member-refresh half, without
  // touching this page's own `loading`/encounters state.
  private async refreshMembers() {
    const campaign = await this.campaignService.getById(this.campaignId);
    this.members.set(campaign.members);
    void this.loadMemberMaxHp(campaign.members);
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
        return [member.character_id, char.max_hp_overridden ? char.max_hp : stats.suggested_max_hp] as const;
      } catch {
        return null;
      }
    }));
    const map: Record<string, number> = {};
    for (const entry of entries) if (entry) map[entry[0]] = entry[1];
    this.memberMaxHp.set(map);
  }

  // Opens the DM's editable view of a player's campaign copy — same flow as
  // DmCampaignHubComponent.openMember.
  async openMember(member: CampaignMember) {
    this.editingCharacter.set(await this.characterService.getCharacter(member.character_id));
    this.showWizard.set(true);
  }

  async onCharacterSaved() {
    this.showWizard.set(false);
    await this.refreshMembers();
  }

  onCharacterCancelled() {
    this.showWizard.set(false);
  }

  // Quick view/edit of HP, rest, equipment, and spell prep — same as
  // DmCampaignHubComponent.viewMember.
  async viewMember(member: CampaignMember) {
    this.sheetCharacter.set(await this.characterService.getCharacter(member.character_id));
  }

  async onCharacterSheetSaved(character: Character) {
    this.sheetCharacter.set(character);
    await this.refreshMembers();
  }

  closeCharacterSheet() {
    this.sheetCharacter.set(null);
  }

  async toggleEditAccess(member: CampaignMember) {
    await this.campaignService.setMemberEditAccess(this.campaignId, member.user_id, !member.edit_unlocked);
    await this.refreshMembers();
  }

  async togglePartyVisibility(member: CampaignMember) {
    await this.campaignService.setMemberPartyVisibility(
      this.campaignId,
      member.user_id,
      member.visible_to_party === false,
    );
    await this.refreshMembers();
  }

  async removeMember(userId: string, name: string) {
    if (!await this.confirm.confirm(`Remove ${name} from this campaign? They can rejoin later with the campaign code.`, 'Remove Player')) return;
    await this.campaignService.removeMember(this.campaignId, userId);
    await this.refreshMembers();
  }

  async openDescriptionDialog() {
    const description: string | undefined = await firstValueFrom(
      this.dialog.open(DescriptionDialogComponent, {
        data: {
          title: 'Session Description',
          description: this.session()?.description ?? '',
          placeholder: "What's this session about…",
        },
        width: '480px',
      }).afterClosed(),
    );
    if (description === undefined) return;
    this.session.set(await this.sessionService.update(this.sessionId, { description: description.trim() }));
  }

  async onBackgroundFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.uploadingBackground.set(true);
    try {
      this.session.set(await this.sessionService.uploadBackground(this.sessionId, file));
    } finally {
      this.uploadingBackground.set(false);
    }
  }

  async clearBackground() {
    this.session.set(await this.sessionService.update(this.sessionId, { background_url: null }));
  }

  backToHub() {
    void this.router.navigate(['/home/campaigns/manage', this.campaignId]);
  }

  // Create (no encounter) or edit (encounter given) in EncounterFormDialogComponent — it closes
  // with `true` once something was saved, so only then refetch the list.
  async openEncounterDialog(encounter?: Encounter, event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    const saved = await firstValueFrom(
      this.dialog.open<EncounterFormDialogComponent, EncounterFormDialogData, boolean>(EncounterFormDialogComponent, {
        data: {
          campaignId: this.campaignId,
          sessionId: this.sessionId,
          monsters: this.monsters(),
          characters: this.characters(),
          encounter: encounter ?? null,
        },
        maxWidth: '95vw',
        autoFocus: false,
      }).afterClosed(),
    );
    if (saved) this.encounters.set(await this.encounterService.getBySession(this.sessionId));
  }

  async deleteEncounter(id: string, event: Event) {
    event.preventDefault();
    event.stopPropagation();
    const enc = this.encounters().find(e => e.id === id);
    if (!await this.confirm.confirm(`Delete "${enc?.name ?? 'this encounter'}"? This cannot be undone.`, 'Delete Encounter')) return;
    await this.encounterService.remove(id);
    this.encounters.set(await this.encounterService.getBySession(this.sessionId));
  }

  // Whether "Start" should be greyed out for this encounter — either something else in this
  // campaign is already active, or some row's start/stop request is in flight.
  startDisabled(encounter: Encounter): boolean {
    const active = this.activeEncounter();
    if (this.busyEncounterId()) return true;
    return !!active && active.id !== encounter.id;
  }

  async startEncounter(encounter: Encounter, event: Event) {
    event.preventDefault();
    event.stopPropagation();
    if (!encounter.id || this.startDisabled(encounter)) return;
    this.actionError.set(null);
    this.busyEncounterId.set(encounter.id);
    try {
      const started = await this.encounterService.start(encounter.id);
      this.activeEncounter.set(started);
      this.encounters.set(await this.encounterService.getBySession(this.sessionId));
    } catch (e) {
      this.actionError.set(
        e instanceof HttpErrorResponse ? (e.error?.message ?? e.message) : 'Could not start this encounter.',
      );
    } finally {
      this.busyEncounterId.set(null);
    }
  }

  async stopEncounter(encounter: Encounter, event: Event) {
    event.preventDefault();
    event.stopPropagation();
    if (!encounter.id || this.busyEncounterId()) return;
    this.actionError.set(null);
    this.busyEncounterId.set(encounter.id);
    try {
      await this.encounterService.stop(encounter.id);
      this.activeEncounter.set(null);
      this.encounters.set(await this.encounterService.getBySession(this.sessionId));
    } catch (e) {
      this.actionError.set(
        e instanceof HttpErrorResponse ? (e.error?.message ?? e.message) : 'Could not stop this encounter.',
      );
    } finally {
      this.busyEncounterId.set(null);
    }
  }

  async toggleVisibility(encounter: Encounter, event: Event) {
    event.preventDefault();
    event.stopPropagation();
    await this.encounterService.setVisibility(encounter.id!, !encounter.visible_to_players);
    this.encounters.set(await this.encounterService.getBySession(this.sessionId));
  }

  monsterName(index: string): string {
    return this.monsters().find(m => m.index === index)?.name ?? index;
  }

  characterName(id: string): string {
    return this.characters().find(c => c.id === id)?.name ?? 'Unknown';
  }

  formatDate(iso?: string): string {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }
}
