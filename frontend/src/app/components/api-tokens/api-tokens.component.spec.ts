import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ApiTokensComponent } from './api-tokens.component';
import { ApiToken, ApiTokenService } from '../../services/api-token.service';
import { createSpyObj, SpyObj } from '../../../testing/mock-helpers';

const active: ApiToken = {
  id: 't1',
  name: 'laptop',
  prefix: 'dmarc_pat_abcdef',
  scopes: ['mcp:read', 'mcp:raw_xml'],
  createdAt: '2026-11-01T00:00:00Z',
  expiresAt: '2999-01-01T00:00:00Z',
  lastUsedAt: null,
  lastUsedIp: null,
  revokedAt: null,
};
const revoked: ApiToken = { ...active, id: 't2', name: 'old', revokedAt: '2026-11-02T00:00:00Z' };

describe('ApiTokensComponent', () => {
  let fixture: ComponentFixture<ApiTokensComponent>;
  let component: ApiTokensComponent;
  let apiTokens: SpyObj<ApiTokenService>;
  let dialogOpen: ReturnType<typeof vi.fn>;
  let snackOpen: ReturnType<typeof vi.fn>;

  const answerDialog = (answer: boolean) => dialogOpen.mockReturnValue({ afterClosed: () => of(answer) } as never);
  const el = () => fixture.nativeElement as HTMLElement;

  async function render(list: ApiToken[] | null) {
    apiTokens.listOwn.mockReturnValue(of(list));
    fixture = TestBed.createComponent(ApiTokensComponent);
    component = fixture.componentInstance;
    dialogOpen = vi.spyOn(fixture.debugElement.injector.get(MatDialog), 'open') as never;
    snackOpen = vi.spyOn(fixture.debugElement.injector.get(MatSnackBar), 'open').mockReturnValue({} as never) as never;
    fixture.detectChanges();
    await fixture.whenStable();
  }

  beforeEach(async () => {
    apiTokens = createSpyObj('ApiTokenService', ['listOwn', 'revoke', 'revokeAll', 'mcpEndpointUrl']);
    apiTokens.mcpEndpointUrl.mockReturnValue('https://dmarc.example.com/api/mcp');

    await TestBed.configureTestingModule({
      imports: [ApiTokensComponent, BrowserAnimationsModule],
      providers: [{ provide: ApiTokenService, useValue: apiTokens }],
    }).compileComponents();
  });

  it('renders nothing when MCP is disabled on the server', async () => {
    await render(null);

    expect(el().querySelector('[data-testid="api-tokens-section"]')).toBeNull();
  });

  it('lists tokens with their access and status', async () => {
    await render([active, revoked]);

    const rows = el().querySelectorAll('[data-testid="api-token-row"]');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('laptop');
    expect(rows[0].textContent).toContain('raw XML');
    expect(rows[0].textContent).toContain('Never');
    expect(rows[0].textContent).toContain('active');
    expect(rows[1].textContent).toContain('revoked');
    expect(el().textContent).toContain('https://dmarc.example.com/api/mcp');
  });

  it('shows an empty state', async () => {
    await render([]);

    expect(el().textContent).toContain('You have no API tokens');
  });

  it('shows a load error instead of hiding the section', async () => {
    apiTokens.listOwn.mockReturnValue(throwError(() => new Error('boom')));
    fixture = TestBed.createComponent(ApiTokensComponent);
    fixture.detectChanges();

    expect(el().textContent).toContain('Could not load your API tokens');
  });

  it('reloads after a token was created', async () => {
    await render([]);
    answerDialog(true);

    component.create();

    expect(apiTokens.listOwn).toHaveBeenCalledTimes(2);
  });

  it('revokes a token after confirmation', async () => {
    await render([active]);
    answerDialog(true);
    apiTokens.revoke.mockReturnValue(of(active));

    component.revoke(active);

    expect(dialogOpen.mock.calls[0][1].data.message).toContain('laptop');
    expect(apiTokens.revoke).toHaveBeenCalledWith('t1');
    expect(apiTokens.listOwn).toHaveBeenCalledTimes(2);
  });

  it('does nothing when revoking is cancelled', async () => {
    await render([active]);
    answerDialog(false);

    component.revoke(active);

    expect(apiTokens.revoke).not.toHaveBeenCalled();
  });

  it('revokes all tokens and reports how many', async () => {
    await render([active]);
    answerDialog(true);
    apiTokens.revokeAll.mockReturnValue(of({ revoked: 1 }));

    component.revokeAll();

    expect(snackOpen).toHaveBeenCalledWith(expect.stringContaining('1'), 'Close', expect.anything());
  });
});
