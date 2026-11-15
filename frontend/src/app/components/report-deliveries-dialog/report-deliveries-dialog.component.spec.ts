import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';
import { ReportDeliveriesDialogComponent } from './report-deliveries-dialog.component';
import { ApiService, ReportDelivery } from '../../services/api.service';
import { createSpyObj, SpyObj } from '../../../testing/mock-helpers';

describe('ReportDeliveriesDialogComponent', () => {
  let fixture: ComponentFixture<ReportDeliveriesDialogComponent>;
  let api: SpyObj<ApiService>;

  const delivery: ReportDelivery = {
    id: 'd1',
    reportId: 'r1',
    source: 'gmail',
    sourceMessageId: '<m1@google.com>',
    receivedAt: '2026-11-15T10:00:00Z',
    contentHash: 'h1',
    authStatus: 'aligned',
    authMethod: 'arc',
    authDomain: 'google.com',
    claimedDomain: 'google.com',
    authDetails: { arc: { result: 'pass' } },
    outcome: 'created',
  };

  const create = async () => {
    await TestBed.configureTestingModule({
      imports: [ReportDeliveriesDialogComponent, BrowserAnimationsModule],
      providers: [
        { provide: ApiService, useValue: api },
        { provide: MAT_DIALOG_DATA, useValue: { reportId: 'r1', title: 'example.com · google.com' } },
        { provide: MatDialogRef, useValue: { close: () => undefined } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ReportDeliveriesDialogComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  beforeEach(() => {
    api = createSpyObj('ApiService', ['getReportDeliveries']);
  });

  it('loads and lists the deliveries of the report', async () => {
    api.getReportDeliveries.mockReturnValue(of([delivery]));

    const el = await create();

    expect(api.getReportDeliveries).toHaveBeenCalledWith('r1');
    const row = el.querySelector('[data-testid="delivery-row"]')!;
    expect(row.textContent).toContain('Gmail');
    expect(row.textContent).toContain('aligned');
    expect(row.textContent).toContain('ARC');
    expect(row.textContent).toContain('google.com');
    expect(row.textContent).toContain('created');
    expect(el.querySelector('[data-testid="delivery-details"]')!.textContent).toContain('"result": "pass"');
  });

  it('explains when no deliveries were recorded', async () => {
    api.getReportDeliveries.mockReturnValue(of([]));

    const el = await create();

    expect(el.textContent).toContain('No deliveries recorded');
  });

  it('shows an error when loading fails', async () => {
    api.getReportDeliveries.mockReturnValue(throwError(() => new Error('boom')));

    const el = await create();

    expect(el.textContent).toContain('Could not load the delivery history');
  });
});
