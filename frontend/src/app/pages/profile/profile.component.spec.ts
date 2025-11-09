import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { of } from 'rxjs';
import { ProfileComponent } from './profile.component';
import { AuthService, User } from '../../services/auth.service';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

describe('ProfileComponent - SAML User Handling', () => {
  let component: ProfileComponent;
  let fixture: ComponentFixture<ProfileComponent>;
  let authService: jasmine.SpyObj<AuthService>;

  const localUser: User = {
    id: '123',
    email: 'local@example.com',
    authProvider: 'local',
  };

  const samlUser: User = {
    id: '456',
    email: 'saml@example.com',
    authProvider: 'saml',
  };

  beforeEach(async () => {
    const authServiceSpy = jasmine.createSpyObj('AuthService', ['getCurrentUser', 'changePassword']);

    // Default: return local user
    authServiceSpy.getCurrentUser.and.returnValue(of(localUser));

    await TestBed.configureTestingModule({
      imports: [ProfileComponent, ReactiveFormsModule, BrowserAnimationsModule],
      providers: [{ provide: AuthService, useValue: authServiceSpy }, provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    authService = TestBed.inject(AuthService) as jasmine.SpyObj<AuthService>;

    fixture = TestBed.createComponent(ProfileComponent);
    component = fixture.componentInstance;
  });

  describe('Authentication Method Display', () => {
    it('should display Local authentication method for local users', () => {
      authService.getCurrentUser.and.returnValue(of(localUser));

      fixture.detectChanges();

      expect(component.authProvider).toBe('local');
      expect(component.isSamlUser).toBe(false);

      const compiled = fixture.nativeElement;
      const authMethodValue = compiled.querySelector('.auth-method-value');
      expect(authMethodValue).toBeTruthy();
      expect(authMethodValue?.textContent).toContain('Local (Password)');
    });

    it('should display SSO authentication method for SAML users', () => {
      authService.getCurrentUser.and.returnValue(of(samlUser));

      fixture.detectChanges();

      expect(component.authProvider).toBe('saml');
      expect(component.isSamlUser).toBe(true);

      const compiled = fixture.nativeElement;
      const authMethodValue = compiled.querySelector('.auth-method-value');
      expect(authMethodValue).toBeTruthy();
      expect(authMethodValue?.textContent).toContain('SSO (Single Sign-On)');
    });

    it('should display correct icon for local users', () => {
      authService.getCurrentUser.and.returnValue(of(localUser));

      fixture.detectChanges();

      const compiled = fixture.nativeElement;
      const authMethodSection = compiled.querySelector('.auth-method');
      const icon = authMethodSection?.querySelector('mat-icon');
      expect(icon?.textContent?.trim()).toBe('lock');
    });

    it('should display correct icon for SAML users', () => {
      authService.getCurrentUser.and.returnValue(of(samlUser));

      fixture.detectChanges();

      const compiled = fixture.nativeElement;
      const authMethodSection = compiled.querySelector('.auth-method');
      const icon = authMethodSection?.querySelector('mat-icon');
      expect(icon?.textContent?.trim()).toBe('business');
    });
  });

  describe('Password Change Form Visibility', () => {
    it('should show password change form for local users', () => {
      authService.getCurrentUser.and.returnValue(of(localUser));

      fixture.detectChanges();

      expect(component.isSamlUser).toBe(false);

      const compiled = fixture.nativeElement;
      const passwordForm = compiled.querySelector('form');
      const samlMessage = compiled.querySelector('.saml-user-message');

      expect(passwordForm).toBeTruthy();
      expect(samlMessage).toBeFalsy();
    });

    it('should hide password change form for SAML users', () => {
      authService.getCurrentUser.and.returnValue(of(samlUser));

      fixture.detectChanges();

      expect(component.isSamlUser).toBe(true);

      const compiled = fixture.nativeElement;
      const passwordForm = compiled.querySelector('form');
      const samlMessage = compiled.querySelector('.saml-user-message');

      expect(passwordForm).toBeFalsy();
      expect(samlMessage).toBeTruthy();
    });

    it('should display IdP message for SAML users', () => {
      authService.getCurrentUser.and.returnValue(of(samlUser));

      fixture.detectChanges();

      const compiled = fixture.nativeElement;
      const samlMessage = compiled.querySelector('.saml-user-message');
      const messageText = samlMessage?.textContent;

      expect(messageText).toContain("Password management is handled by your organization's Identity Provider");
    });
  });

  describe('Password Form Functionality', () => {
    it('should initialize password form for local users', () => {
      authService.getCurrentUser.and.returnValue(of(localUser));

      fixture.detectChanges();

      expect(component.passwordForm).toBeDefined();
      expect(component.passwordForm.get('currentPassword')).toBeDefined();
      expect(component.passwordForm.get('newPassword')).toBeDefined();
      expect(component.passwordForm.get('newPasswordConfirmation')).toBeDefined();
    });

    it('should not display password form fields for SAML users', () => {
      authService.getCurrentUser.and.returnValue(of(samlUser));

      fixture.detectChanges();

      const compiled = fixture.nativeElement;
      const currentPasswordField = compiled.querySelector('input[formControlName="currentPassword"]');
      const newPasswordField = compiled.querySelector('input[formControlName="newPassword"]');
      const confirmPasswordField = compiled.querySelector('input[formControlName="newPasswordConfirmation"]');

      expect(currentPasswordField).toBeFalsy();
      expect(newPasswordField).toBeFalsy();
      expect(confirmPasswordField).toBeFalsy();
    });
  });
});
