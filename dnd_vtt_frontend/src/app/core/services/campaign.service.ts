import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Campaign, CampaignHub, CampaignJoinPreview, CampaignMember } from '../models/campaign.model';

const API = environment.apiUrl;

@Injectable({ providedIn: 'root' })
export class CampaignService {
  private http = inject(HttpClient);

  getAll(): Promise<Campaign[]> {
    return firstValueFrom(this.http.get<Campaign[]>(`${API}/campaigns`));
  }

  getById(id: string): Promise<CampaignHub> {
    return firstValueFrom(this.http.get<CampaignHub>(`${API}/campaigns/${id}`));
  }

  create(name: string, description: string, allowedSources: string[]): Promise<CampaignHub> {
    return firstValueFrom(this.http.post<CampaignHub>(`${API}/campaigns`, {
      name, description, allowed_sources: allowedSources,
    }));
  }

  update(id: string, patch: { description?: string; background_url?: string | null; allowed_sources?: string[] }): Promise<CampaignHub> {
    return firstValueFrom(this.http.patch<CampaignHub>(`${API}/campaigns/${id}`, patch));
  }

  uploadBackground(id: string, file: File): Promise<CampaignHub> {
    const form = new FormData();
    form.append('file', file);
    return firstValueFrom(this.http.post<CampaignHub>(`${API}/campaigns/${id}/background`, form));
  }

  remove(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${API}/campaigns/${id}`));
  }

  join(joinCode: string, characterId: string): Promise<CampaignHub> {
    return firstValueFrom(
      this.http.post<CampaignHub>(`${API}/campaigns/join`, { joinCode, characterId }),
    );
  }

  previewJoin(joinCode: string): Promise<CampaignJoinPreview> {
    return firstValueFrom(
      this.http.get<CampaignJoinPreview>(`${API}/campaigns/join-preview/${joinCode.trim().toUpperCase()}`),
    );
  }

  getMembers(campaignId: string): Promise<CampaignMember[]> {
    return firstValueFrom(this.http.get<CampaignMember[]>(`${API}/campaigns/${campaignId}/members`));
  }

  removeMember(campaignId: string, userId: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${API}/campaigns/${campaignId}/members/${userId}`));
  }

  setMemberEditAccess(campaignId: string, userId: string, unlocked: boolean): Promise<{ edit_unlocked: boolean }> {
    return firstValueFrom(
      this.http.patch<{ edit_unlocked: boolean }>(
        `${API}/campaigns/${campaignId}/members/${userId}/edit-access`,
        { unlocked },
      ),
    );
  }

  setMemberPartyVisibility(campaignId: string, userId: string, visible: boolean): Promise<{ visible_to_party: boolean }> {
    return firstValueFrom(
      this.http.patch<{ visible_to_party: boolean }>(
        `${API}/campaigns/${campaignId}/members/${userId}/party-visibility`,
        { visible },
      ),
    );
  }

  setPartyLevel(campaignId: string, level: number): Promise<CampaignHub> {
    return firstValueFrom(
      this.http.patch<CampaignHub>(`${API}/campaigns/${campaignId}/party-level`, { level }),
    );
  }

  setOwnRaceClassVisibility(campaignId: string, visible: boolean): Promise<CampaignHub> {
    return firstValueFrom(
      this.http.patch<CampaignHub>(
        `${API}/campaigns/${campaignId}/members/me/race-class-visibility`,
        { visible },
      ),
    );
  }
}
