import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { TotpVerificationComponent } from './totp-verification.component';
import { AuthService } from '../../services/auth.service';
import { createSpyObj, SpyObj } from '../../../testing/mock-helpers';
import * as urlValidationUtils from '../../utils/url-validation.utils';

describe('TotpVerificationComponent', () => {
  let component: TotpVerificationComponent;
  let fixture: ComponentFixture<TotpVerificationComponent>;
  let authService: SpyObj<AuthService>;
  let router: SpyObj<Router>;

  beforeEach(async () => {
    const authSpy = createSpyObj('AuthService', ['verifyTotp', 'verifyRecoveryCode', 'fetchCurrentUser']);
    const routerSpy = createSpyObj('Router', ['navigate', 'navigateByUrl']);

    await TestBed.configureTestingModule({
      imports: [TotpVerificationComponent, NoopAnimationsModule],
      providers: [
        { provide: AuthService, useValue: authSpy },
        { provide: Router, useValue: routerSpy },
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    authService = TestBed.inject(AuthService) as SpyObj<AuthService>;
    router = TestBed.inject(Router) as SpyObj<Router>;

    fixture = TestBed.createComponent(TotpVerificationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize form with TOTP mode', () => {
    expect(component.useRecoveryCode).toBe(false);
    expect(component.verificationForm).toBeTruthy();
    expect(component.verificationForm.get('totpCode')).toBeTruthy();
    expect(component.verificationForm.get('recoveryCode')).toBeTruthy();
  });

  describe('toggleMode', () => {
    it('should switch to recovery code mode', () => {
      component.toggleMode();
      expect(component.useRecoveryCode).toBe(true);
      expect(component.errorMessage).toBe('');
    });

    it('should switch back to TOTP mode', () => {
      component.toggleMode();
      component.toggleMode();
      expect(component.useRecoveryCode).toBe(false);
    });

    it('should clear fields when toggling', () => {
      component.verificationForm.patchValue({ totpCode: '123456' });
      component.toggleMode();
      expect(component.verificationForm.get('totpCode')?.value).toBe('');
      expect(component.verificationForm.get('recoveryCode')?.value).toBe('');
    });
  });

  describe('isFormValid', () => {
    it('should validate TOTP code (6 digits)', () => {
      component.verificationForm.patchValue({ totpCode: '123456' });
      expect(component.isFormValid).toBe(true);
    });

    it('should reject invalid TOTP code', () => {
      component.verificationForm.patchValue({ totpCode: '12345' });
      expect(component.isFormValid).toBe(false);
    });

    it('should validate recovery code in recovery mode', () => {
      component.toggleMode();
      component.verificationForm.patchValue({ recoveryCode: 'ABCD-1234-EFGH-5678' });
      expect(component.isFormValid).toBe(true);
    });

    it('should reject invalid recovery code', () => {
      component.toggleMode();
      component.verificationForm.patchValue({ recoveryCode: 'invalid' });
      expect(component.isFormValid).toBe(false);
    });
  });

  describe('onSubmit', () => {
    it('should not submit when already submitting', () => {
      component.isSubmitting = true;
      component.onSubmit();
      expect(authService.verifyTotp).not.toHaveBeenCalled();
    });

    it('should not submit with invalid form', () => {
      component.verificationForm.patchValue({ totpCode: '' });
      component.onSubmit();
      expect(authService.verifyTotp).not.toHaveBeenCalled();
    });
  });

  describe('verify (TOTP)', () => {
    beforeEach(() => {
      vi.spyOn(urlValidationUtils, 'getValidatedReturnUrl').mockReturnValue('/dashboard');
      vi.spyOn(urlValidationUtils, 'clearReturnUrl');
    });

    it('should verify TOTP and navigate on success', () => {
      authService.verifyTotp.mockReturnValue(of({}));
      authService.fetchCurrentUser.mockReturnValue(of({ id: '1', email: 'test@test.com', authProvider: 'local' }));

      component.verificationForm.patchValue({ totpCode: '123456' });
      component.onSubmit();

      expect(authService.verifyTotp).toHaveBeenCalledWith('123456');
      expect(authService.fetchCurrentUser).toHaveBeenCalled();
      expect(router.navigateByUrl).toHaveBeenCalledWith('/dashboard');
      expect(urlValidationUtils.clearReturnUrl).toHaveBeenCalled();
    });

    it('should navigate even if fetchCurrentUser fails', () => {
      authService.verifyTotp.mockReturnValue(of({}));
      authService.fetchCurrentUser.mockReturnValue(throwError(() => new Error('Failed')));

      component.verificationForm.patchValue({ totpCode: '123456' });
      component.onSubmit();

      expect(router.navigateByUrl).toHaveBeenCalledWith('/dashboard');
    });

    it('should handle rate limit error (429)', () => {
      authService.verifyTotp.mockReturnValue(
        throwError(() => ({ status: 429, error: { message: 'Too many attempts' } }))
      );

      component.verificationForm.patchValue({ totpCode: '123456' });
      component.onSubmit();

      expect(component.errorMessage).toBe('Too many attempts');
      expect(component.isSubmitting).toBe(false);
    });

    it('should handle expired session (401)', fakeAsync(() => {
      authService.verifyTotp.mockReturnValue(
        throwError(() => ({ status: 401, error: { message: 'session expired' } }))
      );

      component.verificationForm.patchValue({ totpCode: '123456' });
      component.onSubmit();

      expect(component.errorMessage).toBe('Verification session expired. Please log in again.');
      tick(2000);
      expect(router.navigate).toHaveBeenCalledWith(['/login']);
    }));

    it('should handle invalid code (401)', () => {
      authService.verifyTotp.mockReturnValue(throwError(() => ({ status: 401, error: { message: 'Invalid code' } })));

      component.verificationForm.patchValue({ totpCode: '123456' });
      component.onSubmit();

      expect(component.errorMessage).toBe('Invalid verification code. Please try again.');
    });

    it('should handle network error', () => {
      authService.verifyTotp.mockReturnValue(throwError(() => ({ status: 0 })));

      component.verificationForm.patchValue({ totpCode: '123456' });
      component.onSubmit();

      expect(component.errorMessage).toBe('Unable to connect to the server. Please check your connection.');
    });

    it('should handle generic error', () => {
      authService.verifyTotp.mockReturnValue(throwError(() => ({ status: 500 })));

      component.verificationForm.patchValue({ totpCode: '123456' });
      component.onSubmit();

      expect(component.errorMessage).toBe('Verification failed. Please try again.');
    });

    it('should handle array error messages', () => {
      authService.verifyTotp.mockReturnValue(
        throwError(() => ({ status: 400, error: { message: ['Error 1', 'Error 2'] } }))
      );

      component.verificationForm.patchValue({ totpCode: '123456' });
      component.onSubmit();

      expect(component.errorMessage).toBe('Error 1, Error 2');
    });
  });

  describe('verifyRecovery', () => {
    beforeEach(() => {
      vi.spyOn(urlValidationUtils, 'getValidatedReturnUrl').mockReturnValue('/dashboard');
      vi.spyOn(urlValidationUtils, 'clearReturnUrl');
      component.toggleMode(); // Switch to recovery mode
    });

    it('should verify recovery code and navigate on success', () => {
      authService.verifyRecoveryCode.mockReturnValue(of({}));
      authService.fetchCurrentUser.mockReturnValue(of({ id: '1', email: 'test@test.com', authProvider: 'local' }));

      component.verificationForm.patchValue({ recoveryCode: 'ABCD-1234-EFGH-5678' });
      component.onSubmit();

      expect(authService.verifyRecoveryCode).toHaveBeenCalledWith('ABCD-1234-EFGH-5678');
      expect(router.navigateByUrl).toHaveBeenCalledWith('/dashboard');
    });

    it('should handle used recovery code error', () => {
      authService.verifyRecoveryCode.mockReturnValue(
        throwError(() => ({ status: 401, error: { message: 'Code already used' } }))
      );

      component.verificationForm.patchValue({ recoveryCode: 'ABCD-1234-EFGH-5678' });
      component.onSubmit();

      expect(component.errorMessage).toBe('This recovery code has already been used. Please use a different code.');
    });

    it('should handle invalid recovery code (401)', () => {
      authService.verifyRecoveryCode.mockReturnValue(
        throwError(() => ({ status: 401, error: { message: 'Invalid' } }))
      );

      component.verificationForm.patchValue({ recoveryCode: 'ABCD-1234-EFGH-5678' });
      component.onSubmit();

      expect(component.errorMessage).toBe('Invalid recovery code. Please try again.');
    });
  });

  describe('formatRecoveryCode', () => {
    it('should format input with dashes', () => {
      const input = { value: 'abcd1234efgh5678' } as HTMLInputElement;
      const event = { target: input } as unknown as Event;
      component.formatRecoveryCode(event);
      expect(component.verificationForm.get('recoveryCode')?.value).toBe('ABCD-1234-EFGH-5678');
    });

    it('should strip invalid characters', () => {
      const input = { value: 'ab!@#cd12' } as HTMLInputElement;
      const event = { target: input } as unknown as Event;
      component.formatRecoveryCode(event);
      expect(component.verificationForm.get('recoveryCode')?.value).toBe('ABCD-12');
    });

    it('should limit to 19 characters', () => {
      const input = { value: 'ABCD1234EFGH5678EXTRA' } as HTMLInputElement;
      const event = { target: input } as unknown as Event;
      component.formatRecoveryCode(event);
      const value = component.verificationForm.get('recoveryCode')?.value;
      expect(value.length).toBeLessThanOrEqual(19);
    });
  });
});
