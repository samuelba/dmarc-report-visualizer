import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { vi } from 'vitest';
import { SmtpSettingsComponent } from './smtp-settings.component';
import { SmtpSettingsService } from './smtp-settings.service';
import { createSpyObj, SpyObj } from '../../../../testing/mock-helpers';

describe('SmtpSettingsComponent', () => {
  let component: SmtpSettingsComponent;
  let fixture: ComponentFixture<SmtpSettingsComponent>;
  let smtpService: SpyObj<SmtpSettingsService>;
  let snackBar: SpyObj<MatSnackBar>;
  let dialog: SpyObj<MatDialog>;

  const mockConfig = {
    configured: true,
    enabled: true,
    host: 'smtp.example.com',
    port: 587,
    securityMode: 'starttls',
    username: 'user',
    hasPassword: true,
    fromEmail: 'noreply@example.com',
    fromName: 'DMARC',
    replyToEmail: '',
  };

  beforeEach(async () => {
    const smtpSpy = createSpyObj('SmtpSettingsService', ['getConfig', 'updateConfig', 'sendTestEmail', 'deleteConfig']);
    smtpSpy.getConfig.mockReturnValue(of(mockConfig));

    await TestBed.configureTestingModule({
      imports: [SmtpSettingsComponent, BrowserAnimationsModule],
      providers: [{ provide: SmtpSettingsService, useValue: smtpSpy }, provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    smtpService = TestBed.inject(SmtpSettingsService) as SpyObj<SmtpSettingsService>;

    fixture = TestBed.createComponent(SmtpSettingsComponent);
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

  it('should load config on init', () => {
    expect(smtpService.getConfig).toHaveBeenCalled();
    expect(component.configured()).toBe(true);
    expect(component.smtpForm.get('host')?.value).toBe('smtp.example.com');
  });

  it('should handle config load error', () => {
    smtpService.getConfig.mockReturnValue(throwError(() => new Error('Failed')));
    component.ngOnInit();
    expect(snackBar.open).toHaveBeenCalledWith('Failed to load SMTP configuration', 'Close', expect.any(Object));
    expect(component.loading()).toBe(false);
  });

  describe('onSecurityModeChange', () => {
    it('should set port 465 for TLS', () => {
      component.smtpForm.patchValue({ port: 587 });
      component.onSecurityModeChange('tls');
      expect(component.smtpForm.get('port')?.value).toBe(465);
    });

    it('should set port 587 for STARTTLS', () => {
      component.smtpForm.patchValue({ port: 465 });
      component.onSecurityModeChange('starttls');
      expect(component.smtpForm.get('port')?.value).toBe(587);
    });

    it('should set port 25 for none', () => {
      component.smtpForm.patchValue({ port: 587 });
      component.onSecurityModeChange('none');
      expect(component.smtpForm.get('port')?.value).toBe(25);
    });

    it('should not change custom port', () => {
      component.smtpForm.patchValue({ port: 2525 });
      component.onSecurityModeChange('tls');
      expect(component.smtpForm.get('port')?.value).toBe(2525);
    });
  });

  describe('saveConfig', () => {
    it('should not save with invalid form', () => {
      component.smtpForm.patchValue({ host: '' });
      component.saveConfig();
      expect(smtpService.updateConfig).not.toHaveBeenCalled();
    });

    it('should save valid config', () => {
      smtpService.updateConfig.mockReturnValue(of(mockConfig as any));
      component.smtpForm.patchValue({
        host: 'smtp.test.com',
        port: 587,
        securityMode: 'starttls',
        fromEmail: 'test@test.com',
        fromName: 'Test',
      });

      component.saveConfig();

      expect(smtpService.updateConfig).toHaveBeenCalled();
      expect(snackBar.open).toHaveBeenCalledWith('SMTP configuration saved successfully', 'Close', expect.any(Object));
      expect(component.saving()).toBe(false);
    });

    it('should handle save error', () => {
      smtpService.updateConfig.mockReturnValue(throwError(() => new Error('Fail')));
      component.smtpForm.patchValue({
        host: 'smtp.test.com',
        port: 587,
        securityMode: 'starttls',
        fromEmail: 'test@test.com',
        fromName: 'Test',
      });

      component.saveConfig();

      expect(snackBar.open).toHaveBeenCalledWith('Failed to save SMTP configuration', 'Close', expect.any(Object));
    });
  });

  describe('sendTestEmail', () => {
    it('should not send without valid email', () => {
      component.testEmail.set('');
      component.sendTestEmail();
      expect(smtpService.sendTestEmail).not.toHaveBeenCalled();
    });

    it('should not send with invalid email', () => {
      component.testEmail.set('not-an-email');
      component.sendTestEmail();
      expect(smtpService.sendTestEmail).not.toHaveBeenCalled();
    });

    it('should send test email successfully', () => {
      smtpService.sendTestEmail.mockReturnValue(of({ success: true, messageId: 'msg-1' }));
      component.testEmail.set('test@example.com');

      component.sendTestEmail();

      expect(smtpService.sendTestEmail).toHaveBeenCalledWith('test@example.com');
      expect(component.testResult()?.success).toBe(true);
      expect(component.testing()).toBe(false);
    });

    it('should handle failed test email', () => {
      smtpService.sendTestEmail.mockReturnValue(of({ success: false, error: 'Auth failed' }));
      component.testEmail.set('test@example.com');

      component.sendTestEmail();

      expect(component.testResult()?.success).toBe(false);
    });

    it('should handle test email error', () => {
      smtpService.sendTestEmail.mockReturnValue(throwError(() => ({ error: { message: 'Server error' } })));
      component.testEmail.set('test@example.com');

      component.sendTestEmail();

      expect(component.testResult()?.success).toBe(false);
      expect(component.testing()).toBe(false);
    });
  });

  describe('getErrorMessage', () => {
    it('should return required error', () => {
      component.smtpForm.get('host')?.setValue('');
      component.smtpForm.get('host')?.markAsTouched();
      expect(component.getErrorMessage('host')).toBe('This field is required');
    });

    it('should return email error', () => {
      component.smtpForm.get('fromEmail')?.setValue('invalid');
      component.smtpForm.get('fromEmail')?.markAsTouched();
      expect(component.getErrorMessage('fromEmail')).toBe('Please enter a valid email address');
    });

    it('should return min error for port', () => {
      component.smtpForm.get('port')?.setValue(0);
      component.smtpForm.get('port')?.markAsTouched();
      expect(component.getErrorMessage('port')).toBe('Port must be at least 1');
    });

    it('should return max error for port', () => {
      component.smtpForm.get('port')?.setValue(99999);
      component.smtpForm.get('port')?.markAsTouched();
      expect(component.getErrorMessage('port')).toBe('Port must be at most 65535');
    });
  });

  describe('resetConfig', () => {
    it('should confirm and reset config', () => {
      const dialogRefSpy = { afterClosed: () => of(true) };
      dialog.open.mockReturnValue(dialogRefSpy as any);
      smtpService.deleteConfig.mockReturnValue(of(undefined as any));

      component.resetConfig();

      expect(smtpService.deleteConfig).toHaveBeenCalled();
      expect(component.configured()).toBe(false);
    });

    it('should not reset when cancelled', () => {
      const dialogRefSpy = { afterClosed: () => of(false) };
      dialog.open.mockReturnValue(dialogRefSpy as any);

      component.resetConfig();

      expect(smtpService.deleteConfig).not.toHaveBeenCalled();
    });

    it('should handle reset error', () => {
      const dialogRefSpy = { afterClosed: () => of(true) };
      dialog.open.mockReturnValue(dialogRefSpy as any);
      smtpService.deleteConfig.mockReturnValue(throwError(() => new Error('Fail')));

      component.resetConfig();

      expect(snackBar.open).toHaveBeenCalledWith('Failed to reset SMTP configuration', 'Close', expect.any(Object));
    });
  });
});
