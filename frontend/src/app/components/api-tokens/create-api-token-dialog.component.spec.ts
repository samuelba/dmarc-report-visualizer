import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { CreateApiTokenDialogComponent } from './create-api-token-dialog.component';
import { ApiTokenService } from '../../services/api-token.service';
import { createSpyObj, SpyObj } from '../../../testing/mock-helpers';

const TOKEN = `dmarc_pat_${'a'.repeat(43)}`;

describe('CreateApiTokenDialogComponent', () => {
  let fixture: ComponentFixture<CreateApiTokenDialogComponent>;
  let component: CreateApiTokenDialogComponent;
  let apiTokens: SpyObj<ApiTokenService>;
  let dialogRef: { close: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    apiTokens = createSpyObj('ApiTokenService', ['create', 'mcpEndpointUrl']);
    apiTokens.mcpEndpointUrl.mockReturnValue('https://dmarc.example.com/api/mcp');
    dialogRef = { close: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [CreateApiTokenDialogComponent, BrowserAnimationsModule],
      providers: [
        { provide: ApiTokenService, useValue: apiTokens },
        { provide: MatDialogRef, useValue: dialogRef },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CreateApiTokenDialogComponent);
    component = fixture.componentInstance;
    vi.spyOn(fixture.debugElement.injector.get(MatSnackBar), 'open').mockReturnValue({} as never);
    fixture.detectChanges();
  });

  it('defaults to 90 days and read-only access', () => {
    expect(component.form.getRawValue()).toEqual({ name: '', expiresInDays: 90, allowRawXml: false });
  });

  it('does not submit without a name', () => {
    component.form.controls.name.setValue('   ');

    component.submit();

    expect(apiTokens.create).not.toHaveBeenCalled();
  });

  it('creates the token and shows it once with a Claude Code command', () => {
    apiTokens.create.mockReturnValue(of({ token: TOKEN, apiToken: {} as never }));
    component.form.setValue({ name: ' laptop ', expiresInDays: 30, allowRawXml: true });

    component.submit();
    fixture.detectChanges();

    expect(apiTokens.create).toHaveBeenCalledWith({ name: 'laptop', expiresInDays: 30, allowRawXml: true });
    const el = fixture.nativeElement as HTMLElement;
    expect((el.querySelector('[data-testid="created-token"]') as HTMLInputElement).value).toBe(TOKEN);
    expect(el.querySelector('[data-testid="claude-command"]')!.textContent).toBe(
      `claude mcp add --transport http dmarc https://dmarc.example.com/api/mcp --header "Authorization: Bearer ${TOKEN}"`
    );
  });

  it('shows the server error message', () => {
    apiTokens.create.mockReturnValue(
      throwError(() => ({ error: { message: 'API tokens can be valid for at most 30 days' } }))
    );
    component.form.controls.name.setValue('laptop');

    component.submit();

    expect(component.error()).toBe('API tokens can be valid for at most 30 days');
    expect(component.created()).toBeNull();
  });

  it('joins validation messages', () => {
    apiTokens.create.mockReturnValue(throwError(() => ({ error: { message: ['a', 'b'] } })));
    component.form.controls.name.setValue('laptop');

    component.submit();

    expect(component.error()).toBe('a, b');
  });

  it('closes with true only after a token was created', () => {
    component.close();
    expect(dialogRef.close).toHaveBeenLastCalledWith(false);

    apiTokens.create.mockReturnValue(of({ token: TOKEN, apiToken: {} as never }));
    component.form.controls.name.setValue('laptop');
    component.submit();
    component.close();
    expect(dialogRef.close).toHaveBeenLastCalledWith(true);
  });
});
