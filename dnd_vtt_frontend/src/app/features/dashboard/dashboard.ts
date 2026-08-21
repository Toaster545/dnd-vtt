import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CharacterService } from '../../core/services/character.service';
import { CampaignService } from '../../core/services/campaign.service';
import { ContentService } from '../../core/services/content.service';
import { CharacterStatsService } from '../../core/services/character-stats.service';
import { RecentActivityService } from '../../core/services/recent-activity.service';
import { ClassChoiceSource } from '../../core/utils/character-effects';
import { Character } from '../../core/models/character.model';
import { Campaign } from '../../core/models/campaign.model';
import { AuthService } from '../../core/services/auth.service';
import { portraitDataUri, portraitSource } from '../../core/utils/avatar';

type DashboardCharacter = Character & { campaign_name?: string; edit_unlocked?: boolean };
type CampaignCopy = DashboardCharacter & { campaign_name: string; edit_unlocked: boolean };

interface LevelUpAlert {
  character: CampaignCopy;
}

function toContentIndex(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

function lastTouched(c: Character): number {
  return new Date(c.updated_at ?? c.created_at ?? 0).getTime();
}

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, MatIconModule, MatTooltipModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class DashboardComponent implements OnInit {
  private characterService = inject(CharacterService);
  private campaignService  = inject(CampaignService);
  private content          = inject(ContentService);
  private statsService     = inject(CharacterStatsService);
  private recentActivity   = inject(RecentActivityService);
  private auth             = inject(AuthService);
  private router           = inject(Router);

  loading = signal(true);
  characters = signal<DashboardCharacter[]>([]);
  campaigns = signal<Campaign[]>([]);
  pinnedCharacterIds = signal(new Set<string>());
  pinnedCampaignIds = signal(new Set<string>());
  levelUpAlerts   = signal<LevelUpAlert[]>([]);
  hasAnyCharacters = signal(false);
  hasAnyCampaigns  = signal(false);

  latestCharacter = computed(() => this.characters().find(character => character.creation_status !== 'draft') ?? null);
  latestCampaign = computed(() => this.campaigns()[0] ?? null);
  recentCharacters = computed(() => this.characters().slice(0, 3));
  recentCampaigns = computed(() => this.campaigns().slice(0, 3));
  pinnedCharacters = computed(() => this.characters().filter(character => character.id && this.pinnedCharacterIds().has(character.id)));
  pinnedCampaigns = computed(() => this.campaigns().filter(campaign => this.pinnedCampaignIds().has(campaign.id)));
  draftCharacters = computed(() => this.characters().filter(character => character.creation_status === 'draft'));
  attentionCount = computed(() => this.draftCharacters().length + this.levelUpAlerts().length);

  async ngOnInit() {
    this.loading.set(true);
    try {
      const [templates, copies, campaigns] = await Promise.all([
        this.characterService.getMyCharacters(),
        this.characterService.getMyCampaignCopies(),
        this.campaignService.getAll(),
      ]);

      this.hasAnyCharacters.set(templates.length > 0 || copies.length > 0);
      this.hasAnyCampaigns.set(campaigns.length > 0);

      const allCharacters = [...copies, ...templates].sort((a, b) => lastTouched(b) - lastTouched(a));
      this.characters.set(this.recentActivity.sortByRecentlyViewed(allCharacters));
      this.campaigns.set(this.recentActivity.sortCampaignsByRecentlyViewed(
        [...campaigns].sort((a, b) => new Date(b.updated_at ?? b.created_at ?? 0).getTime() - new Date(a.updated_at ?? a.created_at ?? 0).getTime()),
      ));
      this.loadFavorites();

      this.levelUpAlerts.set(await this.findLevelUpAlerts(copies));
    } finally {
      this.loading.set(false);
    }
  }

  // Same "recomputed suggested max HP vs. the stored value" staleness check
  // DmCampaignHubComponent.loadMemberMaxHp uses — a mismatch means this character's sheet hasn't
  // been resaved since its level last changed (e.g. a DM bulk level-up), so features/HP are stale.
  private async findLevelUpAlerts(copies: CampaignCopy[]): Promise<LevelUpAlert[]> {
    if (!copies.length) return [];

    const [feats, items, backgrounds] = await Promise.all([
      this.content.getFeats(), this.content.getItems(), this.content.getBackgrounds(),
    ]);
    const classCache = new Map<string, Awaited<ReturnType<ContentService['getClass']>> | null>();
    const raceCache  = new Map<string, Awaited<ReturnType<ContentService['getRace']>> | null>();

    const loadClass = async (index: string) => {
      if (!classCache.has(index)) classCache.set(index, await this.content.getClass(index).catch(() => null));
      return classCache.get(index)!;
    };
    const loadRace = async (index: string) => {
      if (!raceCache.has(index)) raceCache.set(index, await this.content.getRace(index).catch(() => null));
      return raceCache.get(index)!;
    };

    const alerts: LevelUpAlert[] = [];
    for (const char of copies) {
      const [classData, raceData] = await Promise.all([
        loadClass(toContentIndex(char.class)),
        loadRace(toContentIndex(char.race)),
      ]);
      const primary = char.classes?.[0];
      const classesForFeats: ClassChoiceSource[] = classData ? [{
        data: classData,
        choices: primary?.choices ?? {},
        level: primary?.level ?? char.level,
        subclass: primary?.subclass ?? char.subclass,
      }] : [];
      const backgroundData = backgrounds.find(background =>
        background.index === toContentIndex(char.background) || background.name === char.background) ?? null;
      const stats = this.statsService.compute(
        char, classData, raceData, feats, classesForFeats, items, backgroundData,
      );
      if (stats.suggested_max_hp !== char.max_hp) alerts.push({ character: char });
    }
    return alerts;
  }

  campaignLink(campaign: Campaign): string[] {
    return campaign.is_owner ? ['/home/campaigns/manage', campaign.id] : ['/home/campaigns', campaign.id];
  }

  characterLink(character: Character): string[] {
    return character.creation_status === 'draft'
      ? ['/home/characters', character.id!, 'edit']
      : ['/home/characters', character.id!];
  }

  draftLink(character: Character): string[] {
    return ['/home/characters', character.id!, 'edit'];
  }

  classLabel(c: Character): string {
    return c.subclass ? `${c.subclass} (${c.class})` : c.class;
  }

  portraitFor(character: Character): string {
    return portraitDataUri(portraitSource(character.portrait_seed || character.id!, character.avatar_recipe));
  }

  formatDate(iso?: string): string {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  goToCharacters() {
    void this.router.navigate(['/home/characters']);
  }

  goToCampaigns() {
    void this.router.navigate(['/home/campaigns']);
  }

  goToNewCharacter() {
    void this.router.navigate(['/home/characters/new']);
  }

  goToCampaignAction(action: 'create' | 'join') {
    void this.router.navigate(['/home/campaigns'], { queryParams: { action } });
  }

  isCharacterPinned(character: Character): boolean {
    return !!character.id && this.pinnedCharacterIds().has(character.id);
  }

  isCampaignPinned(campaign: Campaign): boolean {
    return this.pinnedCampaignIds().has(campaign.id);
  }

  toggleCharacterPin(character: Character, event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (!character.id) return;
    const next = new Set(this.pinnedCharacterIds());
    if (next.has(character.id)) next.delete(character.id);
    else next.add(character.id);
    this.pinnedCharacterIds.set(next);
    this.saveFavorites();
  }

  toggleCampaignPin(campaign: Campaign, event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    const next = new Set(this.pinnedCampaignIds());
    if (next.has(campaign.id)) next.delete(campaign.id);
    else next.add(campaign.id);
    this.pinnedCampaignIds.set(next);
    this.saveFavorites();
  }

  private favoritesKey(): string {
    return `natone-dashboard-favorites:${this.auth.profile()?.id ?? 'local'}`;
  }

  private loadFavorites() {
    try {
      const saved = JSON.parse(localStorage.getItem(this.favoritesKey()) ?? '{}') as {
        characters?: string[];
        campaigns?: string[];
      };
      this.pinnedCharacterIds.set(new Set(saved.characters ?? []));
      this.pinnedCampaignIds.set(new Set(saved.campaigns ?? []));
    } catch {
      this.pinnedCharacterIds.set(new Set());
      this.pinnedCampaignIds.set(new Set());
    }
  }

  private saveFavorites() {
    localStorage.setItem(this.favoritesKey(), JSON.stringify({
      characters: [...this.pinnedCharacterIds()],
      campaigns: [...this.pinnedCampaignIds()],
    }));
  }

}
