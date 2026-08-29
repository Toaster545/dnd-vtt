import { Component, OnInit, input, signal } from '@angular/core';
import { WikiWorkspaceComponent } from './wiki-workspace.component';

// The campaign wiki embedded in a campaign/session hub, replacing the old "Comments" panel. Renders
// read-only by default with an eye toggle to the full editing workspace (see
// `WikiWorkspaceComponent`), and remembers the last page viewed per campaign.
@Component({
  selector: 'app-wiki-embed',
  imports: [WikiWorkspaceComponent],
  template: `
    <app-wiki-workspace
      [campaignId]="campaignId()"
      [isDm]="dm()"
      [embedded]="true"
      [slug]="slug()"
      (slugChange)="onSlug($event)"
    />
  `,
})
export class WikiEmbedComponent implements OnInit {
  readonly campaignId = input.required<string>();
  readonly dm = input(false);

  slug = signal<string | null>(null);

  ngOnInit(): void {
    try {
      this.slug.set(localStorage.getItem(this.key()));
    } catch {
      /* ignore */
    }
  }

  onSlug(slug: string | null): void {
    this.slug.set(slug);
    try {
      if (slug) localStorage.setItem(this.key(), slug);
      else localStorage.removeItem(this.key());
    } catch {
      /* ignore */
    }
  }

  private key(): string {
    return `wiki:embed:last:${this.campaignId()}`;
  }
}
