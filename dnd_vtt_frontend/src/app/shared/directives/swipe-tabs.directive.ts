import { Directive, output } from '@angular/core';

// Detects a horizontal touch swipe over the host element and reports which way it went, so a
// tabbed view can advance/retreat like a carousel on touch devices (iPad/phone). Touch-only —
// deliberately not pointer/mouse events — so desktop click-drag and text selection are untouched.
// We don't preventDefault, so vertical scrolling inside the host keeps working; a swipe only
// fires once the gesture clears a minimum horizontal distance while staying mostly horizontal,
// which keeps an ordinary vertical scroll (even one with some sideways drift) from being
// mistaken for a tab change.
const MIN_DISTANCE = 50; // px of horizontal travel required to count as a swipe
const MAX_OFF_AXIS = 60; // px of vertical drift still tolerated as "horizontal"

@Directive({
  selector: '[appSwipeTabs]',
  standalone: true,
  host: {
    '(touchstart)': 'onTouchStart($event)',
    '(touchend)': 'onTouchEnd($event)',
  },
})
export class SwipeTabsDirective {
  readonly swipeLeft = output<void>();
  readonly swipeRight = output<void>();

  private startX = 0;
  private startY = 0;
  private tracking = false;

  onTouchStart(event: TouchEvent) {
    // A second finger joining (pinch-zoom etc.) means this isn't a tab swipe — bail out.
    if (event.touches.length !== 1) {
      this.tracking = false;
      return;
    }
    this.startX = event.touches[0].clientX;
    this.startY = event.touches[0].clientY;
    this.tracking = true;
  }

  onTouchEnd(event: TouchEvent) {
    if (!this.tracking) return;
    this.tracking = false;

    const touch = event.changedTouches[0];
    if (!touch) return;

    const dx = touch.clientX - this.startX;
    const dy = touch.clientY - this.startY;
    if (Math.abs(dx) < MIN_DISTANCE || Math.abs(dy) > MAX_OFF_AXIS) return;

    if (dx < 0) this.swipeLeft.emit();
    else this.swipeRight.emit();
  }
}
