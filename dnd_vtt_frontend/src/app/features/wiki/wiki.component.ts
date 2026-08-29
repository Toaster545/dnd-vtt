import { Component, DestroyRef, computed, inject } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { WikiWorkspaceComponent } from './wiki-workspace.component';

// Full-page wiki route (`/home/campaigns[/manage]/:campaignId/wiki[/:slug]`). A thin shell around
// `WikiWorkspaceComponent`: it reads `campaignId` / `wikiDm` / `slug` from the route and keeps the
// workspace's current page in sync with the URL. The workspace itself is routing-free so the hubs
// can embed it (see `WikiEmbedComponent`).
@Component({
  selector: 'app-wiki',
  imports: [WikiWorkspaceComponent],
  template: `<app-wiki-workspace
    [campaignId]="campaignId"
    [isDm]="isDm"
    [slug]="routeSlug()"
    (slugChange)="onSlugChange($event)"
  />`,
  host: { class: 'flex flex-1 min-h-0 overflow-hidden' },
})
export class WikiComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  readonly campaignId: string = this.route.snapshot.paramMap.get('campaignId')!;
  readonly isDm: boolean = !!this.route.snapshot.data['wikiDm'];
  private readonly wikiBase = this.isDm
    ? ['/home/campaigns/manage', this.campaignId, 'wiki']
    : ['/home/campaigns', this.campaignId, 'wiki'];

  private paramMap = toSignal(
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)),
    { initialValue: this.route.snapshot.paramMap },
  );
  readonly routeSlug = computed(() => this.paramMap()?.get('slug') ?? null);

  onSlugChange(slug: string | null): void {
    if (slug === this.routeSlug()) return;
    void this.router.navigate(slug ? [...this.wikiBase, slug] : this.wikiBase);
  }
}
