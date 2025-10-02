import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../services/api.service';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatChipsModule } from '@angular/material/chips';
import { forkJoin } from 'rxjs';

@Component({
  standalone: true,
  selector: 'app-upload',
  imports: [CommonModule, MatButtonModule, MatCardModule, MatIconModule, MatProgressBarModule, MatChipsModule],
  template: `
    <main class="upload-container">
      <mat-card class="upload-card">
        <mat-card-header>
          <mat-card-title>
            <mat-icon>cloud_upload</mat-icon>
            Upload DMARC Reports
          </mat-card-title>
          <mat-card-subtitle> Upload XML, ZIP, or GZ files containing DMARC reports </mat-card-subtitle>
        </mat-card-header>

        <mat-card-content>
          <div
            class="upload-area"
            [class.dragover]="isDragOver"
            (dragover)="onDragOver($event)"
            (dragleave)="onDragLeave($event)"
            (drop)="onDrop($event)"
            (click)="fileInput.click()"
          >
            <mat-icon class="upload-icon">cloud_upload</mat-icon>
            <h3>Drag & Drop Files Here</h3>
            <p>or click to browse</p>
            <p class="file-types">Supported: .xml, .zip, .gz</p>
          </div>

          <input
            #fileInput
            type="file"
            (change)="onFileSelect($event)"
            accept=".xml,.zip,.gz"
            multiple
            style="display: none"
          />

          <div *ngIf="selectedFiles().length > 0" class="selected-files">
            <h4>Selected Files ({{ selectedFiles().length }})</h4>
            <div class="file-chips">
              <mat-chip-set>
                <mat-chip
                  *ngFor="let file of selectedFiles(); let i = index"
                  [removable]="true"
                  (removed)="removeFile(i)"
                >
                  <mat-icon matChipAvatar>description</mat-icon>
                  {{ file.name }}
                  <span class="file-size">({{ formatFileSize(file.size) }})</span>
                  <mat-icon matChipRemove>cancel</mat-icon>
                </mat-chip>
              </mat-chip-set>
            </div>
          </div>

          <div class="upload-actions">
            <button
              mat-raised-button
              color="primary"
              (click)="uploadFiles()"
              [disabled]="selectedFiles().length === 0 || isUploading()"
            >
              <mat-icon>upload</mat-icon>
              {{ isUploading() ? 'Uploading...' : 'Upload ' + selectedFiles().length + ' File(s)' }}
            </button>

            <button mat-button (click)="clearFiles()" [disabled]="selectedFiles().length === 0 || isUploading()">
              <mat-icon>clear</mat-icon>
              Clear All
            </button>
          </div>

          <div *ngIf="isUploading()" class="upload-progress">
            <mat-progress-bar mode="determinate" [value]="uploadProgress()"></mat-progress-bar>
            <p>{{ uploadStatus() }}</p>
          </div>

          <div *ngIf="uploadResults().length > 0" class="upload-results">
            <h4>Upload Results</h4>
            <div
              *ngFor="let result of uploadResults()"
              class="result-item"
              [class.success]="result.success"
              [class.error]="!result.success"
            >
              <mat-icon>{{ result.success ? 'check_circle' : 'error' }}</mat-icon>
              <span class="filename">{{ result.filename }}</span>
              <span class="message">{{ result.message }}</span>
            </div>
          </div>
        </mat-card-content>
      </mat-card>
    </main>
  `,
  styles: [
    `
      .upload-container {
        padding: 20px;
        max-width: 800px;
        margin: 0 auto;
      }

      .upload-card {
        margin-bottom: 20px;
      }

      mat-card-title {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .upload-area {
        border: 2px dashed #ccc;
        border-radius: 8px;
        padding: 40px;
        text-align: center;
        cursor: pointer;
        transition: all 0.3s ease;
        margin: 20px 0;
      }

      .upload-area:hover {
        border-color: #2196f3;
        background-color: rgba(33, 150, 243, 0.05);
      }

      .upload-area.dragover {
        border-color: #2196f3;
        background-color: rgba(33, 150, 243, 0.1);
      }

      .upload-icon {
        font-size: 48px;
        width: 48px;
        height: 48px;
        color: #666;
        margin-bottom: 16px;
      }

      .upload-area h3 {
        margin: 0 0 8px;
        color: #333;
      }

      .upload-area p {
        margin: 4px 0;
        color: #666;
      }

      .file-types {
        font-size: 12px;
        color: #999;
      }

      .selected-files {
        margin: 20px 0;
      }

      .selected-files h4 {
        margin: 0 0 12px;
        color: #333;
      }

      .file-chips {
        margin: 12px 0;
      }

      .file-size {
        font-size: 11px;
        color: #666;
        margin-left: 4px;
      }

      .upload-actions {
        display: flex;
        gap: 12px;
        margin: 20px 0;
      }

      .upload-progress {
        margin: 20px 0;
      }

      .upload-progress p {
        margin: 8px 0 0;
        font-size: 14px;
        color: #666;
      }

      .upload-results {
        margin: 20px 0;
      }

      .upload-results h4 {
        margin: 0 0 12px;
        color: #333;
      }

      .result-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px;
        margin: 4px 0;
        border-radius: 4px;
      }

      .result-item.success {
        background-color: #e8f5e8;
        color: #2e7d32;
      }

      .result-item.error {
        background-color: #ffebee;
        color: #c62828;
      }

      .filename {
        font-weight: 500;
        min-width: 150px;
      }

      .message {
        flex: 1;
        font-size: 14px;
      }
    `,
  ],
})
export class UploadComponent {
  private readonly api = inject(ApiService);

  public readonly selectedFiles = signal<File[]>([]);
  public readonly isUploading = signal(false);
  public readonly uploadProgress = signal(0);
  public readonly uploadStatus = signal('');
  public readonly uploadResults = signal<Array<{ filename: string; success: boolean; message: string }>>([]);

  public isDragOver = false;

  public onFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.addFiles(Array.from(input.files));
    }
  }

  public onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = true;
  }

  public onDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;
  }

  public onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;

    if (event.dataTransfer?.files) {
      this.addFiles(Array.from(event.dataTransfer.files));
    }
  }

  private addFiles(newFiles: File[]) {
    const validFiles = newFiles.filter((file) => {
      const validExtensions = ['.xml', '.zip', '.gz'];
      return validExtensions.some((ext) => file.name.toLowerCase().endsWith(ext));
    });

    const currentFiles = this.selectedFiles();
    const uniqueFiles = validFiles.filter(
      (newFile) =>
        !currentFiles.some((existingFile) => existingFile.name === newFile.name && existingFile.size === newFile.size)
    );

    this.selectedFiles.set([...currentFiles, ...uniqueFiles]);
  }

  public removeFile(index: number) {
    const files = this.selectedFiles();
    files.splice(index, 1);
    this.selectedFiles.set([...files]);
  }

  public clearFiles() {
    this.selectedFiles.set([]);
    this.uploadResults.set([]);
  }

  public formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  public uploadFiles() {
    const files = this.selectedFiles();
    if (files.length === 0) return;

    this.isUploading.set(true);
    this.uploadProgress.set(0);
    this.uploadResults.set([]);

    const uploads = files.map((file) => this.api.upload(file));
    let completedUploads = 0;

    // Upload files sequentially to avoid overwhelming the server
    this.uploadFilesSequentially(files, 0);
  }

  private uploadFilesSequentially(files: File[], index: number) {
    if (index >= files.length) {
      this.isUploading.set(false);
      this.uploadStatus.set('Upload completed');
      return;
    }

    const file = files[index];
    this.uploadStatus.set(`Uploading ${file.name} (${index + 1}/${files.length})`);

    this.api.upload(file).subscribe({
      next: () => {
        const results = this.uploadResults();
        results.push({
          filename: file.name,
          success: true,
          message: 'Upload successful',
        });
        this.uploadResults.set([...results]);

        const progress = ((index + 1) / files.length) * 100;
        this.uploadProgress.set(progress);

        // Upload next file
        this.uploadFilesSequentially(files, index + 1);
      },
      error: (error) => {
        const results = this.uploadResults();
        results.push({
          filename: file.name,
          success: false,
          message: error?.error?.message || error.message || 'Upload failed',
        });
        this.uploadResults.set([...results]);

        const progress = ((index + 1) / files.length) * 100;
        this.uploadProgress.set(progress);

        // Continue with next file even if this one failed
        this.uploadFilesSequentially(files, index + 1);
      },
    });
  }
}
