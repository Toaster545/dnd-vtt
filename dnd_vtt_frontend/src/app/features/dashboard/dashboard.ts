import { Component, OnInit, inject, signal } from '@angular/core';
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
import { MainLayoutComponent } from '../../shared/layout/main-layout/main-layout';
import { AppHeaderComponent } from '../../shared/layout/app-header/app-header';

type CampaignCopy = Character & { campaign_name: string; edit_unlocked: boolean };

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
  imports: [RouterLink, MatIconModule, MatTooltipModule, MainLayoutComponent, AppHeaderComponent],
  templateUrl: './dashboard.html',
})
export class DashboardComponent implements OnInit {
  private characterService = inject(CharacterService);
  private campaignService  = inject(CampaignService);
  private content          = inject(ContentService);
  private statsService     = inject(CharacterStatsService);
  private recentActivity   = inject(RecentActivityService);
  private router           = inject(Router);

  loading = signal(true);
  latestCharacter = signal<(Character & { campaign_name?: string }) | null>(null);
  latestCampaign  = signal<Campaign | null>(null);
  levelUpAlerts   = signal<LevelUpAlert[]>([]);
  hasAnyCharacters = signal(false);
  hasAnyCampaigns  = signal(false);

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

      const allCharacters = [...copies, ...templates];
      if (allCharacters.length) {
        this.latestCharacter.set(
          allCharacters.reduce((best, c) => (lastTouched(c) > lastTouched(best) ? c : best)),
        );
      }

      this.latestCampaign.set(this.pickLatestCampaign(campaigns));

      this.levelUpAlerts.set(await this.findLevelUpAlerts(copies));
    } finally {
      this.loading.set(false);
    }
  }

  private pickLatestCampaign(campaigns: Campaign[]): Campaign | null {
    if (!campaigns.length) return null;
    const viewedId = this.recentActivity.lastViewedCampaignId();
    const viewed = viewedId ? campaigns.find(c => c.id === viewedId) : undefined;
    if (viewed) return viewed;
    return campaigns.reduce((best, c) =>
      new Date(c.created_at ?? 0) > new Date(best.created_at ?? 0) ? c : best,
    );
  }

  // Same "recomputed suggested max HP vs. the stored value" staleness check
  // DmCampaignHubComponent.loadMemberMaxHp uses — a mismatch means this character's sheet hasn't
  // been resaved since its level last changed (e.g. a DM bulk level-up), so features/HP are stale.
  private async findLevelUpAlerts(copies: CampaignCopy[]): Promise<LevelUpAlert[]> {
    if (!copies.length) return [];

    const [feats, items] = await Promise.all([this.content.getFeats(), this.content.getItems()]);
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
      const stats = this.statsService.compute(char, classData, raceData, feats, classesForFeats, items);
      if (stats.suggested_max_hp !== char.max_hp) alerts.push({ character: char });
    }
    return alerts;
  }

  campaignLink(campaign: Campaign): string[] {
    return campaign.is_owner ? ['/home/campaigns/manage', campaign.id] : ['/home/campaigns', campaign.id];
  }

  classLabel(c: Character): string {
    return c.subclass ? `${c.subclass} (${c.class})` : c.class;
  }

  formatDate(iso?: string): string {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  goToCharacters() {
    void this.router.navigate(['/home']);
  }

  goToCampaigns() {
    void this.router.navigate(['/home/campaigns']);
  }

  goToSettings() {
    void this.router.navigate(['/settings']);
  }
}
