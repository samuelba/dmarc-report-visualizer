import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { ConfirmDialogComponent, ConfirmDialogData } from './confirm-dialog.component';
import { createSpyObj, SpyObj } from '../../../testing/mock-helpers';

describe('ConfirmDialogComponent', () => {
  let component: ConfirmDialogComponent;
  let fixture: ComponentFixture<ConfirmDialogComponent>;
  let dialogRef: SpyObj<MatDialogRef<ConfirmDialogComponent>>;

  function setup(data: Partial<ConfirmDialogData> = {}) {
    const dialogRefSpy = createSpyObj('MatDialogRef', ['close']);

    TestBed.configureTestingModule({
      imports: [ConfirmDialogComponent],
      providers: [
        { provide: MatDialogRef, useValue: dialogRefSpy },
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            title: 'Test Title',
            message: 'Test Message',
            ...data,
          },
        },
      ],
    });

    fixture = TestBed.createComponent(ConfirmDialogComponent);
    component = fixture.componentInstance;
    dialogRef = TestBed.inject(MatDialogRef) as SpyObj<MatDialogRef<ConfirmDialogComponent>>;
    fixture.detectChanges();
  }

  it('should create', () => {
    setup();
    expect(component).toBeTruthy();
  });

  it('should set default values', () => {
    setup();
    expect(component.data.confirmText).toBe('Confirm');
    expect(component.data.cancelText).toBe('Cancel');
    expect(component.data.confirmColor).toBe('primary');
  });

  it('should use provided values', () => {
    setup({ confirmText: 'Delete', cancelText: 'Nope', confirmColor: 'warn' });
    expect(component.data.confirmText).toBe('Delete');
    expect(component.data.cancelText).toBe('Nope');
    expect(component.data.confirmColor).toBe('warn');
  });

  it('should disable close on backdrop click', () => {
    setup();
    expect(dialogRef.disableClose).toBe(true);
  });

  it('should close with false on cancel', () => {
    setup();
    component.onCancel();
    expect(dialogRef.close).toHaveBeenCalledWith(false);
  });

  it('should close with true on confirm', () => {
    setup();
    component.onConfirm();
    expect(dialogRef.close).toHaveBeenCalledWith(true);
  });
});
