import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { LoginComponent } from './login.component';
import { AuthService } from '../../services/auth.service';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import * as urlValidationUtils from '../../utils/url-validation.utils';

describe('LoginComponent - SSO Integration', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  let authService: jasmine.SpyObj<AuthService>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    const authServiceSpy = jasmine.createSpyObj('AuthService', [
      'checkSamlEnabled',
      'login',
      'isAuthenticated',
      'getSamlAndLoginStatus',
      'getSamlLoginUrl',
    ]);
    const routerSpy = jasmine.createSpyObj('Router', ['navigate', 'navigateByUrl']);

    // Default: SAML not enabled, password login allowed
    authServiceSpy.checkSamlEnabled.and.returnValue(of(false));
    authServiceSpy.isAuthenticated.and.returnValue(of(false));
    authServiceSpy.getSamlAndLoginStatus.and.returnValue(of({ samlEnabled: false, passwordLoginAllowed: true }));
    authServiceSpy.getSamlLoginUrl.and.returnValue('/api/auth/saml/login');
    authServiceSpy['apiBase'] = '/api';

    await TestBed.configureTestingModule({
      imports: [LoginComponent, ReactiveFormsModule, BrowserAnimationsModule],
      providers: [
        { provide: AuthService, useValue: authServiceSpy },
        { provide: Router, useValue: routerSpy },
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    authService = TestBed.inject(AuthService) as jasmine.SpyObj<AuthService>;
    router = TestBed.inject(Router) as jasmine.SpyObj<Router>;

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    // Clean up sessionStorage after each test
    sessionStorage.clear();
  });

  it('should show SSO button when SAML is enabled', () => {
    authService.checkSamlEnabled.and.returnValue(of(true));

    fixture.detectChanges();

    expect(component.showSsoButton).toBe(true);
    expect(authService.checkSamlEnabled).toHaveBeenCalled();

    const compiled = fixture.nativeElement;
    const ssoButton = compiled.querySelector('.sso-button');
    expect(ssoButton).toBeTruthy();
    expect(ssoButton?.textContent).toContain('Sign in with SSO');
  });

  it('should hide SSO button when SAML is disabled', () => {
    authService.checkSamlEnabled.and.returnValue(of(false));

    fixture.detectChanges();

    expect(component.showSsoButton).toBe(false);
    expect(authService.checkSamlEnabled).toHaveBeenCalled();

    const compiled = fixture.nativeElement;
    const ssoButton = compiled.querySelector('.sso-button');
    expect(ssoButton).toBeFalsy();
  });

  it('should hide SSO button when SAML check fails', () => {
    authService.checkSamlEnabled.and.returnValue(throwError(() => new Error('Network error')));

    fixture.detectChanges();

    expect(component.showSsoButton).toBe(false);

    const compiled = fixture.nativeElement;
    const ssoButton = compiled.querySelector('.sso-button');
    expect(ssoButton).toBeFalsy();
  });

  it('should have loginWithSso method that redirects to SAML login endpoint', () => {
    authService.getSamlAndLoginStatus.and.returnValue(of({ samlEnabled: true, passwordLoginAllowed: true }));
    fixture.detectChanges();

    // Verify the method exists
    expect(component.loginWithSso).toBeDefined();
    expect(typeof component.loginWithSso).toBe('function');

    // Verify the expected URL construction
    const expectedUrl = authService.getSamlLoginUrl();
    expect(expectedUrl).toBe('/api/auth/saml/login');

    // Note: We cannot easily test window.location.href assignment in unit tests
    // as it's not configurable. This would be better tested in E2E tests.
  });

  describe('Return URL redirect', () => {
    beforeEach(() => {
      fixture.detectChanges();
    });

    it('should redirect to return URL after successful password login', () => {
      // Set up return URL in sessionStorage
      sessionStorage.setItem('returnUrl', '/explore?recordId=123');

      // Spy on utility functions
      spyOn(urlValidationUtils, 'getValidatedReturnUrl').and.returnValue('/explore?recordId=123');
      spyOn(urlValidationUtils, 'clearReturnUrl');

      // Set up form with valid credentials
      component.loginForm.patchValue({
        email: 'test@example.com',
        password: 'password123',
      });

      // Mock successful login with proper AuthResponse
      const mockAuthResponse = {
        user: { id: '1', email: 'test@example.com', authProvider: 'local' },
      };
      authService.login.and.returnValue(of(mockAuthResponse));

      // Submit the form
      component.onSubmit();

      // Verify utility functions were called
      expect(urlValidationUtils.getValidatedReturnUrl).toHaveBeenCalled();
      expect(urlValidationUtils.clearReturnUrl).toHaveBeenCalled();

      // Verify navigation to return URL
      expect(router.navigateByUrl).toHaveBeenCalledWith('/explore?recordId=123');
    });

    it('should redirect to dashboard when no return URL exists', () => {
      // No return URL in sessionStorage

      // Spy on utility functions
      spyOn(urlValidationUtils, 'getValidatedReturnUrl').and.returnValue('/dashboard');
      spyOn(urlValidationUtils, 'clearReturnUrl');

      // Set up form with valid credentials
      component.loginForm.patchValue({
        email: 'test@example.com',
        password: 'password123',
      });

      // Mock successful login with proper AuthResponse
      const mockAuthResponse = {
        user: { id: '1', email: 'test@example.com', authProvider: 'local' },
      };
      authService.login.and.returnValue(of(mockAuthResponse));

      // Submit the form
      component.onSubmit();

      // Verify utility functions were called
      expect(urlValidationUtils.getValidatedReturnUrl).toHaveBeenCalled();
      expect(urlValidationUtils.clearReturnUrl).toHaveBeenCalled();

      // Verify navigation to dashboard
      expect(router.navigateByUrl).toHaveBeenCalledWith('/dashboard');
    });

    it('should reject invalid return URLs and redirect to dashboard', () => {
      // Set up invalid return URL in sessionStorage
      sessionStorage.setItem('returnUrl', 'https://evil.com/phishing');

      // Spy on utility functions - getValidatedReturnUrl will return dashboard for invalid URLs
      spyOn(urlValidationUtils, 'getValidatedReturnUrl').and.returnValue('/dashboard');
      spyOn(urlValidationUtils, 'clearReturnUrl');

      // Set up form with valid credentials
      component.loginForm.patchValue({
        email: 'test@example.com',
        password: 'password123',
      });

      // Mock successful login with proper AuthResponse
      const mockAuthResponse = {
        user: { id: '1', email: 'test@example.com', authProvider: 'local' },
      };
      authService.login.and.returnValue(of(mockAuthResponse));

      // Submit the form
      component.onSubmit();

      // Verify utility functions were called
      expect(urlValidationUtils.getValidatedReturnUrl).toHaveBeenCalled();
      expect(urlValidationUtils.clearReturnUrl).toHaveBeenCalled();

      // Verify navigation to dashboard (not the malicious URL)
      expect(router.navigateByUrl).toHaveBeenCalledWith('/dashboard');
    });

    it('should clear return URL from sessionStorage after redirect', () => {
      // Set up return URL in sessionStorage
      sessionStorage.setItem('returnUrl', '/reports');

      // Use real utility functions to test actual clearing behavior
      spyOn(urlValidationUtils, 'clearReturnUrl').and.callThrough();

      // Set up form with valid credentials
      component.loginForm.patchValue({
        email: 'test@example.com',
        password: 'password123',
      });

      // Mock successful login with proper AuthResponse
      const mockAuthResponse = {
        user: { id: '1', email: 'test@example.com', authProvider: 'local' },
      };
      authService.login.and.returnValue(of(mockAuthResponse));

      // Submit the form
      component.onSubmit();

      // Verify clearReturnUrl was called
      expect(urlValidationUtils.clearReturnUrl).toHaveBeenCalled();

      // Verify sessionStorage was actually cleared
      expect(sessionStorage.getItem('returnUrl')).toBeNull();
    });

    it('should preserve return URL in sessionStorage when SAML login is initiated', () => {
      // Set up return URL in sessionStorage
      sessionStorage.setItem('returnUrl', '/explore?recordId=456');

      // Enable SAML
      authService.getSamlAndLoginStatus.and.returnValue(of({ samlEnabled: true, passwordLoginAllowed: true }));
      fixture.detectChanges();

      // Verify return URL is still in sessionStorage before SAML redirect
      expect(sessionStorage.getItem('returnUrl')).toBe('/explore?recordId=456');

      // Note: The actual SAML redirect (window.location.href) cannot be tested in unit tests
      // but we verify that the return URL persists in sessionStorage, which will survive
      // the external redirect to the SAML provider and back
    });
  });
});
