import { TestBed } from '@angular/core/testing';
import { CharacterPortraitComponent } from './character-portrait';
import { DEFAULT_TOKEN_BORDER } from '../../../core/utils/token-border';

const SRC = '/uploads/portraits/user-1/portrait.webp';

describe('CharacterPortraitComponent', () => {
  function render(useToken: boolean) {
    const fixture = TestBed.createComponent(CharacterPortraitComponent);
    fixture.componentRef.setInput('imageSrc', SRC);
    fixture.componentRef.setInput('useToken', useToken);
    fixture.componentRef.setInput('border', DEFAULT_TOKEN_BORDER);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  afterEach(() => TestBed.resetTestingModule());

  it('shows the full bordered token (not a plain img) when useToken is on', () => {
    const el = render(true);
    expect(el.querySelector('app-token-border-preview')).toBeTruthy();
    expect(el.querySelector('img')).toBeNull();
  });

  it('shows a plain circular img when useToken is off', () => {
    const el = render(false);
    const img = el.querySelector('img');
    expect(img).toBeTruthy();
    expect(img!.getAttribute('src')).toBe(SRC);
    expect(el.querySelector('app-token-border-preview')).toBeNull();
  });

  it('falls back to the default border when none is supplied', () => {
    const fixture = TestBed.createComponent(CharacterPortraitComponent);
    fixture.componentRef.setInput('imageSrc', SRC);
    fixture.componentRef.setInput('useToken', true);
    fixture.detectChanges();
    expect(fixture.componentInstance.effectiveBorder()).toEqual(DEFAULT_TOKEN_BORDER);
  });

  it('fills in fields a stored border predates, such as pop-out ranges', () => {
    const fixture = TestBed.createComponent(CharacterPortraitComponent);
    fixture.componentRef.setInput('imageSrc', SRC);
    fixture.componentRef.setInput('useToken', true);
    fixture.componentRef.setInput('border', { color: '#e05252', width: 3, pattern: 'solid' });
    fixture.detectChanges();
    expect(fixture.componentInstance.effectiveBorder().popOut).toEqual([{ start: 0, end: 180 }]);
  });
});
