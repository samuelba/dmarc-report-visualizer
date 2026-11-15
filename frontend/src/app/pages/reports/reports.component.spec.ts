import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, ActivatedRoute, Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { vi } from 'vitest';
import { ReportsComponent } from './reports.component';
import { ReportDeliveriesDialogComponent } from '../../components/report-deliveries-dialog/report-deliveries-dialog.component';
import { ApiService, PagedResult, DmarcReport } from '../../services/api.service';
import { createSpyObj, SpyObj } from '../../../testing/mock-helpers';

describe('ReportsComponent', () => {
  let component: ReportsComponent;
  let fixture: ComponentFixture<ReportsComponent>;
  let apiService: SpyObj<ApiService>;
  let dialog: SpyObj<MatDialog>;

  const mockReports: PagedResult<DmarcReport> = {
    data: [
      {
        id: 'r1',
        reportId: 'rpt-001',
        orgName: 'Google',
        domain: 'example.com',
        records: [],
        beginDate: '2024-01-01',
        endDate: '2024-01-02',
        createdAt: '2024-01-03',
        updatedAt: '2024-01-03',
      },
    ],
    total: 1,
    page: 1,
    pageSize: 20,
  };

  beforeEach(async () => {
    const apiSpy = createSpyObj('ApiService', ['listReports', 'getReportDomains', 'findOne', 'getReportXml']);
    apiSpy.listReports.mockReturnValue(of(mockReports));
    apiSpy.getReportDomains.mockReturnValue(of({ domains: ['example.com', 'test.com'] }));

    await TestBed.configureTestingModule({
      imports: [ReportsComponent, BrowserAnimationsModule],
      providers: [
        { provide: ApiService, useValue: apiSpy },
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { queryParams: {} },
          },
        },
      ],
    }).compileComponents();

    apiService = TestBed.inject(ApiService) as SpyObj<ApiService>;

    fixture = TestBed.createComponent(ReportsComponent);
    component = fixture.componentInstance;

    // Spy on component-level injected services (provided by Material module imports)
    const dialogInstance = fixture.debugElement.injector.get(MatDialog);
    vi.spyOn(dialogInstance, 'open').mockReturnValue({ afterClosed: () => of(true) } as any);
    dialog = dialogInstance as any;

    const snackBarInstance = fixture.debugElement.injector.get(MatSnackBar);
    vi.spyOn(snackBarInstance, 'open').mockReturnValue({} as any);

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load reports on init', () => {
    expect(apiService.listReports).toHaveBeenCalled();
    expect(component.reports()).toEqual(mockReports.data);
    expect(component.total()).toBe(1);
  });

  it('should load domains on init', () => {
    expect(apiService.getReportDomains).toHaveBeenCalled();
    expect(component.domains()).toEqual(['example.com', 'test.com']);
  });

  it('should handle page change', () => {
    apiService.listReports.mockReturnValue(of({ ...mockReports, page: 2 }));
    component.onPage({ pageIndex: 1, pageSize: 20, length: 100 });
    expect(component.page()).toBe(2);
    expect(apiService.listReports).toHaveBeenCalledWith(expect.objectContaining({ page: 2, pageSize: 20 }));
  });

  it('should reset page on filter change', () => {
    component.page.set(3);
    component.domainFilter = 'test.com';
    apiService.listReports.mockReturnValue(of(mockReports));
    component.onFilterChange();
    expect(component.page()).toBe(1);
    expect(apiService.listReports).toHaveBeenCalled();
  });

  describe('URL sync', () => {
    let navigate: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    });

    const lastQueryParams = () => navigate.mock.calls.at(-1)![1]!.queryParams;

    it('should drop page from the URL when returning to page 1', () => {
      component.onPage({ pageIndex: 1, pageSize: 100, length: 500 });
      expect(lastQueryParams()).toEqual(expect.objectContaining({ page: 2, pageSize: 100 }));

      component.onPage({ pageIndex: 0, pageSize: 100, length: 500 });
      expect(lastQueryParams()).toEqual(expect.objectContaining({ page: null, pageSize: 100 }));
    });

    it('should drop pageSize from the URL when back to the default', () => {
      component.onPage({ pageIndex: 0, pageSize: 20, length: 500 });
      expect(lastQueryParams()).toEqual(expect.objectContaining({ pageSize: null }));
    });

    it('should drop domain from the URL when the filter is cleared', () => {
      component.domainFilter = '';
      component.onFilterChange();
      expect(lastQueryParams()).toEqual(expect.objectContaining({ domain: null, page: null }));
    });

    it('should offer the default page size in the paginator', () => {
      expect(component.pageSizeOptions).toContain(component.pageSize());
    });
  });

  describe('loading state', () => {
    const skeleton = () => (fixture.nativeElement as HTMLElement).querySelector('[data-testid="reports-skeleton"]');

    it('should show a skeleton while reports are loading', () => {
      const pending = new Subject<PagedResult<DmarcReport>>();
      apiService.listReports.mockReturnValue(pending);

      component.onPage({ pageIndex: 1, pageSize: 20, length: 100 });
      fixture.detectChanges();

      expect(component.loading()).toBe(true);
      expect(skeleton()).not.toBeNull();
      expect(fixture.nativeElement.querySelector('tr.clickable-row')).toBeNull();

      pending.next(mockReports);
      pending.complete();
      fixture.detectChanges();

      expect(component.loading()).toBe(false);
      expect(skeleton()).toBeNull();
      expect(fixture.nativeElement.querySelector('tr.clickable-row')).not.toBeNull();
    });

    it('should stop loading and notify when the request fails', () => {
      const snackBar = fixture.debugElement.injector.get(MatSnackBar);
      apiService.listReports.mockReturnValue(throwError(() => new Error('boom')));

      component.onPage({ pageIndex: 1, pageSize: 20, length: 100 });
      fixture.detectChanges();

      expect(component.loading()).toBe(false);
      expect(skeleton()).toBeNull();
      expect(snackBar.open).toHaveBeenCalledWith('Failed to load reports', 'Close', expect.anything());
    });
  });

  it('should open XML viewer dialog for report', () => {
    const mockXml = '<xml>test</xml>';
    apiService.getReportXml.mockReturnValue(of(mockXml));

    component.openReportDetails(mockReports.data[0]);

    expect(apiService.getReportXml).toHaveBeenCalledWith('r1');
    expect(dialog.open).toHaveBeenCalled();
  });

  it('should show a sender column with the report verdict', () => {
    component.reports.set([{ ...mockReports.data[0], authStatus: 'unverified' }]);
    fixture.detectChanges();

    expect(component.displayedColumns).toContain('sender');
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="sender-badge-unverified"]')).not.toBeNull();
  });

  it('should open the delivery history for a report', () => {
    const report = { ...mockReports.data[0], orgName: 'google.com' };

    component.openSenderDetails(report);

    expect(dialog.open).toHaveBeenCalledWith(
      ReportDeliveriesDialogComponent,
      expect.objectContaining({
        data: { reportId: 'r1', title: 'example.com · google.com' },
      })
    );
  });

  it('should load filters from URL query params', async () => {
    // Re-create with query params
    TestBed.resetTestingModule();
    const apiSpy = createSpyObj('ApiService', ['listReports', 'getReportDomains', 'findOne', 'getReportXml']);
    apiSpy.listReports.mockReturnValue(of(mockReports));
    apiSpy.getReportDomains.mockReturnValue(of({ domains: [] }));

    await TestBed.configureTestingModule({
      imports: [ReportsComponent, BrowserAnimationsModule],
      providers: [
        { provide: ApiService, useValue: apiSpy },
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { queryParams: { domain: 'filtered.com', page: '2', pageSize: '50' } },
          },
        },
      ],
    }).compileComponents();

    const fix = TestBed.createComponent(ReportsComponent);
    const comp = fix.componentInstance;
    fix.detectChanges();

    expect(comp.domainFilter).toBe('filtered.com');
    expect(comp.page()).toBe(2);
    expect(comp.pageSize()).toBe(50);
  });
});
