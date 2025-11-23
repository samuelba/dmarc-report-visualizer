import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { InviteUserDialogComponent } from './invite-user-dialog.component';
import { UserService, UserRole, InviteResponse } from '../../services/user.service';
import { MaterialModule } from '../../shared/material.module';

describe('InviteUserDialogComponent', () => {
  let component: InviteUserDialogComponent;
  let fixture: ComponentFixture<InviteUserDialogComponent>;
  let userService: jasmine.SpyObj<UserService>;
  let dialogRef: jasmine.SpyObj<MatDialogRef<InviteUserDialogComponent>>;
  let snackBar: jasmine.SpyObj<MatSnackBar>;

  beforeEach(async () => {
    const userServiceSpy = jasmine.createSpyObj('UserService', ['createInvite']);
    const dialogRefSpy = jasmine.createSpyObj('MatDialogRef', ['close']);
    const snackBarSpy = jasmine.createSpyObj('MatSnackBar', ['open']);

    await TestBed.configureTestingModule({
      imports: [InviteUserDialogComponent, ReactiveFormsModule, MaterialModule, BrowserAnimationsModule],
      providers: [
        { provide: UserService, useValue: userServiceSpy },
        { provide: MatDialogRef, useValue: dialogRefSpy },
        { provide: MatSnackBar, useValue: snackBarSpy },
      ],
    }).compileComponents();

    userService = TestBed.inject(UserService) as jasmine.SpyObj<UserService>;
    dialogRef = TestBed.inject(MatDialogRef) as jasmine.SpyObj<MatDialogRef<InviteUserDialogComponent>>;
    snackBar = TestBed.inject(MatSnackBar) as jasmine.SpyObj<MatSnackBar>;

    fixture = TestBed.createComponent(InviteUserDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Form Validation', () => {
    it('should initialize form with empty email and default user role', () => {
      expect(component.inviteForm.get('email')?.value).toBe('');
      expect(component.inviteForm.get('role')?.value).toBe(UserRole.USER);
    });

    it('should mark form as invalid when email is empty', () => {
      component.inviteForm.patchValue({ email: '', role: UserRole.USER });
      expect(component.inviteForm.invalid).toBe(true);
    });

    it('should mark form as invalid when email format is incorrect', () => {
      component.inviteForm.patchValue({ email: 'invalid-email', role: UserRole.USER });
      expect(component.inviteForm.invalid).toBe(true);
      expect(component.inviteForm.get('email')?.hasError('email')).toBe(true);
    });

    it('should mark form as valid when email is correct and role is selected', () => {
      component.inviteForm.patchValue({ email: 'user@example.com', role: UserRole.USER });
      expect(component.inviteForm.valid).toBe(true);
    });

    it('should have both user and administrator role options', () => {
      expect(component.roles.length).toBe(2);
      expect(component.roles[0].value).toBe(UserRole.USER);
      expect(component.roles[1].value).toBe(UserRole.ADMINISTRATOR);
    });
  });

  describe('Invite Generation', () => {
    it('should not generate invite when form is invalid', () => {
      component.inviteForm.patchValue({ email: '', role: UserRole.USER });
      component.generateInvite();

      expect(component.errorMessage).toBe('Please fill in all required fields correctly');
      expect(userService.createInvite).not.toHaveBeenCalled();
    });

    it('should call UserService.createInvite with correct parameters', () => {
      const mockResponse: InviteResponse = {
        id: 'invite-123',
        email: 'newuser@example.com',
        role: UserRole.USER,
        inviteLink: 'https://app.example.com/invite/abc123token',
        expiresAt: new Date('2024-01-08'),
        emailStatus: 'sent',
      };

      userService.createInvite.and.returnValue(of(mockResponse));

      component.inviteForm.patchValue({ email: 'newuser@example.com', role: UserRole.USER });
      component.generateInvite();

      expect(userService.createInvite).toHaveBeenCalledWith('newuser@example.com', UserRole.USER);
    });

    it('should display generated invite link on success', () => {
      const mockResponse: InviteResponse = {
        id: 'invite-123',
        email: 'newuser@example.com',
        role: UserRole.USER,
        inviteLink: 'https://app.example.com/invite/abc123token',
        expiresAt: new Date('2024-01-08'),
        emailStatus: 'sent',
      };

      userService.createInvite.and.returnValue(of(mockResponse));

      component.inviteForm.patchValue({ email: 'newuser@example.com', role: UserRole.USER });
      component.generateInvite();

      expect(component.generatedInvite).toEqual(mockResponse);
      expect(component.isLoading).toBe(false);
      expect(snackBar.open).toHaveBeenCalledWith('Invite created successfully!', 'Close', { duration: 3000 });
    });

    it('should handle error when email already exists', () => {
      const errorResponse = {
        error: { message: 'A user with this email already exists' },
      };

      userService.createInvite.and.returnValue(throwError(() => errorResponse));

      component.inviteForm.patchValue({ email: 'existing@example.com', role: UserRole.USER });
      component.generateInvite();

      expect(component.errorMessage).toBe('A user with this email already exists');
      expect(component.isLoading).toBe(false);
      expect(component.generatedInvite).toBeNull();
    });

    it('should handle generic error', () => {
      userService.createInvite.and.returnValue(throwError(() => ({})));

      component.inviteForm.patchValue({ email: 'user@example.com', role: UserRole.USER });
      component.generateInvite();

      expect(component.errorMessage).toBe('Failed to create invite. Please try again.');
      expect(component.isLoading).toBe(false);
    });

    it('should set loading state during invite generation', () => {
      const mockResponse: InviteResponse = {
        id: 'invite-123',
        email: 'newuser@example.com',
        role: UserRole.USER,
        inviteLink: 'https://app.example.com/invite/abc123token',
        expiresAt: new Date('2024-01-08'),
        emailStatus: 'sent',
      };

      userService.createInvite.and.returnValue(of(mockResponse));

      component.inviteForm.patchValue({ email: 'newuser@example.com', role: UserRole.USER });

      expect(component.isLoading).toBe(false);
      component.generateInvite();
      expect(component.isLoading).toBe(true);

      // After observable completes
      fixture.detectChanges();
      expect(component.isLoading).toBe(false);
    });
  });

  describe('Link Display and Copy', () => {
    beforeEach(() => {
      const mockResponse: InviteResponse = {
        id: 'invite-123',
        email: 'newuser@example.com',
        role: UserRole.USER,
        inviteLink: 'https://app.example.com/invite/abc123token',
        expiresAt: new Date('2024-01-08T12:00:00Z'),
        emailStatus: 'sent',
      };

      userService.createInvite.and.returnValue(of(mockResponse));
      component.inviteForm.patchValue({ email: 'newuser@example.com', role: UserRole.USER });
      component.generateInvite();
    });

    it('should display invite link after generation', () => {
      expect(component.generatedInvite).toBeTruthy();
      expect(component.generatedInvite?.inviteLink).toBe('https://app.example.com/invite/abc123token');
    });

    it('should copy invite link to clipboard', async () => {
      spyOn(navigator.clipboard, 'writeText').and.returnValue(Promise.resolve());

      await component.copyLink();

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://app.example.com/invite/abc123token');
      expect(snackBar.open).toHaveBeenCalledWith('Invite link copied to clipboard', 'Close', { duration: 2000 });
    });

    it('should handle clipboard copy failure', async () => {
      spyOn(navigator.clipboard, 'writeText').and.returnValue(Promise.reject());

      await component.copyLink();

      expect(snackBar.open).toHaveBeenCalledWith('Failed to copy to clipboard', 'Close', { duration: 2000 });
    });

    it('should not copy if no invite is generated', () => {
      component.generatedInvite = null;
      spyOn(navigator.clipboard, 'writeText');

      component.copyLink();

      expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    });

    it('should display expiration date', () => {
      const expirationDate = component.expirationDate;
      expect(expirationDate).toBeTruthy();
      expect(expirationDate).toContain('2024');
    });

    it('should return empty string for expiration date when no invite', () => {
      component.generatedInvite = null;
      expect(component.expirationDate).toBe('');
    });
  });

  describe('Dialog Actions', () => {
    it('should close dialog with false when cancelled without generating invite', () => {
      component.close();
      expect(dialogRef.close).toHaveBeenCalledWith(false);
    });

    it('should close dialog with true when invite was generated', () => {
      component.generatedInvite = {
        id: 'invite-123',
        email: 'newuser@example.com',
        role: UserRole.USER,
        inviteLink: 'https://app.example.com/invite/abc123token',
        expiresAt: new Date('2024-01-08'),
        emailStatus: 'sent',
      };

      component.close();
      expect(dialogRef.close).toHaveBeenCalledWith(true);
    });
  });
});
