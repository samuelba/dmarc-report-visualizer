import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { vi } from 'vitest';
import { SettingsComponent } from './settings.component';
import { ApiService, ThirdPartySender, ReprocessingJob } from '../../services/api.service';
import { createSpyObj, SpyObj } from '../../../testing/mock-helpers';

describe('SettingsComponent', () => {
  let component: SettingsComponent;
  let fixture: ComponentFixture<SettingsComponent>;
  let apiService: SpyObj<ApiService>;
  let dialog: SpyObj<MatDialog>;
  let snackBar: SpyObj<MatSnackBar>;

  const mockSender: ThirdPartySender = {
    id: 's1',
    name: 'Google',
    description: 'Google Workspace',
    dkimPattern: '.*google\\.com$',
    spfPattern: '.*google\\.com$',
    enabled: true,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  };

  const mockJob: ReprocessingJob = {
    id: 'j1',
    status: 'completed',
    totalRecords: 100,
    processedRecords: 100,
    forwardedCount: 10,
    notForwardedCount: 85,
    unknownCount: 5,
    startedAt: '2024-01-01T00:00:00Z',
    completedAt: '2024-01-01T00:05:00Z',
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  };

  beforeEach(async () => {
    const apiSpy = createSpyObj('ApiService', [
      'getThirdPartySenders',
      'createThirdPartySender',
      'updateThirdPartySender',
      'deleteThirdPartySender',
      'startReprocessing',
      'cancelReprocessing',
      'getCurrentReprocessingJob',
      'getReprocessingJobs',
      'getReprocessingJob',
      'deleteOldReports',
    ]);
    apiSpy.getThirdPartySenders.mockReturnValue(of([mockSender]));
    apiSpy.getCurrentReprocessingJob.mockReturnValue(of(null));
    apiSpy.getReprocessingJobs.mockReturnValue(of([mockJob]));

    await TestBed.configureTestingModule({
      imports: [SettingsComponent, BrowserAnimationsModule],
      providers: [{ provide: ApiService, useValue: apiSpy }, provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    apiService = TestBed.inject(ApiService) as SpyObj<ApiService>;

    fixture = TestBed.createComponent(SettingsComponent);
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

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load third-party senders on init', () => {
    expect(apiService.getThirdPartySenders).toHaveBeenCalled();
    expect(component.thirdPartySenders()).toEqual([mockSender]);
  });

  it('should load current job on init', () => {
    expect(apiService.getCurrentReprocessingJob).toHaveBeenCalled();
  });

  it('should load reprocessing history on init', () => {
    expect(apiService.getReprocessingJobs).toHaveBeenCalled();
    expect(component.reprocessingHistory()).toEqual([mockJob]);
  });

  describe('Third-Party Senders', () => {
    it('should handle error loading senders', () => {
      apiService.getThirdPartySenders.mockReturnValue(throwError(() => new Error('Failed')));
      component.loadThirdPartySenders();
      expect(snackBar.open).toHaveBeenCalledWith('Failed to load third-party senders', 'Close', expect.any(Object));
      expect(component.loadingSenders()).toBe(false);
    });

    it('should open create dialog', () => {
      const dialogRefSpy = { afterClosed: () => of(true) };
      dialog.open.mockReturnValue(dialogRefSpy as any);
      apiService.getThirdPartySenders.mockReturnValue(of([mockSender]));

      component.openCreateDialog();

      expect(dialog.open).toHaveBeenCalled();
      expect(snackBar.open).toHaveBeenCalledWith(
        'Third-party sender created successfully',
        'Close',
        expect.any(Object)
      );
    });

    it('should open edit dialog', () => {
      const dialogRefSpy = { afterClosed: () => of(true) };
      dialog.open.mockReturnValue(dialogRefSpy as any);
      apiService.getThirdPartySenders.mockReturnValue(of([mockSender]));

      component.openEditDialog(mockSender);

      expect(dialog.open).toHaveBeenCalled();
    });

    it('should toggle sender enabled state', () => {
      apiService.updateThirdPartySender.mockReturnValue(of(mockSender));
      const event = { checked: false, source: { checked: false } };

      component.toggleEnabled(mockSender, event);

      expect(apiService.updateThirdPartySender).toHaveBeenCalledWith('s1', { enabled: false });
    });

    it('should revert toggle on error', () => {
      apiService.updateThirdPartySender.mockReturnValue(throwError(() => new Error('Fail')));
      const event = { checked: false, source: { checked: false } };

      component.toggleEnabled(mockSender, event);

      expect(event.source.checked).toBe(true); // reverted
    });

    it('should confirm and delete sender', () => {
      const dialogRefSpy = { afterClosed: () => of(true) };
      dialog.open.mockReturnValue(dialogRefSpy as any);
      apiService.deleteThirdPartySender.mockReturnValue(of(undefined as any));
      apiService.getThirdPartySenders.mockReturnValue(of([]));

      component.deleteSender(mockSender);

      expect(apiService.deleteThirdPartySender).toHaveBeenCalledWith('s1');
    });

    it('should not delete when cancelled', () => {
      const dialogRefSpy = { afterClosed: () => of(false) };
      dialog.open.mockReturnValue(dialogRefSpy as any);

      component.deleteSender(mockSender);

      expect(apiService.deleteThirdPartySender).not.toHaveBeenCalled();
    });
  });

  describe('Reprocessing', () => {
    it('should detect running job on init', () => {
      TestBed.resetTestingModule();

      const apiSpy = createSpyObj('ApiService', [
        'getThirdPartySenders',
        'getCurrentReprocessingJob',
        'getReprocessingJobs',
        'getReprocessingJob',
      ]);
      apiSpy.getThirdPartySenders.mockReturnValue(of([]));
      apiSpy.getCurrentReprocessingJob.mockReturnValue(of({ ...mockJob, status: 'running' } as ReprocessingJob));
      apiSpy.getReprocessingJobs.mockReturnValue(of([]));
      apiSpy.getReprocessingJob.mockReturnValue(of({ ...mockJob, status: 'running' } as ReprocessingJob));

      TestBed.configureTestingModule({
        imports: [SettingsComponent, BrowserAnimationsModule],
        providers: [{ provide: ApiService, useValue: apiSpy }, provideHttpClient(), provideHttpClientTesting()],
      });

      const fix = TestBed.createComponent(SettingsComponent);
      fix.detectChanges();
      const comp = fix.componentInstance;

      expect(comp.isReprocessing()).toBe(true);
    });

    it('should prevent starting when already reprocessing', () => {
      component.isReprocessing.set(true);
      component.startReprocessing();
      expect(snackBar.open).toHaveBeenCalledWith('A reprocessing job is already running', 'Close', expect.any(Object));
    });

    it('should not cancel if no current job', () => {
      component.currentJob.set(null);
      component.cancelReprocessing();
      expect(dialog.open).not.toHaveBeenCalled();
    });
  });

  describe('Tab change', () => {
    it('should track selected tab index', () => {
      component.onTabChange(2);
      expect(component.selectedTabIndex()).toBe(2);
    });
  });

  describe('Utility functions', () => {
    it('should calculate progress', () => {
      expect(component.getProgress(mockJob)).toBe(100);
      expect(component.getProgress({ ...mockJob, totalRecords: 0 })).toBe(0);
      expect(component.getProgress({ ...mockJob, totalRecords: undefined })).toBe(0);
    });

    it('should return status icons', () => {
      expect(component.getStatusIcon('pending')).toBe('schedule');
      expect(component.getStatusIcon('running')).toBe('autorenew');
      expect(component.getStatusIcon('completed')).toBe('check_circle');
      expect(component.getStatusIcon('failed')).toBe('error');
      expect(component.getStatusIcon('cancelled')).toBe('cancel');
      expect(component.getStatusIcon('unknown')).toBe('help');
    });

    it('should return status colors', () => {
      expect(component.getStatusColor('pending')).toBe('accent');
      expect(component.getStatusColor('running')).toBe('primary');
      expect(component.getStatusColor('completed')).toBe('green');
      expect(component.getStatusColor('failed')).toBe('warn');
      expect(component.getStatusColor('cancelled')).toBe('warn');
      expect(component.getStatusColor('unknown')).toBe('');
    });

    it('should format dates', () => {
      expect(component.formatDate(undefined)).toBe('-');
      expect(component.formatDate('2024-01-01T00:00:00Z')).toBeTruthy();
    });

    it('should format durations', () => {
      expect(component.formatDuration(undefined, undefined)).toBe('-');
      expect(component.formatDuration('2024-01-01T00:00:00Z', '2024-01-01T00:00:30Z')).toBe('30s');
      expect(component.formatDuration('2024-01-01T00:00:00Z', '2024-01-01T00:05:30Z')).toBe('5m 30s');
    });

    it('should calculate date helper values', () => {
      const yearsAgo = component.getYearsAgoDeleteDate(1);
      expect(yearsAgo.getFullYear()).toBe(new Date().getFullYear() - 1);

      const monthsAgo = component.getMonthsAgoDeleteDate(6);
      expect(monthsAgo).toBeInstanceOf(Date);
    });
  });

  describe('Delete Old Reports', () => {
    it('should show error if no date selected', () => {
      component.deleteOlderThan.set(null);
      component.deleteOldReports();
      expect(snackBar.open).toHaveBeenCalledWith('Please select a date', 'Close', expect.any(Object));
    });

    it('should confirm and delete old reports', () => {
      const date = new Date('2023-01-01');
      component.deleteOlderThan.set(date);

      const dialogRefSpy = { afterClosed: () => of(true) };
      dialog.open.mockReturnValue(dialogRefSpy as any);
      apiService.deleteOldReports.mockReturnValue(of({ deletedCount: 5 }));

      component.deleteOldReports();

      expect(apiService.deleteOldReports).toHaveBeenCalledWith(date);
      expect(snackBar.open).toHaveBeenCalledWith('Successfully deleted 5 old reports', 'Close', expect.any(Object));
      expect(component.isDeletingReports()).toBe(false);
    });

    it('should handle delete error', () => {
      component.deleteOlderThan.set(new Date());
      const dialogRefSpy = { afterClosed: () => of(true) };
      dialog.open.mockReturnValue(dialogRefSpy as any);
      apiService.deleteOldReports.mockReturnValue(throwError(() => new Error('Delete failed')));

      component.deleteOldReports();

      expect(snackBar.open).toHaveBeenCalledWith('Failed to delete old reports', 'Close', expect.any(Object));
      expect(component.isDeletingReports()).toBe(false);
    });
  });
});
