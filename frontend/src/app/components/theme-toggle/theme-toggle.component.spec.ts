import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ThemeToggleComponent } from './theme-toggle.component';
import { ThemeService } from '../../services/theme.service';

describe('ThemeToggleComponent', () => {
  let component: ThemeToggleComponent;
  let fixture: ComponentFixture<ThemeToggleComponent>;
  let themeService: ThemeService;

  beforeEach(async () => {
    // Mock matchMedia for jsdom
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    await TestBed.configureTestingModule({
      imports: [ThemeToggleComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ThemeToggleComponent);
    component = fixture.componentInstance;
    themeService = TestBed.inject(ThemeService);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have themeService injected', () => {
    expect(component.themeService).toBeTruthy();
  });

  it('should call toggleTheme on service', () => {
    const spy = vi.spyOn(themeService, 'toggleTheme');
    component.toggleTheme();
    expect(spy).toHaveBeenCalled();
  });
});
