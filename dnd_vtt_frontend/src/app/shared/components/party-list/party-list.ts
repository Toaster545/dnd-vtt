import { Component, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CampaignMember } from '../../../core/models/campaign.model';
import { portraitDataUri } from '../../../core/utils/avatar';

// The campaign roster, shared verbatim across the DM/player campaign hubs and the DM/player
// session hubs — those four call sites previously each hand-rolled the same <ul> of member rows.
// Purely presentational: it renders whatever `members` it's given and emits an event per action
// rather than calling any service itself, so each host stays in charge of its own reload/dialog
// logic (openMember, character wizard, confirm dialogs, etc. differ per host).
@Component({
  selector: 'app-party-list',
  imports: [MatIconModule, MatTooltipModule],
  templateUrl: './party-list.html',
})
export class PartyListComponent {
  members = input<CampaignMember[]>([]);
  // Live-recomputed max HP per character_id, keyed the same as CampaignMember.character_id —
  // only the DM hub bothers computing this (see DmCampaignHubComponent.loadMemberMaxHp); every
  // other host leaves it empty and maxHpFor() falls back to the member's stored character_max_hp.
  memberMaxHp = input<Record<string, number>>({});
  currentUserId = input<string | null>(null);
  // DM-only roster management: party-visibility + edit-access toggles, remove-member button.
  showManagement = input(false);
  // Player self-service controls on their own row: race/class visibility toggle, view/edit character.
  showSelfControls = input(false);
  clickableRows = input(false);
  emptyMessage = input('No players have joined yet.');

  rowClick = output<CampaignMember>();
  toggleEditAccess = output<CampaignMember>();
  togglePartyVisibility = output<CampaignMember>();
  removeMember = output<CampaignMember>();
  toggleRaceClassVisibility = output<CampaignMember>();
  viewCharacter = output<CampaignMember>();
  editCharacter = output<CampaignMember>();

  isMe(member: CampaignMember): boolean {
    const id = this.currentUserId();
    return !!id && member.user_id === id;
  }

  // Falls back to the character id as the DiceBear seed for members created before portraits
  // existed — still deterministic per-character, just not one the player ever explicitly picked.
  portraitFor(member: CampaignMember): string {
    return portraitDataUri(member.character_portrait_seed || member.character_id);
  }

  // Prefers the live-recomputed value passed in via memberMaxHp — falls back to the stored value
  // while that computation is still in flight (or for hosts that never provide one at all).
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

  onRowClick(member: CampaignMember) {
    if (this.clickableRows()) this.rowClick.emit(member);
  }
}
