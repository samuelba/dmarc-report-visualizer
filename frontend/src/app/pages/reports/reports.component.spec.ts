import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { vi } from 'vitest';
import { ReportsComponent } from './reports.component';
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

  it('should open XML viewer dialog for report', () => {
    const mockXml = '<xml>test</xml>';
    apiService.getReportXml.mockReturnValue(of(mockXml));

    component.openReportDetails(mockReports.data[0]);

    expect(apiService.getReportXml).toHaveBeenCalledWith('r1');
    expect(dialog.open).toHaveBeenCalled();
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
