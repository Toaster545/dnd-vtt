import { Directive, output } from '@angular/core';

// A thin draggable divider — sits as a flex sibling between a resizable panel and its neighbor.
// Emits the pointer's horizontal movement per drag frame; the consumer decides the sign (does
// dragging right grow or shrink its own panel, since that depends on which side the panel is on)
// and clamps to whatever min/max width makes sense for it.
@Directive({
  selector: '[appResizeHandle]',
  standalone: true,
  host: {
    class: 'cursor-col-resize select-none',
    '(pointerdown)': 'onPointerDown($event)',
  },
})
export class ResizeHandleDirective {
  readonly resizeDrag = output<number>();

  onPointerDown(event: PointerEvent) {
    event.preventDefault();
    const target = event.target as HTMLElement;
    // Capturing on the handle itself (rather than adding document-level listeners) means drag
    // events keep reaching us even once the pointer moves off the 6px-wide handle mid-drag.
    target.setPointerCapture(event.pointerId);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (e: PointerEvent) => this.resizeDrag.emit(e.movementX);
    const onUp = () => {
      target.releasePointerCapture(event.pointerId);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
    };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
  }
}
