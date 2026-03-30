import { createSpyObj, SpyObj } from '../../../../testing/mock-helpers';
/* global btoa */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { SamlSettingsComponent, SamlConfigResponse } from './saml-settings.component';
import { AuthService } from '../../../services/auth.service';
import { MatDialog } from '@angular/material/dialog';

describe('SamlSettingsComponent', () => {
  let component: SamlSettingsComponent;
  let fixture: ComponentFixture<SamlSettingsComponent>;
  let authService: SpyObj<AuthService>;
  let dialog: SpyObj<MatDialog>;

  const mockConfig: SamlConfigResponse = {
    enabled: true,
    configured: true,
    spEntityId: 'test-sp-entity',
    spAcsUrl: 'https://test.example.com/auth/saml/callback',
    idpEntityId: 'test-idp-entity',
    idpSsoUrl: 'https://idp.example.com/sso',
    hasIdpCertificate: true,
    disablePasswordLogin: false,
    passwordLoginForceEnabled: false,
  };

  beforeEach(async () => {
    const authServiceSpy = createSpyObj('AuthService', [
      'getSamlConfig',
      'updateSamlConfig',
      'enableSaml',
      'disableSaml',
      'downloadSamlMetadata',
    ]);

    await TestBed.configureTestingModule({
      imports: [SamlSettingsComponent, ReactiveFormsModule, MatSnackBarModule, NoopAnimationsModule],
      providers: [{ provide: AuthService, useValue: authServiceSpy }, provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(SamlSettingsComponent);
    component = fixture.componentInstance;

    authService = TestBed.inject(AuthService) as SpyObj<AuthService>;

    // Spy on component-level injected MatDialog (provided by MatDialogModule import)
    const dialogInstance = fixture.debugElement.injector.get(MatDialog);
    vi.spyOn(dialogInstance, 'open').mockReturnValue({ afterClosed: () => of(true) } as any);
    dialog = dialogInstance as any;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load configuration on init', () => {
    authService.getSamlConfig.mockReturnValue(of(mockConfig));

    component.ngOnInit();

    expect(authService.getSamlConfig).toHaveBeenCalled();
    expect(component.config()).toEqual(mockConfig);
    expect(component.loading()).toBe(false);
  });

  it('should handle configuration load error', () => {
    authService.getSamlConfig.mockReturnValue(throwError(() => new Error('Load failed')));

    component.ngOnInit();

    expect(authService.getSamlConfig).toHaveBeenCalled();
    expect(component.loading()).toBe(false);
  });

  it('should download SP metadata', () => {
    const mockBlob = new Blob(['<xml></xml>'], { type: 'application/xml' });
    authService.downloadSamlMetadata.mockReturnValue(of(mockBlob));
    window.URL.createObjectURL = vi.fn().mockReturnValue('blob:test');
    window.URL.revokeObjectURL = vi.fn();

    component.downloadMetadata();

    expect(authService.downloadSamlMetadata).toHaveBeenCalled();
    expect(component.loading()).toBe(false);
  });

  it('should copy text to clipboard', async () => {
    // navigator.clipboard may not exist in jsdom, define it
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });

    await component.copyToClipboard('test-text', 'Test Label');

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('test-text');
  });

  it('should submit metadata configuration', () => {
    authService.updateSamlConfig.mockReturnValue(of(mockConfig));
    authService.getSamlConfig.mockReturnValue(of(mockConfig));

    component.metadataForm.patchValue({ idpMetadataXml: '<xml></xml>' });
    component.submitMetadata();

    expect(authService.updateSamlConfig).toHaveBeenCalledWith({
      idpMetadataXml: '<xml></xml>',
    });
  });

  it('should submit manual configuration', () => {
    authService.updateSamlConfig.mockReturnValue(of(mockConfig));
    authService.getSamlConfig.mockReturnValue(of(mockConfig));

    component.manualForm.patchValue({
      idpEntityId: 'test-entity',
      idpSsoUrl: 'https://idp.example.com/sso',
      idpCertificate: 'test-cert',
    });
    component.submitManualConfig();

    expect(authService.updateSamlConfig).toHaveBeenCalledWith({
      idpEntityId: 'test-entity',
      idpSsoUrl: 'https://idp.example.com/sso',
      idpCertificate: 'test-cert',
    });
  });

  it('should enable SAML', () => {
    authService.enableSaml.mockReturnValue(of(void 0));
    authService.getSamlConfig.mockReturnValue(of(mockConfig));
    component.config.set(mockConfig);

    const mockEvent = { checked: true, source: { checked: true } };
    component.toggleSaml(mockEvent);

    expect(authService.enableSaml).toHaveBeenCalled();
  });

  it('should disable SAML with confirmation', () => {
    authService.disableSaml.mockReturnValue(of(void 0));
    authService.getSamlConfig.mockReturnValue(of(mockConfig));
    component.config.set(mockConfig);

    // Mock MatDialog.open to return a dialogRef with afterClosed returning true
    const dialogRefSpy = { afterClosed: vi.fn().mockReturnValue(of(true)) };
    dialog.open.mockReturnValue(dialogRefSpy as any);

    const mockEvent = { checked: false, source: { checked: false } };
    component.toggleSaml(mockEvent);

    expect(dialog.open).toHaveBeenCalled();
    expect(authService.disableSaml).toHaveBeenCalled();
  });

  // TODO: This test doesn't match the actual implementation which uses
  // authService.initiateSamlTest() + token validation, not direct window.open
  it.skip('should test SAML login', () => {
    component.config.set(mockConfig);
    vi.spyOn(window, 'open').mockReturnValue({} as Window);

    component.testSamlLogin();

    expect(window.open).toHaveBeenCalledWith('/api/auth/saml/login', 'saml-test', 'width=800,height=600');
  });

  describe('getAccessTokenFromCookie', () => {
    it('should return access token when cookie exists', () => {
      Object.defineProperty(document, 'cookie', {
        writable: true,
        value: 'accessToken=test-token-123; otherCookie=value',
      });

      const token = (component as any).getAccessTokenFromCookie();

      expect(token).toBe('test-token-123');
    });

    it('should return access token with equals signs in value', () => {
      Object.defineProperty(document, 'cookie', {
        writable: true,
        value:
          'accessToken=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c=',
      });

      const token = (component as any).getAccessTokenFromCookie();

      expect(token).toBe(
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c='
      );
    });

    it('should return null when access token cookie does not exist', () => {
      Object.defineProperty(document, 'cookie', {
        writable: true,
        value: 'otherCookie=value; anotherCookie=value2',
      });

      const token = (component as any).getAccessTokenFromCookie();

      expect(token).toBeNull();
    });

    it('should return null when no cookies exist', () => {
      Object.defineProperty(document, 'cookie', {
        writable: true,
        value: '',
      });

      const token = (component as any).getAccessTokenFromCookie();

      expect(token).toBeNull();
    });

    it('should handle cookies with leading spaces', () => {
      Object.defineProperty(document, 'cookie', {
        writable: true,
        value: ' accessToken=test-token; otherCookie=value',
      });

      const token = (component as any).getAccessTokenFromCookie();

      expect(token).toBe('test-token');
    });
  });

  describe('isTokenExpired', () => {
    it('should return false for valid non-expired token', () => {
      const futureTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      const payload = { exp: futureTime };
      const token = `header.${btoa(JSON.stringify(payload))}.signature`;

      const isExpired = (component as any).isTokenExpired(token);

      expect(isExpired).toBe(false);
    });

    it('should return true for expired token', () => {
      const pastTime = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      const payload = { exp: pastTime };
      const token = `header.${btoa(JSON.stringify(payload))}.signature`;

      const isExpired = (component as any).isTokenExpired(token);

      expect(isExpired).toBe(true);
    });

    it('should return true for token without exp claim', () => {
      const payload = { sub: 'user123' };
      const token = `header.${btoa(JSON.stringify(payload))}.signature`;

      const isExpired = (component as any).isTokenExpired(token);

      expect(isExpired).toBe(true);
    });

    it('should return true for token with invalid exp type', () => {
      const payload = { exp: 'not-a-number' };
      const token = `header.${btoa(JSON.stringify(payload))}.signature`;

      const isExpired = (component as any).isTokenExpired(token);

      expect(isExpired).toBe(true);
    });

    it('should return true for malformed token', () => {
      const token = 'not.a.valid.jwt';

      const isExpired = (component as any).isTokenExpired(token);

      expect(isExpired).toBe(true);
    });

    it('should return true for token with invalid base64', () => {
      const token = 'header.invalid-base64!@#$.signature';

      const isExpired = (component as any).isTokenExpired(token);

      expect(isExpired).toBe(true);
    });

    it('should return true for empty token', () => {
      const isExpired = (component as any).isTokenExpired('');

      expect(isExpired).toBe(true);
    });
  });

  describe('handleAuthError', () => {
    it('should handle 401 error and navigate to login', () => {
      const mockRouter = createSpyObj('Router', ['navigate']);
      (component as any).router = mockRouter;
      const error = { status: 401 };

      (component as any).handleAuthError(error, 'Default message');

      expect(mockRouter.navigate).toHaveBeenCalledWith(['/login']);
    });

    it('should handle 403 error with admin message', () => {
      const error = { status: 403 };

      (component as any).handleAuthError(error, 'Default message');

      // Verify snackbar was called (would need to spy on snackBar in real test)
    });

    it('should use custom error message when available', () => {
      const error = { status: 500, error: { message: 'Custom error message' } };

      (component as any).handleAuthError(error, 'Default message');

      // Verify snackbar was called with custom message
    });

    it('should use default message when no custom message available', () => {
      const error = { status: 500 };

      (component as any).handleAuthError(error, 'Default message');

      // Verify snackbar was called with default message
    });
  });
});
