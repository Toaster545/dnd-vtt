import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { BackgroundService } from './core/services/background.service';
import { ColorSchemeService } from './core/services/color-scheme.service';
import { UiScaleService } from './core/services/ui-scale.service';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        { provide: BackgroundService, useValue: {} },
        { provide: ColorSchemeService, useValue: {} },
        { provide: UiScaleService, useValue: {} },
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the application router outlet', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('router-outlet')).toBeTruthy();
  });
});
