import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ApiTokensAdminComponent } from './api-tokens-admin.component';
import { AdminApiToken, ApiTokenService } from '../../../services/api-token.service';
import { createSpyObj, SpyObj } from '../../../../testing/mock-helpers';

const token: AdminApiToken = {
  id: 't1',
  name: 'laptop',
  prefix: 'dmarc_pat_abcdef',
  scopes: ['mcp:read'],
  createdAt: '2026-11-01T00:00:00Z',
  expiresAt: '2999-01-01T00:00:00Z',
  lastUsedAt: '2026-11-14T10:00:00Z',
  lastUsedIp: '192.0.2.7',
  revokedAt: null,
  userId: 'u2',
  userEmail: 'alice@example.com',
};

describe('ApiTokensAdminComponent', () => {
  let fixture: ComponentFixture<ApiTokensAdminComponent>;
  let component: ApiTokensAdminComponent;
  let apiTokens: SpyObj<ApiTokenService>;
  let dialogOpen: ReturnType<typeof vi.fn>;
  let snackOpen: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    apiTokens = createSpyObj('ApiTokenService', ['listAll', 'revokeAny']);
    apiTokens.listAll.mockReturnValue(of([token]));

    await TestBed.configureTestingModule({
      imports: [ApiTokensAdminComponent, BrowserAnimationsModule],
      providers: [{ provide: ApiTokenService, useValue: apiTokens }],
    }).compileComponents();

    fixture = TestBed.createComponent(ApiTokensAdminComponent);
    component = fixture.componentInstance;
    dialogOpen = vi.spyOn(fixture.debugElement.injector.get(MatDialog), 'open') as never;
    snackOpen = vi.spyOn(fixture.debugElement.injector.get(MatSnackBar), 'open').mockReturnValue({} as never) as never;
    fixture.detectChanges();
  });

  it('lists every user token with its owner and last use', () => {
    const row = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="admin-token-row"]')!;

    expect(row.textContent).toContain('alice@example.com');
    expect(row.textContent).toContain('laptop');
    expect(row.textContent).toContain('192.0.2.7');
  });

  it('revokes another user token after confirmation', () => {
    dialogOpen.mockReturnValue({ afterClosed: () => of(true) } as never);
    apiTokens.revokeAny.mockReturnValue(of(token));

    component.revoke(token);

    expect(dialogOpen.mock.calls[0][1].data.message).toContain('alice@example.com');
    expect(apiTokens.revokeAny).toHaveBeenCalledWith('t1');
    expect(apiTokens.listAll).toHaveBeenCalledTimes(2);
  });

  it('reports a failed revoke', () => {
    dialogOpen.mockReturnValue({ afterClosed: () => of(true) } as never);
    apiTokens.revokeAny.mockReturnValue(throwError(() => new Error('boom')));

    component.revoke(token);

    expect(snackOpen).toHaveBeenCalledWith(expect.stringContaining('Could not'), 'Close', expect.anything());
  });
});
