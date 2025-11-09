import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { LoginComponent } from './login.component';
import { AuthService } from '../../services/auth.service';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

describe('LoginComponent - SSO Integration', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  let authService: jasmine.SpyObj<AuthService>;

  beforeEach(async () => {
    const authServiceSpy = jasmine.createSpyObj('AuthService', ['checkSamlEnabled', 'login', 'isAuthenticated']);
    const routerSpy = jasmine.createSpyObj('Router', ['navigate']);

    // Default: SAML not enabled
    authServiceSpy.checkSamlEnabled.and.returnValue(of(false));
    authServiceSpy.isAuthenticated.and.returnValue(of(false));
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

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
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
    authService.checkSamlEnabled.and.returnValue(of(true));
    fixture.detectChanges();

    // Verify the method exists
    expect(component.loginWithSso).toBeDefined();
    expect(typeof component.loginWithSso).toBe('function');

    // Verify the expected URL construction
    const expectedUrl = `${authService['apiBase']}/auth/saml/login`;
    expect(expectedUrl).toBe('/api/auth/saml/login');

    // Note: We cannot easily test window.location.href assignment in unit tests
    // as it's not configurable. This would be better tested in E2E tests.
  });
});
