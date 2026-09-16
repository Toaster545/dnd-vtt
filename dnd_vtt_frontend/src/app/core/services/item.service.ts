import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ContentService, DndItem } from './content.service';

const API = environment.apiUrl;

@Injectable({ providedIn: 'root' })
export class ItemService {
  private http = inject(HttpClient);
  private content = inject(ContentService);

  // The DM's own library only — never the campaign-merged set getItems() would return.
  async getMine(): Promise<DndItem[]> {
    return firstValueFrom(this.http.get<DndItem[]>(`${API}/content/items/mine`));
  }

  // The server always assigns `index` on create — callers never supply one.
  async createItem(item: Omit<DndItem, 'index'>): Promise<DndItem> {
    const created = await firstValueFrom(this.http.post<DndItem>(`${API}/content/items`, item));
    this.content.invalidateContent('items', created.index);
    return created;
  }

  async updateItem(item: DndItem): Promise<DndItem> {
    const updated = await firstValueFrom(
      this.http.put<DndItem>(`${API}/content/items/${encodeURIComponent(item.index)}`, item)
    );
    this.content.invalidateContent('items', updated.index);
    return updated;
  }

  async deleteItem(index: string): Promise<void> {
    await firstValueFrom(
      this.http.delete(`${API}/content/items/${encodeURIComponent(index)}`)
    );
    this.content.invalidateContent('items', index);
  }

  async uploadImage(index: string, file: File): Promise<DndItem> {
    const form = new FormData();
    form.append('file', file);
    const updated = await firstValueFrom(
      this.http.post<DndItem>(`${API}/content/items/${encodeURIComponent(index)}/image`, form)
    );
    this.content.invalidateContent('items', updated.index);
    return updated;
  }

  // For official SRD items (a `custom:` index goes through updateItem/uploadImage instead) —
  // swaps just the picture without forking the item into the DM's own homebrew library.
  async setImageOverride(index: string, imageUrl: string): Promise<DndItem> {
    const updated = await firstValueFrom(
      this.http.put<DndItem>(`${API}/content/items/${encodeURIComponent(index)}/image-override`, {
        image_url: imageUrl,
      })
    );
    this.content.invalidateContent('items', updated.index);
    return updated;
  }

  async clearImageOverride(index: string): Promise<DndItem> {
    const updated = await firstValueFrom(
      this.http.delete<DndItem>(`${API}/content/items/${encodeURIComponent(index)}/image-override`)
    );
    this.content.invalidateContent('items', updated.index);
    return updated;
  }
}
