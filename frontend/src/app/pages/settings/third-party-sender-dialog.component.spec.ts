import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ThirdPartySenderDialogComponent, ThirdPartySenderDialogData } from './third-party-sender-dialog.component';
import { ApiService } from '../../services/api.service';
import { createSpyObj, SpyObj } from '../../../testing/mock-helpers';

describe('ThirdPartySenderDialogComponent', () => {
  let component: ThirdPartySenderDialogComponent;
  let fixture: ComponentFixture<ThirdPartySenderDialogComponent>;
  let apiService: SpyObj<ApiService>;
  let dialogRef: SpyObj<MatDialogRef<ThirdPartySenderDialogComponent>>;
  let snackBar: SpyObj<MatSnackBar>;

  function setup(data: ThirdPartySenderDialogData) {
    const apiSpy = createSpyObj('ApiService', ['createThirdPartySender', 'updateThirdPartySender']);
    const dialogRefSpy = createSpyObj('MatDialogRef', ['close']);

    TestBed.configureTestingModule({
      imports: [ThirdPartySenderDialogComponent, BrowserAnimationsModule],
      providers: [
        { provide: ApiService, useValue: apiSpy },
        { provide: MatDialogRef, useValue: dialogRefSpy },
        { provide: MAT_DIALOG_DATA, useValue: data },
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

    fixture = TestBed.createComponent(ThirdPartySenderDialogComponent);
    component = fixture.componentInstance;
    apiService = TestBed.inject(ApiService) as SpyObj<ApiService>;
    dialogRef = TestBed.inject(MatDialogRef) as SpyObj<MatDialogRef<ThirdPartySenderDialogComponent>>;

    // Spy on component-level injected MatSnackBar (provided by Material module imports)
    const snackBarInstance = fixture.debugElement.injector.get(MatSnackBar);
    vi.spyOn(snackBarInstance, 'open').mockReturnValue({} as any);
    snackBar = snackBarInstance as any;

    fixture.detectChanges();
  }

  describe('create mode', () => {
    beforeEach(() => {
      setup({ mode: 'create' });
    });

    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should start with empty form', () => {
      expect(component.formData.name).toBe('');
      expect(component.formData.enabled).toBe(true);
    });

    it('should be invalid with empty name', () => {
      expect(component.isValid()).toBe(false);
    });

    it('should be valid with name', () => {
      component.formData.name = 'Google';
      expect(component.isValid()).toBe(true);
    });

    it('should cancel dialog', () => {
      component.cancel();
      expect(dialogRef.close).toHaveBeenCalledWith(false);
    });

    it('should save new sender', () => {
      apiService.createThirdPartySender.mockReturnValue(of({ id: 's1', name: 'Google' } as any));
      component.formData.name = 'Google';
      component.formData.dkimPattern = '.*google\\.com$';

      component.save();

      expect(apiService.createThirdPartySender).toHaveBeenCalled();
      expect(dialogRef.close).toHaveBeenCalledWith(true);
    });

    it('should handle save error', () => {
      apiService.createThirdPartySender.mockReturnValue(throwError(() => ({ error: { message: 'Duplicate name' } })));
      component.formData.name = 'Google';

      component.save();

      expect(snackBar.open).toHaveBeenCalledWith('Duplicate name', 'Close', expect.any(Object));
      expect(component.saving()).toBe(false);
    });

    it('should not save with invalid form', () => {
      component.formData.name = '';
      component.save();
      expect(apiService.createThirdPartySender).not.toHaveBeenCalled();
    });
  });

  describe('edit mode', () => {
    beforeEach(() => {
      setup({
        mode: 'edit',
        sender: {
          id: 's1',
          name: 'Google',
          description: 'Google Workspace',
          dkimPattern: '.*google\\.com$',
          spfPattern: '',
          enabled: true,
          createdAt: '',
          updatedAt: '',
        },
      });
    });

    it('should populate form from sender', () => {
      expect(component.formData.name).toBe('Google');
      expect(component.formData.description).toBe('Google Workspace');
    });

    it('should update sender', () => {
      apiService.updateThirdPartySender.mockReturnValue(of({ id: 's1', name: 'Updated' } as any));
      component.formData.name = 'Updated';

      component.save();

      expect(apiService.updateThirdPartySender).toHaveBeenCalledWith(
        's1',
        expect.objectContaining({ name: 'Updated' })
      );
      expect(dialogRef.close).toHaveBeenCalledWith(true);
    });
  });

  describe('regex validation', () => {
    beforeEach(() => {
      setup({ mode: 'create' });
    });

    it('should validate valid regex', () => {
      component.formData.dkimPattern = '.*google\\.com$';
      component.validateRegex('dkim');
      expect(component.dkimError()).toBeNull();
    });

    it('should detect invalid regex', () => {
      component.formData.dkimPattern = '[invalid';
      component.validateRegex('dkim');
      expect(component.dkimError()).toBe('Invalid regex pattern');
    });

    it('should clear error for empty pattern', () => {
      component.formData.dkimPattern = '';
      component.validateRegex('dkim');
      expect(component.dkimError()).toBeNull();
    });

    it('should validate SPF pattern', () => {
      component.formData.spfPattern = '[bad';
      component.validateRegex('spf');
      expect(component.spfError()).toBe('Invalid regex pattern');
    });

    it('should be invalid with regex errors', () => {
      component.formData.name = 'Test';
      component.dkimError.set('Invalid regex pattern');
      expect(component.isValid()).toBe(false);
    });

    it('should not save with regex errors', () => {
      component.formData.name = 'Test';
      component.formData.dkimPattern = '[invalid';
      component.save(); // validateRegex is called inside save

      expect(snackBar.open).toHaveBeenCalledWith('Please fix validation errors', 'Close', expect.any(Object));
    });
  });
});
