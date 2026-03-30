import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { vi } from 'vitest';
import { DomainsComponent } from './domains.component';
import { ApiService, DomainStatistics } from '../../services/api.service';
import { createSpyObj, SpyObj } from '../../../testing/mock-helpers';

describe('DomainsComponent', () => {
  let component: DomainsComponent;
  let fixture: ComponentFixture<DomainsComponent>;
  let apiService: SpyObj<ApiService>;
  let dialog: SpyObj<MatDialog>;
  let snackBar: SpyObj<MatSnackBar>;

  const mockStats: DomainStatistics[] = [
    {
      id: 'd1',
      domain: 'example.com',
      isManaged: true,
      totalMessages: 100,
      passedMessages: 90,
      failedMessages: 10,
      dmarcPassRate: 90,
      spfPassRate: 85,
      dkimPassRate: 88,
      uniqueSources: 5,
      notes: null,
    },
    {
      id: undefined as any,
      domain: 'unknown.com',
      isManaged: false,
      totalMessages: 50,
      passedMessages: 20,
      failedMessages: 30,
      dmarcPassRate: 40,
      spfPassRate: 30,
      dkimPassRate: 35,
      uniqueSources: 3,
      notes: null,
    },
  ];

  beforeEach(async () => {
    localStorage.clear();
    const apiSpy = createSpyObj('ApiService', ['getDomainStatistics', 'createDomain', 'updateDomain', 'deleteDomain']);
    apiSpy.getDomainStatistics.mockReturnValue(of(mockStats));

    await TestBed.configureTestingModule({
      imports: [DomainsComponent, BrowserAnimationsModule],
      providers: [{ provide: ApiService, useValue: apiSpy }, provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    apiService = TestBed.inject(ApiService) as SpyObj<ApiService>;

    fixture = TestBed.createComponent(DomainsComponent);
    component = fixture.componentInstance;

    // Spy on component-level injected services (provided by Material module imports)
    const dialogInstance = fixture.debugElement.injector.get(MatDialog);
    vi.spyOn(dialogInstance, 'open').mockReturnValue({ afterClosed: () => of(true) } as any);
    dialog = dialogInstance as any;

    const snackBarInstance = fixture.debugElement.injector.get(MatSnackBar);
    vi.spyOn(snackBarInstance, 'open').mockReturnValue({} as any);
    snackBar = snackBarInstance as any;

    fixture.detectChanges();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load statistics on init', () => {
    expect(apiService.getDomainStatistics).toHaveBeenCalledWith(30);
    expect(component.statistics().length).toBe(2);
  });

  it('should separate managed and unknown domains', () => {
    expect(component.managedDomains.length).toBe(1);
    expect(component.managedDomains[0].domain).toBe('example.com');
    expect(component.unknownDomains.length).toBe(1);
    expect(component.unknownDomains[0].domain).toBe('unknown.com');
  });

  it('should handle error loading statistics', () => {
    apiService.getDomainStatistics.mockReturnValue(throwError(() => new Error('Load failed')));
    component.loadStatistics();
    expect(snackBar.open).toHaveBeenCalledWith(
      'Error loading domain statistics',
      'Close',
      expect.objectContaining({ duration: 3000 })
    );
    expect(component.loading()).toBe(false);
  });

  it('should reload on daysBack change', () => {
    apiService.getDomainStatistics.mockReturnValue(of([]));
    component.daysBack = 60;
    component.onDaysBackChange();
    expect(apiService.getDomainStatistics).toHaveBeenCalledWith(60);
  });

  describe('layout', () => {
    it('should default to grid layout', () => {
      expect(component.layoutMode).toBe('grid');
    });

    it('should toggle layout', () => {
      component.toggleLayout();
      expect(component.layoutMode).toBe('list');
      component.toggleLayout();
      expect(component.layoutMode).toBe('grid');
    });

    it('should save layout preference to localStorage', () => {
      component.toggleLayout();
      expect(localStorage.getItem('domains-layout-mode')).toBe('list');
    });

    it('should load layout preference from localStorage', () => {
      localStorage.setItem('domains-layout-mode', 'list');
      component.loadLayoutPreference();
      expect(component.layoutMode).toBe('list');
    });
  });

  describe('openAddDomainDialog', () => {
    it('should open dialog and create domain on confirm', () => {
      const dialogRefSpy = { afterClosed: () => of({ domain: 'new.com' }) };
      dialog.open.mockReturnValue(dialogRefSpy as any);
      apiService.createDomain.mockReturnValue(of({ id: 'd2', domain: 'new.com', createdAt: '', updatedAt: '' }));
      apiService.getDomainStatistics.mockReturnValue(of(mockStats));

      component.openAddDomainDialog();

      expect(dialog.open).toHaveBeenCalled();
      expect(apiService.createDomain).toHaveBeenCalledWith({ domain: 'new.com' });
      expect(snackBar.open).toHaveBeenCalledWith('Domain added successfully', 'Close', expect.any(Object));
    });

    it('should not create domain when dialog is cancelled', () => {
      const dialogRefSpy = { afterClosed: () => of(undefined) };
      dialog.open.mockReturnValue(dialogRefSpy as any);

      component.openAddDomainDialog();

      expect(apiService.createDomain).not.toHaveBeenCalled();
    });

    it('should handle error when creating domain', () => {
      const dialogRefSpy = { afterClosed: () => of({ domain: 'dup.com' }) };
      dialog.open.mockReturnValue(dialogRefSpy as any);
      apiService.createDomain.mockReturnValue(throwError(() => ({ error: { message: 'Domain already exists' } })));

      component.openAddDomainDialog();

      expect(snackBar.open).toHaveBeenCalledWith('Domain already exists', 'Close', expect.any(Object));
    });
  });

  describe('addUnknownDomain', () => {
    it('should create domain from unknown list', () => {
      apiService.createDomain.mockReturnValue(of({ id: 'd3', domain: 'unknown.com', createdAt: '', updatedAt: '' }));
      apiService.getDomainStatistics.mockReturnValue(of(mockStats));

      component.addUnknownDomain('unknown.com');

      expect(apiService.createDomain).toHaveBeenCalledWith({ domain: 'unknown.com' });
      expect(snackBar.open).toHaveBeenCalledWith('Domain added to managed list', 'Close', expect.any(Object));
    });
  });

  describe('editDomain', () => {
    it('should show error if domain has no id', () => {
      component.editDomain({ ...mockStats[1], id: undefined } as any);
      expect(snackBar.open).toHaveBeenCalledWith('Domain ID not available', 'Close', expect.any(Object));
    });

    it('should open edit dialog and update domain', () => {
      const dialogRefSpy = { afterClosed: () => of({ notes: 'updated' }) };
      dialog.open.mockReturnValue(dialogRefSpy as any);
      apiService.updateDomain.mockReturnValue(of({ id: 'd1', domain: 'example.com', createdAt: '', updatedAt: '' }));
      apiService.getDomainStatistics.mockReturnValue(of(mockStats));

      component.editDomain(mockStats[0]);

      expect(apiService.updateDomain).toHaveBeenCalledWith('d1', { notes: 'updated' });
    });
  });

  describe('removeDomain', () => {
    it('should show error if domain has no id', () => {
      component.removeDomain({ ...mockStats[1], id: undefined } as any);
      expect(snackBar.open).toHaveBeenCalledWith('Domain ID not available', 'Close', expect.any(Object));
    });

    it('should confirm and delete domain', () => {
      const dialogRefSpy = { afterClosed: () => of(true) };
      dialog.open.mockReturnValue(dialogRefSpy as any);
      apiService.deleteDomain.mockReturnValue(of({ message: 'deleted' }));
      apiService.getDomainStatistics.mockReturnValue(of([]));

      component.removeDomain(mockStats[0]);

      expect(apiService.deleteDomain).toHaveBeenCalledWith('d1');
      expect(snackBar.open).toHaveBeenCalledWith('Domain removed successfully', 'Close', expect.any(Object));
    });

    it('should not delete when dialog is cancelled', () => {
      const dialogRefSpy = { afterClosed: () => of(false) };
      dialog.open.mockReturnValue(dialogRefSpy as any);

      component.removeDomain(mockStats[0]);

      expect(apiService.deleteDomain).not.toHaveBeenCalled();
    });
  });
});
