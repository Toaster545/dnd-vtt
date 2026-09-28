import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CampaignService } from '../../../../core/services/campaign.service';
import { CharacterService } from '../../../../core/services/character.service';
import { AuthService } from '../../../../core/services/auth.service';
import { RecentActivityService } from '../../../../core/services/recent-activity.service';
import { CampaignHub, CampaignMember } from '../../../../core/models/campaign.model';
import { Character } from '../../../../core/models/character.model';
import { WikiEmbedComponent } from '../../../wiki/wiki-embed.component';
import { PartyListComponent } from '../../../../shared/components/party-list/party-list';
import { CharacterWizardComponent } from '../../../characters/character-wizard/character-wizard';
import { CharacterPlaySheetComponent } from '../../../characters/character-play-sheet/character-play-sheet';
import { PlayerContextService } from '../../../../core/services/player-context.service';
import { ConfirmService } from '../../../../shared/confirm.service';
import { HubViewService } from '../../../../core/services/hub-view.service';
import { ResizeHandleDirective } from '../../../../shared/directives/resize-handle.directive';

@Component({
  selector: 'app-player-campaign-hub',
  imports: [
    RouterLink, MatIconModule, MatTooltipModule, WikiEmbedComponent, PartyListComponent, CharacterWizardComponent,
    CharacterPlaySheetComponent, ResizeHandleDirective,
  ],
  templateUrl: './player-campaign-hub.html',
  // Routed in via player-shell's <router-outlet>, so without a host sizing class this stays an
  // unstyled inline element and the template's flex-1/min-h-0/overflow-y-auto root div has no
  // bounded parent to size against — it just grows to content height instead of filling the
  // screen. Same fix as DmCampaignHubComponent / DmCampaignSessionComponent / PlayerCampaignSessionComponent.
  host: { class: 'flex flex-col flex-1 min-h-0 overflow-hidden' },
})
export class PlayerCampaignHubComponent implements OnInit {
  private route            = inject(ActivatedRoute);
  private router           = inject(Router);
  private campaignService  = inject(CampaignService);
  private characterService = inject(CharacterService);
  private recentActivity   = inject(RecentActivityService);
  private playerContext    = inject(PlayerContextService);
  private confirm          = inject(ConfirmService);
  auth                     = inject(AuthService);
  hubView                  = inject(HubViewService);

  campaignId = this.route.snapshot.paramMap.get('campaignId')!;

  campaign = signal<CampaignHub | null>(null);
  loading  = signal(true);

  // The embedded wiki panel lands on a page named after this campaign, if one exists.
  readonly wikiTitles = computed(() => {
    const c = this.campaign();
    return c ? [c.name] : [];
  });
  leaving  = signal(false);
  leaveError = signal('');

  // This campaign's copy of the player's character, shown inline in the main column when the
  // Wiki/Character tabs next to the title are set to Character (see HubViewService).
  readonly myCharacterId = computed(() =>
    this.campaign()?.members.find(m => m.user_id === this.auth.profile()?.id)?.character_id ?? null,
  );
  myCharacter = signal<Character | null>(null);
  readonly showSheet = computed(() => this.hubView.current() === 'sheet' && !!this.myCharacterId());

  editingCharacter = signal<Character | null>(null);
  showWizard       = signal(false);
  sheetCharacter = signal<Character | null>(null);
  // Set only when the sheet was opened via the wizard's "View Sheet" button (as opposed to
  // viewMyCharacter) — routes closeCharacterSheet() back into the wizard instead of the hub.
  sheetFromWizard = signal(false);

  async ngOnInit() {
    this.recentActivity.markCampaignViewed(this.campaignId);
    const [campaign] = await Promise.all([
      this.campaignService.getById(this.campaignId),
      this.playerContext.selectCampaign(this.campaignId),
    ]);
    this.campaign.set(campaign);
    this.loading.set(false);
    void this.loadMyCharacter();
  }

  // The drag handle sits left of the sidebar, so dragging left (negative dx) widens it.
  onSidebarResize(dx: number) {
    this.hubView.setSidebarWidth(this.hubView.sidebarWidth() - dx);
  }

  private async loadMyCharacter() {
    const id = this.myCharacterId();
    this.myCharacter.set(id ? await this.characterService.getCharacter(id) : null);
  }

  // The inline sheet's (saved) — same Party-roster refresh as onCharacterSheetSaved, without
  // opening the full-page sheet.
  async onMyCharacterSaved(character: Character) {
    this.myCharacter.set(character);
    this.campaign.set(await this.campaignService.getById(this.campaignId));
  }

  backToList() {
    void this.router.navigate(['/home/campaigns']);
  }

  async leaveCampaign() {
    if (this.leaving()) return;
    const confirmed = await this.confirm.confirm(
      'Leave this campaign? Your campaign character will be kept as a standalone character, and your original character will remain unchanged.',
      'Leave campaign',
      'Leave',
    );
    if (!confirmed) return;

    this.leaving.set(true);
    this.leaveError.set('');
    try {
      await this.campaignService.leave(this.campaignId);
      await this.playerContext.clearCampaign();
      await this.router.navigate(['/home/campaigns']);
    } catch (error: unknown) {
      const response = error as { error?: { message?: string | string[] } };
      const message = response.error?.message;
      this.leaveError.set(
        Array.isArray(message) ? message.join(' ') : message ?? 'Could not leave this campaign.',
      );
    } finally {
      this.leaving.set(false);
    }
  }

  // The DM grants this per member (see DmCampaignHubComponent.toggleEditAccess) — otherwise a
  // player's campaign copy only accepts the play sheet's limited HP/rest/equipment writes.
  async editMyCharacter(member: CampaignMember) {
    this.editingCharacter.set(await this.characterService.getCharacter(member.character_id));
    this.showWizard.set(true);
  }

  // Player's own choice, hidden from the rest of the party by default (see CampaignsService V14
  // migration / setOwnRaceClassVisibility) — the DM always sees it regardless of this toggle.
  async toggleRaceClassVisibility(member: CampaignMember) {
    this.campaign.set(
      await this.campaignService.setOwnRaceClassVisibility(this.campaignId, !member.show_race_class),
    );
  }

  async onCharacterSaved() {
    this.showWizard.set(false);
    this.campaign.set(await this.campaignService.getById(this.campaignId));
    void this.loadMyCharacter();
  }

  onCharacterCancelled() {
    this.showWizard.set(false);
  }

  async onViewCharacterSheet(id: string) {
    this.showWizard.set(false);
    this.sheetFromWizard.set(true);
    this.sheetCharacter.set(await this.characterService.getCharacter(id));
  }

  async viewMyCharacter(member: CampaignMember) {
    this.sheetFromWizard.set(false);
    this.sheetCharacter.set(await this.characterService.getCharacter(member.character_id));
  }

  levelUpMyCharacter(member: CampaignMember) {
    void this.router.navigate(['/home/characters', member.character_id, 'level-up']);
  }

  // The play sheet's (saved) emits the updated character after every persist — keep the sheet in
  // sync and refresh the Party roster's HP/AC badges to match, but stay on the sheet (unlike the
  // wizard's onCharacterSaved, which navigates back to the hub).
  async onCharacterSheetSaved(character: Character) {
    this.sheetCharacter.set(character);
    if (character.id === this.myCharacterId()) this.myCharacter.set(character);
    this.campaign.set(await this.campaignService.getById(this.campaignId));
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

  formatDate(iso?: string): string {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }
}
