import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Campaign, CampaignHub, CampaignMember } from '../models/campaign.model';

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

  create(name: string, description: string): Promise<CampaignHub> {
    return firstValueFrom(this.http.post<CampaignHub>(`${API}/campaigns`, { name, description }));
  }

  remove(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${API}/campaigns/${id}`));
  }

  join(joinCode: string, characterId: string): Promise<CampaignHub> {
    return firstValueFrom(
      this.http.post<CampaignHub>(`${API}/campaigns/join`, { joinCode, characterId }),
    );
  }

  getMembers(campaignId: string): Promise<CampaignMember[]> {
    return firstValueFrom(this.http.get<CampaignMember[]>(`${API}/campaigns/${campaignId}/members`));
  }

  removeMember(campaignId: string, userId: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${API}/campaigns/${campaignId}/members/${userId}`));
  }
}
