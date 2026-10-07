import { Component, inject, input, computed } from '@angular/core';
import { UiScaleService } from '../../../core/services/ui-scale.service';
import { TokenBorderPreviewComponent } from '../../avatar-creator-dialog/token-border-preview';
import { TokenBorder } from '../../../core/models/token-border.model';
import { DEFAULT_TOKEN_BORDER, normalizeTokenBorder } from '../../../core/utils/token-border';

// Every place a character's portrait is shown (party list, dashboard, character list, sheet
// header, DM token detail) routes through here so the `portrait_use_token` toggle (see
// AvatarCreatorDialogComponent's Token tab) only has to be handled once: when on, the portrait
// IS the battle-map token — the same drawBorderedToken() the map uses, border ring and all, with
// the character's own crop/zoom and the popped-out head breaking over the top of the ring. The
// token fills a size x size square at full size; when a zoomed-in face pops out,
// TokenBorderPreviewComponent lets it overflow above the square (without growing the layout box)
// rather than shrinking the token, so hosts must NOT wrap this in an `overflow-hidden
// rounded-full` clip or they'll crop the pop-out. When the toggle is off it's a plain circular
// <img>. Layout classes (flex-shrink-0, ...) can go directly on the <app-character-portrait> tag
// like any other host element.
// A token portrait is drawn this much larger than the plain portrait it replaces at the same
// `size`: the ring (and, with a thick border, the face inset inside it) eats into the box, so at
// the plain size the face would read as noticeably smaller. Hosts that size a wrapper around the
// portrait (the sheet and wizard buttons) use tokenPortraitSize() so they track the same value.
export const TOKEN_PORTRAIT_SCALE = 1.4;

// Portraits are sized in px, which the interface-size setting (a root font-size change, see
// UiScaleService) doesn't touch — so the component multiplies by `uiScale` (a percentage) itself.
export function tokenPortraitSize(size: number, uiScale = 100): number {
  return Math.round((size * TOKEN_PORTRAIT_SCALE * uiScale) / 100);
}

@Component({
  selector: 'app-character-portrait',
  imports: [TokenBorderPreviewComponent],
  template: `
    @if (useToken()) {
      <app-token-border-preview
        [imageSrc]="imageSrc()"
        [border]="effectiveBorder()"
        [size]="tokenSize()"
        [cells]="1"
        [transparent]="true"
        [showBorder]="true"
        [label]="label()"
      />
    } @else {
      <img
        [src]="imageSrc()"
        [style.width.px]="plainSize()"
        [style.height.px]="plainSize()"
        class="rounded-full object-cover"
        [alt]="label()"
      />
    }
  `,
  styles: `
    :host {
      display: inline-block;
      line-height: 0;
    }
  `,
})
export class CharacterPortraitComponent {
  readonly imageSrc = input.required<string>();
  readonly border = input<TokenBorder | null | undefined>(null);
  readonly useToken = input(false);
  readonly size = input(40);
  readonly label = input('');

  // Callers pass the character's stored border as-is, which may predate newer fields (zoom,
  // pop-out ranges); normalizing fills those in so the drawing code can rely on a full border.
  readonly effectiveBorder = computed(
    () => normalizeTokenBorder(this.border()) ?? DEFAULT_TOKEN_BORDER,
  );
  private readonly uiScale = inject(UiScaleService);
  readonly plainSize = computed(() => Math.round((this.size() * this.uiScale.current()) / 100));
  readonly tokenSize = computed(() => tokenPortraitSize(this.size(), this.uiScale.current()));
}
