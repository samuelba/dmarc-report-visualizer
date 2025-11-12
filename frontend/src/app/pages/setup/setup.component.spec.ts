import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { SetupComponent } from './setup.component';
import { AuthService } from '../../services/auth.service';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

describe('SetupComponent - Return URL Clearing', () => {
  let component: SetupComponent;
  let fixture: ComponentFixture<SetupComponent>;
  let authService: jasmine.SpyObj<AuthService>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    const authServiceSpy = jasmine.createSpyObj('AuthService', ['setup']);
    const routerSpy = jasmine.createSpyObj('Router', ['navigate']);

    await TestBed.configureTestingModule({
      imports: [SetupComponent, ReactiveFormsModule, BrowserAnimationsModule],
      providers: [
        { provide: AuthService, useValue: authServiceSpy },
        { provide: Router, useValue: routerSpy },
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    authService = TestBed.inject(AuthService) as jasmine.SpyObj<AuthService>;
    router = TestBed.inject(Router) as jasmine.SpyObj<Router>;

    fixture = TestBed.createComponent(SetupComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    // Clean up sessionStorage after each test
    sessionStorage.clear();
  });

  it('should always redirect to dashboard regardless of stored return URL', () => {
    // Set up a return URL in sessionStorage (simulating user was redirected from a protected route)
    sessionStorage.setItem('returnUrl', '/explore?recordId=123');

    // Set up form with valid data
    component.setupForm.patchValue({
      email: 'admin@example.com',
      password: 'SecurePass123!',
      passwordConfirmation: 'SecurePass123!',
    });

    // Mock successful setup
    const mockAuthResponse = {
      user: { id: '1', email: 'admin@example.com', authProvider: 'local' },
    };
    authService.setup.and.returnValue(of(mockAuthResponse));

    // Submit the form
    component.onSubmit();

    // Verify navigation always goes to dashboard (not the return URL)
    expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);

    // Verify return URL was cleared
    expect(sessionStorage.getItem('returnUrl')).toBeNull();
  });

  it('should clear return URL from sessionStorage after setup', () => {
    // Set up a return URL in sessionStorage
    sessionStorage.setItem('returnUrl', '/reports');

    // Verify it's there before setup
    expect(sessionStorage.getItem('returnUrl')).toBe('/reports');

    // Set up form with valid data
    component.setupForm.patchValue({
      email: 'admin@example.com',
      password: 'SecurePass123!',
      passwordConfirmation: 'SecurePass123!',
    });

    // Mock successful setup
    const mockAuthResponse = {
      user: { id: '1', email: 'admin@example.com', authProvider: 'local' },
    };
    authService.setup.and.returnValue(of(mockAuthResponse));

    // Submit the form
    component.onSubmit();

    // Verify return URL was cleared from sessionStorage
    expect(sessionStorage.getItem('returnUrl')).toBeNull();

    // Verify navigation to dashboard
    expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
  });

  it('should redirect to dashboard even when no return URL exists', () => {
    // Ensure no return URL in sessionStorage
    expect(sessionStorage.getItem('returnUrl')).toBeNull();

    // Set up form with valid data
    component.setupForm.patchValue({
      email: 'admin@example.com',
      password: 'SecurePass123!',
      passwordConfirmation: 'SecurePass123!',
    });

    // Mock successful setup
    const mockAuthResponse = {
      user: { id: '1', email: 'admin@example.com', authProvider: 'local' },
    };
    authService.setup.and.returnValue(of(mockAuthResponse));

    // Submit the form
    component.onSubmit();

    // Verify navigation to dashboard
    expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
  });

  it('should not clear return URL if setup fails', () => {
    // Set up a return URL in sessionStorage
    sessionStorage.setItem('returnUrl', '/explore');

    // Set up form with valid data
    component.setupForm.patchValue({
      email: 'admin@example.com',
      password: 'SecurePass123!',
      passwordConfirmation: 'SecurePass123!',
    });

    // Mock failed setup
    const errorResponse = {
      error: { message: 'Setup failed' },
      status: 400,
    };
    authService.setup.and.returnValue(throwError(() => errorResponse));

    // Submit the form
    component.onSubmit();

    // Verify return URL was NOT cleared (since setup failed)
    expect(sessionStorage.getItem('returnUrl')).toBe('/explore');

    // Verify no navigation occurred
    expect(router.navigate).not.toHaveBeenCalled();
  });
});
