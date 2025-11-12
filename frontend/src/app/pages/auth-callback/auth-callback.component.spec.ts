import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AuthCallbackComponent } from './auth-callback.component';
import { AuthService } from '../../services/auth.service';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import * as urlValidationUtils from '../../utils/url-validation.utils';

describe('AuthCallbackComponent - Return URL redirect', () => {
  let _component: AuthCallbackComponent;
  let fixture: ComponentFixture<AuthCallbackComponent>;
  let authService: jasmine.SpyObj<AuthService>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    const authServiceSpy = jasmine.createSpyObj('AuthService', ['fetchCurrentUser']);
    const routerSpy = jasmine.createSpyObj('Router', ['navigate', 'navigateByUrl']);

    await TestBed.configureTestingModule({
      imports: [AuthCallbackComponent],
      providers: [
        { provide: AuthService, useValue: authServiceSpy },
        { provide: Router, useValue: routerSpy },
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    authService = TestBed.inject(AuthService) as jasmine.SpyObj<AuthService>;
    router = TestBed.inject(Router) as jasmine.SpyObj<Router>;

    fixture = TestBed.createComponent(AuthCallbackComponent);
    _component = fixture.componentInstance;
  });

  afterEach(() => {
    // Clean up sessionStorage after each test
    sessionStorage.clear();
  });

  it('should redirect to return URL after successful SAML authentication', () => {
    // Set up return URL in sessionStorage
    sessionStorage.setItem('returnUrl', '/explore?recordId=123');

    // Spy on utility functions
    spyOn(urlValidationUtils, 'getValidatedReturnUrl').and.returnValue('/explore?recordId=123');
    spyOn(urlValidationUtils, 'clearReturnUrl');

    // Mock successful user fetch
    const mockUser = { id: '1', email: 'test@example.com', authProvider: 'saml' };
    authService.fetchCurrentUser.and.returnValue(of(mockUser));

    // Trigger ngOnInit
    fixture.detectChanges();

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

    // Mock successful user fetch
    const mockUser = { id: '1', email: 'test@example.com', authProvider: 'saml' };
    authService.fetchCurrentUser.and.returnValue(of(mockUser));

    // Trigger ngOnInit
    fixture.detectChanges();

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

    // Mock successful user fetch
    const mockUser = { id: '1', email: 'test@example.com', authProvider: 'saml' };
    authService.fetchCurrentUser.and.returnValue(of(mockUser));

    // Trigger ngOnInit
    fixture.detectChanges();

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

    // Mock successful user fetch
    const mockUser = { id: '1', email: 'test@example.com', authProvider: 'saml' };
    authService.fetchCurrentUser.and.returnValue(of(mockUser));

    // Trigger ngOnInit
    fixture.detectChanges();

    // Verify clearReturnUrl was called
    expect(urlValidationUtils.clearReturnUrl).toHaveBeenCalled();

    // Verify sessionStorage was actually cleared
    expect(sessionStorage.getItem('returnUrl')).toBeNull();
  });

  it('should clear return URL on authentication error', () => {
    // Set up return URL in sessionStorage
    sessionStorage.setItem('returnUrl', '/explore?recordId=789');

    // Use real utility functions to test actual clearing behavior
    spyOn(urlValidationUtils, 'clearReturnUrl').and.callThrough();

    // Mock failed user fetch
    authService.fetchCurrentUser.and.returnValue(throwError(() => new Error('Authentication failed')));

    // Trigger ngOnInit
    fixture.detectChanges();

    // Verify clearReturnUrl was called
    expect(urlValidationUtils.clearReturnUrl).toHaveBeenCalled();

    // Verify sessionStorage was actually cleared
    expect(sessionStorage.getItem('returnUrl')).toBeNull();

    // Verify navigation to login with error
    expect(router.navigate).toHaveBeenCalledWith(['/login'], {
      queryParams: { error: 'saml_callback_failed' },
    });
  });
});
