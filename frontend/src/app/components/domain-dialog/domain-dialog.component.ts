import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MaterialModule } from '../../shared/material.module';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { CreateDomainDto, UpdateDomainDto } from '../../services/api.service';

export interface DomainDialogData {
  mode: 'add' | 'edit';
  domain?: string;
  notes?: string;
}

export type DomainDialogResult = CreateDomainDto | UpdateDomainDto;

@Component({
  selector: 'app-domain-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MaterialModule],
  templateUrl: './domain-dialog.component.html',
  styleUrls: ['./domain-dialog.component.scss'],
})
export class DomainDialogComponent {
  domain = '';
  notes = '';
  isEditMode: boolean;

  constructor(
    private dialogRef: MatDialogRef<DomainDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DomainDialogData
  ) {
    this.isEditMode = data.mode === 'edit';
    this.domain = data.domain || '';
    this.notes = data.notes || '';
  }

  get title(): string {
    return this.isEditMode ? 'Edit Domain Notes' : 'Add Domain';
  }

  get submitButtonText(): string {
    return this.isEditMode ? 'Save' : 'Add Domain';
  }

  get isValid(): boolean {
    // For edit mode, always valid (can save empty notes)
    // For add mode, domain is required
    return this.isEditMode || this.domain.trim().length > 0;
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onSubmit(): void {
    if (!this.isValid) {
      return;
    }

    let result: DomainDialogResult;

    if (this.isEditMode) {
      // Edit mode: only return notes (empty string to clear, or the actual note)
      result = {
        notes: this.notes.trim(),
      } as UpdateDomainDto;
    } else {
      // Add mode: return domain and notes
      result = {
        domain: this.domain.trim(),
        notes: this.notes.trim() || undefined,
      } as CreateDomainDto;
    }

    this.dialogRef.close(result);
  }
}
