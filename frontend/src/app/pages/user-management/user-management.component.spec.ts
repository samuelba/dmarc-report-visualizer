import { createSpyObj, SpyObj } from '../../../testing/mock-helpers';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError, NEVER } from 'rxjs';
import { UserManagementComponent } from './user-management.component';
import { UserService, UserResponse, InviteToken, UserRole } from '../../services/user.service';
import { AuthService, User } from '../../services/auth.service';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

describe('UserManagementComponent', () => {
  let component: UserManagementComponent;
  let fixture: ComponentFixture<UserManagementComponent>;
  let userService: SpyObj<UserService>;
  let authService: SpyObj<AuthService>;
  let snackBar: SpyObj<MatSnackBar>;
  let dialog: SpyObj<MatDialog>;

  const mockUsers: UserResponse[] = [
    {
      id: '1',
      email: 'admin@example.com',
      role: UserRole.ADMINISTRATOR,
      authProvider: 'local',
      createdAt: new Date('2024-01-01'),
      totpEnabled: false,
    },
    {
      id: '2',
      email: 'user@example.com',
      role: UserRole.USER,
      authProvider: 'local',
      createdAt: new Date('2024-01-02'),
      totpEnabled: false,
    },
  ];

  const mockInvites: InviteToken[] = [
    {
      id: 'invite1',
      email: 'newuser@example.com',
      role: UserRole.USER,
      token: 'test-token-123',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      used: false,
      createdAt: new Date(),
    },
  ];

  const mockCurrentUser: User = {
    id: '1',
    email: 'admin@example.com',
    authProvider: 'local',
    role: UserRole.ADMINISTRATOR,
  };

  beforeEach(async () => {
    const userServiceSpy = createSpyObj('UserService', [
      'getAllUsers',
      'updateUserRole',
      'deleteUser',
      'getActiveInvites',
      'revokeInvite',
    ]);
    const authServiceSpy = createSpyObj('AuthService', ['getCurrentUser', 'getSamlAndLoginStatus']);

    userServiceSpy.getAllUsers.mockReturnValue(of(mockUsers));
    userServiceSpy.getActiveInvites.mockReturnValue(of(mockInvites));
    authServiceSpy.getCurrentUser.mockReturnValue(of(mockCurrentUser));
    authServiceSpy.getSamlAndLoginStatus.mockReturnValue(of({ samlEnabled: false, passwordLoginAllowed: true }));

    await TestBed.configureTestingModule({
      imports: [UserManagementComponent, BrowserAnimationsModule],
      providers: [
        { provide: UserService, useValue: userServiceSpy },
        { provide: AuthService, useValue: authServiceSpy },
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UserManagementComponent);
    component = fixture.componentInstance;

    userService = TestBed.inject(UserService) as SpyObj<UserService>;
    authService = TestBed.inject(AuthService) as SpyObj<AuthService>;

    // Spy on component-level injected services (provided by Material module imports)
    const dialogInstance = fixture.debugElement.injector.get(MatDialog);
    vi.spyOn(dialogInstance, 'open').mockReturnValue({ afterClosed: () => of(true) } as any);
    dialog = dialogInstance as any;

    const snackBarInstance = fixture.debugElement.injector.get(MatSnackBar);
    vi.spyOn(snackBarInstance, 'open').mockReturnValue({} as any);
    snackBar = snackBarInstance as any;
  });

  describe('Component Initialization', () => {
    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should load users on init', () => {
      fixture.detectChanges();

      expect(userService.getAllUsers).toHaveBeenCalled();
      expect(component.users().length).toBe(2);
      expect(component.users()).toEqual(mockUsers);
    });

    it('should load invites on init', () => {
      fixture.detectChanges();

      expect(userService.getActiveInvites).toHaveBeenCalled();
      expect(component.invites().length).toBe(1);
      expect(component.invites()).toEqual(mockInvites);
    });

    it('should load current user on init', () => {
      fixture.detectChanges();

      expect(authService.getCurrentUser).toHaveBeenCalled();
      expect(component.currentUser()?.id).toBe('1');
    });

    it('should handle error when loading users fails', () => {
      userService.getAllUsers.mockReturnValue(throwError(() => new Error('Failed to load')));

      fixture.detectChanges();

      expect(snackBar.open).toHaveBeenCalledWith('Failed to load users', 'Close', { duration: 5000 });
      expect(component.loading()).toBe(false);
    });

    it('should handle error when loading invites fails', () => {
      userService.getActiveInvites.mockReturnValue(throwError(() => new Error('Failed to load')));

      fixture.detectChanges();

      expect(snackBar.open).toHaveBeenCalledWith('Failed to load invites', 'Close', { duration: 5000 });
      expect(component.invitesLoading()).toBe(false);
    });
  });

  describe('User List Display', () => {
    it('should display all users in the table', () => {
      fixture.detectChanges();

      const compiled = fixture.nativeElement;
      const rows = compiled.querySelectorAll('.users-table tbody tr');
      expect(rows.length).toBe(2);
    });

    it('should display user email', () => {
      fixture.detectChanges();

      const compiled = fixture.nativeElement;
      const emailCells = compiled.querySelectorAll('.users-table tbody tr td:first-child');
      expect(emailCells[0].textContent).toContain('admin@example.com');
      expect(emailCells[1].textContent).toContain('user@example.com');
    });

    it('should display role badges', () => {
      fixture.detectChanges();

      const compiled = fixture.nativeElement;
      const roleChips = compiled.querySelectorAll('.users-table mat-chip');
      expect(roleChips.length).toBe(2);
      expect(roleChips[0].textContent).toContain('Administrator');
      expect(roleChips[1].textContent).toContain('User');
    });

    it('should display auth provider', () => {
      fixture.detectChanges();

      const compiled = fixture.nativeElement;
      const authProviders = compiled.querySelectorAll('.users-table .auth-provider');
      expect(authProviders.length).toBe(2);
      expect(authProviders[0].textContent).toContain('local');
    });

    it('should show loading spinner while loading', () => {
      // Use NEVER so loadUsers never completes, keeping loading=true
      userService.getAllUsers.mockReturnValue(NEVER);
      fixture.detectChanges();

      const compiled = fixture.nativeElement;
      const spinner = compiled.querySelector('.loading-container mat-spinner');
      expect(spinner).toBeTruthy();
    });

    it('should show no data message when no users', () => {
      userService.getAllUsers.mockReturnValue(of([]));
      component.ngOnInit();
      fixture.detectChanges();

      const compiled = fixture.nativeElement;
      const noData = compiled.querySelector('.no-data');
      expect(noData).toBeTruthy();
      expect(noData.textContent).toContain('No users found');
    });
  });

  describe('Role Change', () => {
    it('should call service to update user role', () => {
      dialog.open.mockReturnValue({ afterClosed: () => of(true) } as any);
      userService.updateUserRole.mockReturnValue(of(mockUsers[1]));

      fixture.detectChanges();

      component.changeUserRole(mockUsers[1], UserRole.ADMINISTRATOR);

      expect(userService.updateUserRole).toHaveBeenCalledWith('2', UserRole.ADMINISTRATOR);
      expect(snackBar.open).toHaveBeenCalledWith('User role updated successfully', 'Close', { duration: 3000 });
    });

    it('should show confirmation dialog before changing role', () => {
      dialog.open.mockReturnValue({ afterClosed: () => of(false) } as any);

      fixture.detectChanges();

      component.changeUserRole(mockUsers[1], UserRole.ADMINISTRATOR);

      expect(dialog.open).toHaveBeenCalled();
      expect(userService.updateUserRole).not.toHaveBeenCalled();
    });

    it('should prevent demoting last administrator', () => {
      fixture.detectChanges();

      component.changeUserRole(mockUsers[0], UserRole.USER);

      expect(snackBar.open).toHaveBeenCalledWith(
        'Cannot demote the last local administrator. At least one local administrator must exist.',
        'Close',
        { duration: 5000 }
      );
      expect(userService.updateUserRole).not.toHaveBeenCalled();
    });

    it('should handle error when role change fails', () => {
      dialog.open.mockReturnValue({ afterClosed: () => of(true) } as any);
      const error = { error: { message: 'Role change failed' } };
      userService.updateUserRole.mockReturnValue(throwError(() => error));

      fixture.detectChanges();

      component.changeUserRole(mockUsers[1], UserRole.ADMINISTRATOR);

      expect(snackBar.open).toHaveBeenCalledWith('Role change failed', 'Close', { duration: 5000 });
    });

    it('should refresh user list after successful role change', () => {
      dialog.open.mockReturnValue({ afterClosed: () => of(true) } as any);
      userService.updateUserRole.mockReturnValue(of(mockUsers[1]));

      fixture.detectChanges();

      const initialCallCount = userService.getAllUsers.mock.calls.length;
      component.changeUserRole(mockUsers[1], UserRole.ADMINISTRATOR);

      expect(userService.getAllUsers.mock.calls.length).toBe(initialCallCount + 1);
    });
  });

  describe('User Deletion', () => {
    it('should call service to delete user', () => {
      dialog.open.mockReturnValue({ afterClosed: () => of(true) } as any);
      userService.deleteUser.mockReturnValue(of(void 0));

      fixture.detectChanges();

      component.deleteUser(mockUsers[1]);

      expect(userService.deleteUser).toHaveBeenCalledWith('2');
      expect(snackBar.open).toHaveBeenCalledWith('User deleted successfully', 'Close', { duration: 3000 });
    });

    it('should show confirmation dialog before deleting', () => {
      dialog.open.mockReturnValue({ afterClosed: () => of(false) } as any);

      fixture.detectChanges();

      component.deleteUser(mockUsers[1]);

      expect(dialog.open).toHaveBeenCalled();
      expect(userService.deleteUser).not.toHaveBeenCalled();
    });

    it('should prevent deleting last administrator', () => {
      fixture.detectChanges();

      component.deleteUser(mockUsers[0]);

      expect(snackBar.open).toHaveBeenCalledWith(
        'Cannot delete the last local administrator. At least one local administrator must exist.',
        'Close',
        { duration: 5000 }
      );
      expect(userService.deleteUser).not.toHaveBeenCalled();
    });

    it('should handle error when deletion fails', () => {
      dialog.open.mockReturnValue({ afterClosed: () => of(true) } as any);
      const error = { error: { message: 'Deletion failed' } };
      userService.deleteUser.mockReturnValue(throwError(() => error));

      fixture.detectChanges();

      component.deleteUser(mockUsers[1]);

      expect(snackBar.open).toHaveBeenCalledWith('Deletion failed', 'Close', { duration: 5000 });
    });

    it('should refresh user list after successful deletion', () => {
      dialog.open.mockReturnValue({ afterClosed: () => of(true) } as any);
      userService.deleteUser.mockReturnValue(of(void 0));

      fixture.detectChanges();

      const initialCallCount = userService.getAllUsers.mock.calls.length;
      component.deleteUser(mockUsers[1]);

      expect(userService.getAllUsers.mock.calls.length).toBe(initialCallCount + 1);
    });
  });

  describe('Invite Management', () => {
    it('should display pending invitations', () => {
      fixture.detectChanges();

      const compiled = fixture.nativeElement;
      const inviteRows = compiled.querySelectorAll('.invites-table tbody tr');
      expect(inviteRows.length).toBe(1);
    });

    it('should revoke invite', () => {
      dialog.open.mockReturnValue({ afterClosed: () => of(true) } as any);
      userService.revokeInvite.mockReturnValue(of(void 0));

      fixture.detectChanges();

      component.revokeInvite(mockInvites[0]);

      expect(userService.revokeInvite).toHaveBeenCalledWith('invite1');
      expect(snackBar.open).toHaveBeenCalledWith('Invite revoked successfully', 'Close', { duration: 3000 });
    });

    it('should show confirmation before revoking invite', () => {
      dialog.open.mockReturnValue({ afterClosed: () => of(false) } as any);

      fixture.detectChanges();

      component.revokeInvite(mockInvites[0]);

      expect(dialog.open).toHaveBeenCalled();
      expect(userService.revokeInvite).not.toHaveBeenCalled();
    });

    it('should refresh invites after revoking', () => {
      dialog.open.mockReturnValue({ afterClosed: () => of(true) } as any);
      userService.revokeInvite.mockReturnValue(of(void 0));

      fixture.detectChanges();

      const initialCallCount = userService.getActiveInvites.mock.calls.length;
      component.revokeInvite(mockInvites[0]);

      expect(userService.getActiveInvites.mock.calls.length).toBe(initialCallCount + 1);
    });

    it('should show no data message when no invites', () => {
      userService.getActiveInvites.mockReturnValue(of([]));
      component.ngOnInit();
      fixture.detectChanges();

      const compiled = fixture.nativeElement;
      // Users table exists so only one .no-data element (invites section)
      const noDataElements = compiled.querySelectorAll('.no-data');
      const noData = Array.from(noDataElements).find((el: any) => el.textContent.includes('No pending invitations'));
      expect(noData).toBeTruthy();
    });
  });

  describe('Last Administrator Protection', () => {
    it('should identify last administrator correctly', () => {
      fixture.detectChanges();

      expect(component.isLastAdmin(mockUsers[0])).toBe(true);
      expect(component.isLastAdmin(mockUsers[1])).toBe(false);
    });

    it('should not identify last admin when multiple admins exist', () => {
      const multipleAdmins: UserResponse[] = [{ ...mockUsers[0] }, { ...mockUsers[1], role: UserRole.ADMINISTRATOR }];
      userService.getAllUsers.mockReturnValue(of(multipleAdmins));

      component.ngOnInit();
      fixture.detectChanges();

      expect(component.isLastAdmin(component.users()[0])).toBe(false);
      expect(component.isLastAdmin(component.users()[1])).toBe(false);
    });

    it('should disable actions for last administrator', () => {
      fixture.detectChanges();

      expect(component.canModifyUser(mockUsers[0])).toBe(false);
      expect(component.canModifyUser(mockUsers[1])).toBe(true);
    });

    it('should disable actions for current user', () => {
      fixture.detectChanges();

      // Current user is mockUsers[0]
      expect(component.canModifyUser(mockUsers[0])).toBe(false);
    });
  });

  describe('Helper Methods', () => {
    it('should return correct role badge color', () => {
      expect(component.getRoleBadgeColor(UserRole.ADMINISTRATOR)).toBe('primary');
      expect(component.getRoleBadgeColor(UserRole.USER)).toBe('accent');
    });

    it('should return correct role label', () => {
      expect(component.getRoleLabel(UserRole.ADMINISTRATOR)).toBe('Administrator');
      expect(component.getRoleLabel(UserRole.USER)).toBe('User');
    });

    it('should format date correctly', () => {
      const date = new Date('2024-01-01T12:00:00');
      const formatted = component.formatDate(date);
      expect(formatted).toContain('1/1/2024');
    });

    it('should detect expiring soon invites', () => {
      const expiringSoon = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12 hours from now
      const notExpiring = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours from now

      expect(component.isExpiringSoon(expiringSoon)).toBe(true);
      expect(component.isExpiringSoon(notExpiring)).toBe(false);
    });
  });
});
