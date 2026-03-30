import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { DomainDialogComponent, DomainDialogData } from './domain-dialog.component';
import { createSpyObj, SpyObj } from '../../../testing/mock-helpers';

describe('DomainDialogComponent', () => {
  let component: DomainDialogComponent;
  let fixture: ComponentFixture<DomainDialogComponent>;
  let dialogRef: SpyObj<MatDialogRef<DomainDialogComponent>>;

  function setup(data: DomainDialogData) {
    const dialogRefSpy = createSpyObj('MatDialogRef', ['close']);

    TestBed.configureTestingModule({
      imports: [DomainDialogComponent, BrowserAnimationsModule],
      providers: [
        { provide: MatDialogRef, useValue: dialogRefSpy },
        { provide: MAT_DIALOG_DATA, useValue: data },
      ],
    });

    fixture = TestBed.createComponent(DomainDialogComponent);
    component = fixture.componentInstance;
    dialogRef = TestBed.inject(MatDialogRef) as SpyObj<MatDialogRef<DomainDialogComponent>>;
    fixture.detectChanges();
  }

  describe('add mode', () => {
    beforeEach(() => {
      setup({ mode: 'add' });
    });

    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should not be in edit mode', () => {
      expect(component.isEditMode).toBe(false);
    });

    it('should have correct title', () => {
      expect(component.title).toBe('Add Domain');
    });

    it('should have correct submit button text', () => {
      expect(component.submitButtonText).toBe('Add Domain');
    });

    it('should be invalid with empty domain', () => {
      component.domain = '';
      expect(component.isValid).toBe(false);
    });

    it('should be valid with domain', () => {
      component.domain = 'example.com';
      expect(component.isValid).toBe(true);
    });

    it('should close dialog on cancel', () => {
      component.onCancel();
      expect(dialogRef.close).toHaveBeenCalledWith();
    });

    it('should close with domain data on submit', () => {
      component.domain = 'example.com';
      component.notes = 'My notes';
      component.onSubmit();
      expect(dialogRef.close).toHaveBeenCalledWith({
        domain: 'example.com',
        notes: 'My notes',
      });
    });

    it('should not submit with empty domain', () => {
      component.domain = '';
      component.onSubmit();
      expect(dialogRef.close).not.toHaveBeenCalled();
    });

    it('should trim whitespace from input', () => {
      component.domain = '  example.com  ';
      component.notes = '  notes  ';
      component.onSubmit();
      expect(dialogRef.close).toHaveBeenCalledWith({
        domain: 'example.com',
        notes: 'notes',
      });
    });

    it('should set notes to undefined if empty', () => {
      component.domain = 'example.com';
      component.notes = '';
      component.onSubmit();
      expect(dialogRef.close).toHaveBeenCalledWith({
        domain: 'example.com',
        notes: undefined,
      });
    });
  });

  describe('edit mode', () => {
    beforeEach(() => {
      setup({ mode: 'edit', domain: 'existing.com', notes: 'Existing notes' });
    });

    it('should be in edit mode', () => {
      expect(component.isEditMode).toBe(true);
    });

    it('should have correct title', () => {
      expect(component.title).toBe('Edit Domain Notes');
    });

    it('should have correct submit button text', () => {
      expect(component.submitButtonText).toBe('Save');
    });

    it('should populate fields from data', () => {
      expect(component.domain).toBe('existing.com');
      expect(component.notes).toBe('Existing notes');
    });

    it('should always be valid in edit mode', () => {
      component.domain = '';
      expect(component.isValid).toBe(true);
    });

    it('should close with notes only on submit', () => {
      component.notes = 'Updated notes';
      component.onSubmit();
      expect(dialogRef.close).toHaveBeenCalledWith({ notes: 'Updated notes' });
    });
  });
});
