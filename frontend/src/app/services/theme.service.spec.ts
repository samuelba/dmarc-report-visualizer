import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  let service: ThemeService;

  beforeEach(() => {
    localStorage.clear();
    document.body.classList.remove('dark', 'light');

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

    TestBed.configureTestingModule({
      providers: [ThemeService],
    });
    service = TestBed.inject(ThemeService);
  });

  afterEach(() => {
    localStorage.clear();
    document.body.classList.remove('dark', 'light');
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should read saved theme from localStorage', () => {
    localStorage.setItem('dmarc-theme', 'dark');
    // Re-create service to pick up localStorage
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [ThemeService] });
    const freshService = TestBed.inject(ThemeService);
    expect(freshService.isDarkMode()).toBe(true);
  });

  it('should read light theme from localStorage', () => {
    localStorage.setItem('dmarc-theme', 'light');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [ThemeService] });
    const freshService = TestBed.inject(ThemeService);
    expect(freshService.isDarkMode()).toBe(false);
  });

  it('should toggle theme', () => {
    const initial = service.isDarkMode();
    service.toggleTheme();
    expect(service.isDarkMode()).toBe(!initial);
  });

  it('should save preference to localStorage on toggle', () => {
    service.toggleTheme();
    const saved = localStorage.getItem('dmarc-theme');
    expect(saved).toBe(service.isDarkMode() ? 'dark' : 'light');
  });

  it('should set theme explicitly', () => {
    service.setTheme(true);
    expect(service.isDarkMode()).toBe(true);
    expect(localStorage.getItem('dmarc-theme')).toBe('dark');

    service.setTheme(false);
    expect(service.isDarkMode()).toBe(false);
    expect(localStorage.getItem('dmarc-theme')).toBe('light');
  });

  it('should apply dark class to body', () => {
    service.setTheme(true);
    // Effect runs synchronously in test
    TestBed.flushEffects();
    expect(document.body.classList.contains('dark')).toBe(true);
    expect(document.body.classList.contains('light')).toBe(false);
  });

  it('should apply light class to body', () => {
    service.setTheme(false);
    TestBed.flushEffects();
    expect(document.body.classList.contains('light')).toBe(true);
    expect(document.body.classList.contains('dark')).toBe(false);
  });
});
