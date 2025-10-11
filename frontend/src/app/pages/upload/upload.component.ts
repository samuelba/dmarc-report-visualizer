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
  templateUrl: './upload.component.html',
  styleUrls: ['./upload.component.scss'],
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
