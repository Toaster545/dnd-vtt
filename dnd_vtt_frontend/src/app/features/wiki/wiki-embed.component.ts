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
      [preferredTitles]="matchTitles()"
      (slugChange)="onSlug($event)"
    />
  `,
})
export class WikiEmbedComponent implements OnInit {
  readonly campaignId = input.required<string>();
  readonly dm = input(false);
  /** Display names this hub should prefer as the default page — the session name, then the
   *  campaign name. See `WikiWorkspaceComponent.preferredTitles`. */
  readonly matchTitles = input<string[]>([]);
  /** Extra key segment so a hub keeps its own "last viewed page" memory instead of every hub in
   *  the campaign sharing one — pass the session id on a session hub, leave unset elsewhere. */
  readonly scope = input('');

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
    const base = `wiki:embed:last:${this.campaignId()}`;
    return this.scope() ? `${base}:${this.scope()}` : base;
  }
}
