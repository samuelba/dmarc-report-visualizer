import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ReportSendersComponent } from './report-senders.component';
import { ApiService, TrustedReporter, UnalignedSender } from '../../../services/api.service';
import { createSpyObj, SpyObj } from '../../../../testing/mock-helpers';

describe('ReportSendersComponent', () => {
  let fixture: ComponentFixture<ReportSendersComponent>;
  let component: ReportSendersComponent;
  let api: SpyObj<ApiService>;
  let dialogOpen: ReturnType<typeof vi.fn>;
  let snackOpen: ReturnType<typeof vi.fn>;

  const yahoo: UnalignedSender = {
    claimedDomain: 'yahooinc.com',
    authDomain: 'dmarc.yahoo.com',
    orgNames: ['Yahoo'],
    reportCount: 100,
    firstSeen: '2026-11-01T00:00:00Z',
    lastSeen: '2026-11-15T00:00:00Z',
  };
  const pair: TrustedReporter = {
    id: 'pair-1',
    claimedDomain: 'yahooinc.com',
    authDomain: 'dmarc.yahoo.com',
    note: null,
    createdBy: 'u1',
    createdByEmail: 'admin@example.com',
    createdAt: '2026-11-15T00:00:00Z',
  };

  const confirmWith = (answer: boolean) => dialogOpen.mockReturnValue({ afterClosed: () => of(answer) } as never);

  beforeEach(async () => {
    api = createSpyObj('ApiService', [
      'listUnalignedSenders',
      'listTrustedReporters',
      'trustReporter',
      'revokeTrustedReporter',
    ]);
    api.listUnalignedSenders.mockReturnValue(of([yahoo]));
    api.listTrustedReporters.mockReturnValue(of([pair]));

    await TestBed.configureTestingModule({
      imports: [ReportSendersComponent, BrowserAnimationsModule],
      providers: [{ provide: ApiService, useValue: api }],
    }).compileComponents();

    fixture = TestBed.createComponent(ReportSendersComponent);
    component = fixture.componentInstance;
    dialogOpen = vi.spyOn(fixture.debugElement.injector.get(MatDialog), 'open') as never;
    snackOpen = vi.spyOn(fixture.debugElement.injector.get(MatSnackBar), 'open').mockReturnValue({} as never) as never;
    fixture.detectChanges();
  });

  it('lists unaligned senders and trusted pairs', () => {
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('[data-testid="unaligned-row"]')!.textContent).toContain('dmarc.yahoo.com');
    expect(el.querySelector('[data-testid="unaligned-row"]')!.textContent).toContain('100');
    expect(el.querySelector('[data-testid="trusted-row"]')!.textContent).toContain('admin@example.com');
  });

  it('trusts a pair after confirmation and reports how many reports were aligned', () => {
    confirmWith(true);
    api.trustReporter.mockReturnValue(of({ trusted: pair, upgradedReports: 100 }));

    component.trust(yahoo);

    const message: string = dialogOpen.mock.calls[0][1].data.message;
    expect(message).toContain('yahooinc.com');
    expect(message).toContain('dmarc.yahoo.com');
    expect(message).not.toContain('free-mail');
    expect(api.trustReporter).toHaveBeenCalledWith({
      claimedDomain: 'yahooinc.com',
      authDomain: 'dmarc.yahoo.com',
    });
    expect(snackOpen).toHaveBeenCalledWith(expect.stringContaining('100 reports'), 'Close', expect.anything());
    expect(api.listUnalignedSenders).toHaveBeenCalledTimes(2);
  });

  it('warns before trusting a free-mail sending domain', () => {
    confirmWith(false);

    component.trust({ ...yahoo, claimedDomain: 'somebank.com', authDomain: 'gmail.com' });

    expect(dialogOpen.mock.calls[0][1].data.message).toContain('free-mail');
    expect(api.trustReporter).not.toHaveBeenCalled();
  });

  it('revokes a pair after confirmation', () => {
    confirmWith(true);
    api.revokeTrustedReporter.mockReturnValue(of({ downgradedReports: 100 }));

    component.revoke(pair);

    expect(api.revokeTrustedReporter).toHaveBeenCalledWith('pair-1');
    expect(api.listTrustedReporters).toHaveBeenCalledTimes(2);
  });

  it('reports a failed trust request', () => {
    confirmWith(true);
    api.trustReporter.mockReturnValue(throwError(() => ({ error: { message: 'already trusted' } })));

    component.trust(yahoo);

    expect(snackOpen).toHaveBeenCalledWith(expect.stringContaining('already trusted'), 'Close', expect.anything());
  });
});
