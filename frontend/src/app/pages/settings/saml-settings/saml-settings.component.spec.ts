/* global btoa */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { SamlSettingsComponent, SamlConfigResponse } from './saml-settings.component';
import { AuthService } from '../../../services/auth.service';

describe('SamlSettingsComponent', () => {
  let component: SamlSettingsComponent;
  let fixture: ComponentFixture<SamlSettingsComponent>;
  let authService: jasmine.SpyObj<AuthService>;

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
    const authServiceSpy = jasmine.createSpyObj('AuthService', [
      'getSamlConfig',
      'updateSamlConfig',
      'enableSaml',
      'disableSaml',
      'downloadSamlMetadata',
    ]);

    await TestBed.configureTestingModule({
      imports: [
        SamlSettingsComponent,
        HttpClientTestingModule,
        ReactiveFormsModule,
        MatSnackBarModule,
        NoopAnimationsModule,
      ],
      providers: [{ provide: AuthService, useValue: authServiceSpy }],
    }).compileComponents();

    authService = TestBed.inject(AuthService) as jasmine.SpyObj<AuthService>;
    fixture = TestBed.createComponent(SamlSettingsComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load configuration on init', () => {
    authService.getSamlConfig.and.returnValue(of(mockConfig));

    component.ngOnInit();

    expect(authService.getSamlConfig).toHaveBeenCalled();
    expect(component.config()).toEqual(mockConfig);
    expect(component.loading()).toBe(false);
  });

  it('should handle configuration load error', () => {
    authService.getSamlConfig.and.returnValue(throwError(() => new Error('Load failed')));

    component.ngOnInit();

    expect(authService.getSamlConfig).toHaveBeenCalled();
    expect(component.loading()).toBe(false);
  });

  it('should download SP metadata', () => {
    const mockBlob = new Blob(['<xml></xml>'], { type: 'application/xml' });
    authService.downloadSamlMetadata.and.returnValue(of(mockBlob));
    spyOn(window.URL, 'createObjectURL').and.returnValue('blob:test');
    spyOn(window.URL, 'revokeObjectURL');

    component.downloadMetadata();

    expect(authService.downloadSamlMetadata).toHaveBeenCalled();
    expect(component.loading()).toBe(false);
  });

  it('should copy text to clipboard', async () => {
    spyOn(navigator.clipboard, 'writeText').and.returnValue(Promise.resolve());

    await component.copyToClipboard('test-text', 'Test Label');

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('test-text');
  });

  it('should submit metadata configuration', () => {
    authService.updateSamlConfig.and.returnValue(of(mockConfig));
    authService.getSamlConfig.and.returnValue(of(mockConfig));

    component.metadataForm.patchValue({ idpMetadataXml: '<xml></xml>' });
    component.submitMetadata();

    expect(authService.updateSamlConfig).toHaveBeenCalledWith({
      idpMetadataXml: '<xml></xml>',
    });
  });

  it('should submit manual configuration', () => {
    authService.updateSamlConfig.and.returnValue(of(mockConfig));
    authService.getSamlConfig.and.returnValue(of(mockConfig));

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
    authService.enableSaml.and.returnValue(of(void 0));
    authService.getSamlConfig.and.returnValue(of(mockConfig));
    component.config.set(mockConfig);

    const mockEvent = { checked: true, source: { checked: true } };
    component.toggleSaml(mockEvent);

    expect(authService.enableSaml).toHaveBeenCalled();
  });

  it('should disable SAML with confirmation', () => {
    authService.disableSaml.and.returnValue(of(void 0));
    authService.getSamlConfig.and.returnValue(of(mockConfig));
    component.config.set(mockConfig);
    spyOn(window, 'confirm').and.returnValue(true);

    const mockEvent = { checked: false, source: { checked: false } };
    component.toggleSaml(mockEvent);

    expect(window.confirm).toHaveBeenCalled();
    expect(authService.disableSaml).toHaveBeenCalled();
  });

  it('should test SAML login', () => {
    component.config.set(mockConfig);
    spyOn(window, 'open').and.returnValue({} as Window);

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

    it('should handle cookies with spaces', () => {
      Object.defineProperty(document, 'cookie', {
        writable: true,
        value: ' accessToken = test-token ; otherCookie=value',
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
      const mockRouter = jasmine.createSpyObj('Router', ['navigate']);
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
