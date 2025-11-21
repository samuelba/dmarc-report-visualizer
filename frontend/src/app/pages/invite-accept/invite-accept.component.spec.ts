import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { of, throwError } from 'rxjs';
import { InviteAcceptComponent } from './invite-accept.component';
import { UserService, UserRole, InviteDetailsResponse, AuthResponse } from '../../services/user.service';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

describe('InviteAcceptComponent', () => {
  let component: InviteAcceptComponent;
  let fixture: ComponentFixture<InviteAcceptComponent>;
  let userService: jasmine.SpyObj<UserService>;
  let router: jasmine.SpyObj<Router>;
  let activatedRoute: any;

  beforeEach(async () => {
    const userServiceSpy = jasmine.createSpyObj('UserService', ['getInviteDetails', 'acceptInvite']);
    const routerSpy = jasmine.createSpyObj('Router', ['navigate']);

    // Mock ActivatedRoute with a token parameter
    activatedRoute = {
      snapshot: {
        params: { token: 'test-token-123' },
      },
    };

    await TestBed.configureTestingModule({
      imports: [InviteAcceptComponent, ReactiveFormsModule, BrowserAnimationsModule],
      providers: [
        { provide: UserService, useValue: userServiceSpy },
        { provide: Router, useValue: routerSpy },
        { provide: ActivatedRoute, useValue: activatedRoute },
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    userService = TestBed.inject(UserService) as jasmine.SpyObj<UserService>;
    router = TestBed.inject(Router) as jasmine.SpyObj<Router>;

    fixture = TestBed.createComponent(InviteAcceptComponent);
    component = fixture.componentInstance;
  });

  describe('Invite Details Loading', () => {
    it('should load invite details on init', () => {
      const mockInviteDetails: InviteDetailsResponse = {
        valid: true,
        email: 'test@example.com',
        role: UserRole.USER,
        expiresAt: new Date('2025-12-31'),
      };

      userService.getInviteDetails.and.returnValue(of(mockInviteDetails));

      fixture.detectChanges(); // Triggers ngOnInit

      expect(component.token).toBe('test-token-123');
      expect(userService.getInviteDetails).toHaveBeenCalledWith('test-token-123');
      expect(component.inviteDetails).toEqual(mockInviteDetails);
      expect(component.loading).toBe(false);
      expect(component.error).toBeNull();
    });

    it('should display email and role from invite', () => {
      const mockInviteDetails: InviteDetailsResponse = {
        valid: true,
        email: 'admin@example.com',
        role: UserRole.ADMINISTRATOR,
        expiresAt: new Date('2025-12-31'),
      };

      userService.getInviteDetails.and.returnValue(of(mockInviteDetails));

      fixture.detectChanges();

      expect(component.inviteDetails?.email).toBe('admin@example.com');
      expect(component.inviteDetails?.role).toBe(UserRole.ADMINISTRATOR);
      expect(component.roleLabel).toBe('Administrator');
    });

    it('should show error for invalid token', () => {
      const mockInviteDetails: InviteDetailsResponse = {
        valid: false,
        error: 'Invalid or expired invitation',
      };

      userService.getInviteDetails.and.returnValue(of(mockInviteDetails));

      fixture.detectChanges();

      expect(component.loading).toBe(false);
      expect(component.error).toBe('Invalid or expired invitation');
      expect(component.inviteDetails?.valid).toBe(false);
    });

    it('should show error for expired token', () => {
      const mockInviteDetails: InviteDetailsResponse = {
        valid: false,
        error: 'This invitation has expired',
      };

      userService.getInviteDetails.and.returnValue(of(mockInviteDetails));

      fixture.detectChanges();

      expect(component.loading).toBe(false);
      expect(component.error).toBe('This invitation has expired');
    });

    it('should handle network error when loading invite details', () => {
      const errorResponse = {
        status: 0,
        error: {},
      };

      userService.getInviteDetails.and.returnValue(throwError(() => errorResponse));

      fixture.detectChanges();

      expect(component.loading).toBe(false);
      expect(component.error).toBe('Unable to connect to the server. Please check your connection.');
    });

    it('should handle server error when loading invite details', () => {
      const errorResponse = {
        status: 500,
        error: { message: 'Internal server error' },
      };

      userService.getInviteDetails.and.returnValue(throwError(() => errorResponse));

      fixture.detectChanges();

      expect(component.loading).toBe(false);
      expect(component.error).toBe('Internal server error');
    });
  });

  describe('Form Validation', () => {
    beforeEach(() => {
      const mockInviteDetails: InviteDetailsResponse = {
        valid: true,
        email: 'test@example.com',
        role: UserRole.USER,
        expiresAt: new Date('2025-12-31'),
      };

      userService.getInviteDetails.and.returnValue(of(mockInviteDetails));
      fixture.detectChanges();
    });

    it('should require password', () => {
      const passwordControl = component.acceptForm.get('password');
      passwordControl?.setValue('');
      expect(passwordControl?.hasError('required')).toBe(true);
    });

    it('should require password confirmation', () => {
      const confirmControl = component.acceptForm.get('passwordConfirmation');
      confirmControl?.setValue('');
      expect(confirmControl?.hasError('required')).toBe(true);
    });

    it('should validate password strength', () => {
      const passwordControl = component.acceptForm.get('password');

      // Weak password
      passwordControl?.setValue('weak');
      expect(passwordControl?.hasError('passwordStrength')).toBe(true);

      // Strong password
      passwordControl?.setValue('SecurePass123!');
      expect(passwordControl?.hasError('passwordStrength')).toBe(false);
    });

    it('should validate password match', () => {
      const passwordControl = component.acceptForm.get('password');
      const confirmControl = component.acceptForm.get('passwordConfirmation');

      passwordControl?.setValue('SecurePass123!');
      confirmControl?.setValue('DifferentPass123!');

      expect(confirmControl?.hasError('passwordMismatch')).toBe(true);

      confirmControl?.setValue('SecurePass123!');
      expect(confirmControl?.hasError('passwordMismatch')).toBe(false);
    });

    it('should mark form as invalid when passwords do not match', () => {
      component.acceptForm.patchValue({
        password: 'SecurePass123!',
        passwordConfirmation: 'DifferentPass123!',
      });

      expect(component.acceptForm.invalid).toBe(true);
    });

    it('should mark form as valid when all requirements are met', () => {
      component.acceptForm.patchValue({
        password: 'SecurePass123!',
        passwordConfirmation: 'SecurePass123!',
      });

      expect(component.acceptForm.valid).toBe(true);
    });
  });

  describe('Invite Acceptance', () => {
    beforeEach(() => {
      const mockInviteDetails: InviteDetailsResponse = {
        valid: true,
        email: 'test@example.com',
        role: UserRole.USER,
        expiresAt: new Date('2025-12-31'),
      };

      userService.getInviteDetails.and.returnValue(of(mockInviteDetails));
      fixture.detectChanges();
    });

    it('should call acceptInvite service on valid form submission', () => {
      const mockAuthResponse: AuthResponse = {
        user: {
          id: '1',
          email: 'test@example.com',
          authProvider: 'local',
          role: UserRole.USER,
        },
      };

      userService.acceptInvite.and.returnValue(of(mockAuthResponse));

      component.acceptForm.patchValue({
        password: 'SecurePass123!',
        passwordConfirmation: 'SecurePass123!',
      });

      component.onSubmit();

      expect(userService.acceptInvite).toHaveBeenCalledWith('test-token-123', 'SecurePass123!', 'SecurePass123!');
    });

    it('should redirect to login after successful acceptance', () => {
      const mockAuthResponse: AuthResponse = {
        user: {
          id: '1',
          email: 'test@example.com',
          authProvider: 'local',
          role: UserRole.USER,
        },
      };

      userService.acceptInvite.and.returnValue(of(mockAuthResponse));

      component.acceptForm.patchValue({
        password: 'SecurePass123!',
        passwordConfirmation: 'SecurePass123!',
      });

      component.onSubmit();

      expect(router.navigate).toHaveBeenCalledWith(['/login'], {
        queryParams: { message: 'Account created successfully. Please log in.' },
      });
    });

    it('should not submit if form is invalid', () => {
      component.acceptForm.patchValue({
        password: 'weak',
        passwordConfirmation: 'weak',
      });

      component.onSubmit();

      expect(userService.acceptInvite).not.toHaveBeenCalled();
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('should handle already used invite error', () => {
      const errorResponse = {
        status: 400,
        error: { message: 'This invitation has already been used' },
      };

      userService.acceptInvite.and.returnValue(throwError(() => errorResponse));

      component.acceptForm.patchValue({
        password: 'SecurePass123!',
        passwordConfirmation: 'SecurePass123!',
      });

      component.onSubmit();

      expect(component.error).toBe('This invitation has already been used');
      expect(component.isSubmitting).toBe(false);
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('should handle expired invite error', () => {
      const errorResponse = {
        status: 400,
        error: { message: 'This invitation has expired' },
      };

      userService.acceptInvite.and.returnValue(throwError(() => errorResponse));

      component.acceptForm.patchValue({
        password: 'SecurePass123!',
        passwordConfirmation: 'SecurePass123!',
      });

      component.onSubmit();

      expect(component.error).toBe('This invitation has expired');
      expect(component.isSubmitting).toBe(false);
    });

    it('should handle network error during acceptance', () => {
      const errorResponse = {
        status: 0,
        error: {},
      };

      userService.acceptInvite.and.returnValue(throwError(() => errorResponse));

      component.acceptForm.patchValue({
        password: 'SecurePass123!',
        passwordConfirmation: 'SecurePass123!',
      });

      component.onSubmit();

      expect(component.error).toBe('Unable to connect to the server. Please check your connection.');
      expect(component.isSubmitting).toBe(false);
    });

    it('should handle validation errors from backend', () => {
      const errorResponse = {
        status: 400,
        error: { message: ['Password is too weak', 'Email already exists'] },
      };

      userService.acceptInvite.and.returnValue(throwError(() => errorResponse));

      component.acceptForm.patchValue({
        password: 'SecurePass123!',
        passwordConfirmation: 'SecurePass123!',
      });

      component.onSubmit();

      expect(component.error).toBe('Password is too weak, Email already exists');
      expect(component.isSubmitting).toBe(false);
    });

    it('should prevent multiple submissions', () => {
      const mockAuthResponse: AuthResponse = {
        user: {
          id: '1',
          email: 'test@example.com',
          authProvider: 'local',
          role: UserRole.USER,
        },
      };

      userService.acceptInvite.and.returnValue(of(mockAuthResponse));

      component.acceptForm.patchValue({
        password: 'SecurePass123!',
        passwordConfirmation: 'SecurePass123!',
      });

      component.isSubmitting = true;
      component.onSubmit();

      expect(userService.acceptInvite).not.toHaveBeenCalled();
    });
  });

  describe('Role Label', () => {
    it('should return "Administrator" for admin role', () => {
      component.inviteDetails = {
        valid: true,
        email: 'admin@example.com',
        role: UserRole.ADMINISTRATOR,
        expiresAt: new Date('2025-12-31'),
      };

      expect(component.roleLabel).toBe('Administrator');
    });

    it('should return "User" for user role', () => {
      component.inviteDetails = {
        valid: true,
        email: 'user@example.com',
        role: UserRole.USER,
        expiresAt: new Date('2025-12-31'),
      };

      expect(component.roleLabel).toBe('User');
    });

    it('should return empty string when no invite details', () => {
      component.inviteDetails = null;

      expect(component.roleLabel).toBe('');
    });
  });
});
