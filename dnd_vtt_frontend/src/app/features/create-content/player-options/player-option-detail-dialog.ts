import { Component, HostListener, computed, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import {
  DndBackground,
  DndClass,
  DndFeat,
  DndRace,
  EquipmentItemRef,
  StartingEquipment,
  TraitGrant,
} from '../../../core/services/content.service';

type PlayerOption = DndRace | DndClass | DndBackground | DndFeat;

@Component({
  selector: 'app-player-option-detail-dialog',
  imports: [MatIconModule],
  templateUrl: './player-option-detail-dialog.html',
  styleUrl: './player-option-detail-dialog.scss',
})
export class PlayerOptionDetailDialogComponent {
  readonly entry = input.required<PlayerOption>();
  readonly closed = output<void>();

  readonly race = computed(() => this.isRace(this.entry()) ? this.entry() as DndRace : null);
  readonly characterClass = computed(() => this.isClass(this.entry()) ? this.entry() as DndClass : null);
  readonly background = computed(() => this.isBackground(this.entry()) ? this.entry() as DndBackground : null);
  readonly feat = computed(() => this.isFeat(this.entry()) ? this.entry() as DndFeat : null);

  @HostListener('document:keydown.escape')
  close() { this.closed.emit(); }

  sourceLabel(entry: PlayerOption): string {
    const source = entry.source;
    if (!source) return 'Published Content';
    return `${source.book}${source.page ? ` · page ${source.page}` : ''}`;
  }

  featCategory(category: DndFeat['category']): string {
    return ({ origin: 'Origin', general: 'General', fighting_style: 'Fighting Style', epic: 'Epic Boon' })[category];
  }

  prerequisiteText(feat: DndFeat): string {
    const prerequisite = feat.prerequisite;
    if (!prerequisite) return 'None';
    const parts: string[] = [];
    if (prerequisite.level) parts.push(`Level ${prerequisite.level}+`);
    if (prerequisite.abilities?.length) parts.push(`${prerequisite.abilities.join(' or ')} ${prerequisite.min ?? 13}+`);
    if (prerequisite.armorProficiency) parts.push(`${prerequisite.armorProficiency} armor training`);
    if (prerequisite.spellcasting) parts.push('Spellcasting or Pact Magic');
    if (prerequisite.feature) parts.push(prerequisite.feature);
    if (prerequisite.classes?.length) parts.push(prerequisite.classes.join(' or '));
    if (prerequisite.species?.length) parts.push(prerequisite.species.join(' or '));
    if (prerequisite.feats?.length) parts.push(`Feat: ${prerequisite.feats.join(' or ')}`);
    return parts.join(' · ') || 'Special prerequisite';
  }

  grantDetail(grant: TraitGrant): string {
    const description = 'description' in grant ? grant.description : undefined;
    if (description) return description;
    switch (grant.type) {
      case 'choice': return `Choose ${grant.choose} from ${grant.options.map(option => option.name).join(', ')}.`;
      case 'skill_choice': return `Choose ${grant.choose}${grant.skills?.length ? ` from ${grant.skills.join(', ')}` : ' skill proficiency'}.`;
      case 'expertise_choice': return `Choose ${grant.choose} skill${grant.choose === 1 ? '' : 's'} for Expertise.`;
      case 'weapon_mastery': return `Choose ${grant.choose} weapon master${grant.choose === 1 ? 'y' : 'ies'}.`;
      case 'ability_choice': return `Distribute ${grant.points} ability-score point${grant.points === 1 ? '' : 's'}.`;
      case 'feat_pick': return `Choose ${grant.choose} ${this.featCategory(grant.category)} feat${grant.choose === 1 ? '' : 's'}.`;
      case 'spell_grant': {
        const spells = grant.spells?.join(', ');
        return spells ? `Grants ${spells}.` : `Choose ${grant.choose ?? 1} spell${(grant.choose ?? 1) === 1 ? '' : 's'}${grant.list ? ` from ${grant.list}` : ''}.`;
      }
      case 'spell_list_expansion': return grant.spells?.length ? `Adds ${grant.spells.join(', ')} to the spell list.` : `Expands the spell list${grant.list ? ` with ${grant.list}` : ''}.`;
      case 'dragonmark_slot': return `One restricted spell slot, up to level ${grant.maxLevel}; recovers on a ${grant.recovery.replace('_', ' ')}.`;
      case 'companion_grant': return `Grants the ${grant.monsterIndex} companion.`;
      case 'feature': return 'Passive feature.';
    }
  }

  equipmentSummary(equipment: StartingEquipment): string[] {
    const lines: string[] = [];
    if (equipment.fixed.length) lines.push(`Fixed: ${equipment.fixed.map(item => this.equipmentItem(item)).join(', ')}`);
    for (const group of equipment.groups) lines.push(group.options.map(option => option.label).join(' or '));
    if (equipment.gold) lines.push(`${equipment.gold} gp included`);
    if (equipment.goldAlternative) lines.push(`Alternative: ${equipment.goldAlternative} gp`);
    return lines;
  }

  private equipmentItem(item: EquipmentItemRef): string {
    const quantity = item.quantity && item.quantity > 1 ? `${item.quantity}× ` : '';
    return `${quantity}${'item' in item ? item.item : item.label}`;
  }

  private isRace(entry: PlayerOption): entry is DndRace { return 'creature_type' in entry; }
  private isClass(entry: PlayerOption): entry is DndClass { return 'hit_die' in entry; }
  private isBackground(entry: PlayerOption): entry is DndBackground { return 'skill_proficiencies' in entry; }
  private isFeat(entry: PlayerOption): entry is DndFeat { return 'category' in entry; }
}
