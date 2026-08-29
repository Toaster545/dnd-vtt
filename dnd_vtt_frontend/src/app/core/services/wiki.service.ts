import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  CreateWikiPagePayload,
  UpdateWikiPagePayload,
  WikiGraph,
  WikiPage,
  WikiPageResponse,
  WikiPageSummary,
  WikiSearchHit,
} from '../models/wiki.model';

const API = environment.apiUrl;

@Injectable({ providedIn: 'root' })
export class WikiService {
  private http = inject(HttpClient);

  tree(campaignId: string): Promise<WikiPageSummary[]> {
    return firstValueFrom(
      this.http.get<WikiPageSummary[]>(`${API}/wiki`, { params: { campaignId } }),
    );
  }

  page(campaignId: string, slug: string): Promise<WikiPageResponse> {
    return firstValueFrom(
      this.http.get<WikiPageResponse>(`${API}/wiki/${campaignId}/page/${slug}`),
    );
  }

  search(campaignId: string, q: string): Promise<WikiSearchHit[]> {
    return firstValueFrom(
      this.http.get<WikiSearchHit[]>(`${API}/wiki/${campaignId}/search`, {
        params: { q },
      }),
    );
  }

  graph(campaignId: string): Promise<WikiGraph> {
    return firstValueFrom(this.http.get<WikiGraph>(`${API}/wiki/${campaignId}/graph`));
  }

  create(payload: CreateWikiPagePayload): Promise<WikiPageResponse> {
    return firstValueFrom(this.http.post<WikiPageResponse>(`${API}/wiki`, payload));
  }

  update(id: string, patch: UpdateWikiPagePayload): Promise<WikiPageResponse> {
    return firstValueFrom(
      this.http.put<WikiPageResponse>(`${API}/wiki/${id}`, patch),
    );
  }

  remove(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${API}/wiki/${id}`));
  }

  /** Upload an image into the campaign-wide wiki bucket; resolves to its `/uploads/...` URL. */
  uploadImage(campaignId: string, file: File): Promise<string> {
    const form = new FormData();
    form.append('file', file);
    return firstValueFrom(
      this.http.post<{ url: string }>(`${API}/wiki/${campaignId}/upload`, form),
    ).then((res) => res.url);
  }

  // Re-exported for callers that want the page shape without the wrapper.
  static unwrap(res: WikiPageResponse): WikiPage {
    return res.page;
  }
}
