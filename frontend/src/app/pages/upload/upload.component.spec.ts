import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { UploadComponent } from './upload.component';
import { ApiService } from '../../services/api.service';
import { createSpyObj, SpyObj } from '../../../testing/mock-helpers';

describe('UploadComponent', () => {
  let component: UploadComponent;
  let fixture: ComponentFixture<UploadComponent>;
  let apiService: SpyObj<ApiService>;

  beforeEach(async () => {
    const apiSpy = createSpyObj('ApiService', ['upload']);

    await TestBed.configureTestingModule({
      imports: [UploadComponent, NoopAnimationsModule],
      providers: [{ provide: ApiService, useValue: apiSpy }, provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    apiService = TestBed.inject(ApiService) as SpyObj<ApiService>;
    fixture = TestBed.createComponent(UploadComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('file selection', () => {
    it('should add valid files', () => {
      const file = new File([''], 'report.xml', { type: 'text/xml' });
      const event = { target: { files: [file] } } as unknown as Event;
      component.onFileSelect(event);
      expect(component.selectedFiles().length).toBe(1);
      expect(component.selectedFiles()[0].name).toBe('report.xml');
    });

    it('should filter out invalid file extensions', () => {
      const validFile = new File([''], 'report.xml');
      const invalidFile = new File([''], 'image.png');
      const event = { target: { files: [validFile, invalidFile] } } as unknown as Event;
      component.onFileSelect(event);
      expect(component.selectedFiles().length).toBe(1);
      expect(component.selectedFiles()[0].name).toBe('report.xml');
    });

    it('should accept .zip and .gz files', () => {
      const zip = new File([''], 'report.zip');
      const gz = new File([''], 'report.gz');
      const event = { target: { files: [zip, gz] } } as unknown as Event;
      component.onFileSelect(event);
      expect(component.selectedFiles().length).toBe(2);
    });

    it('should not add duplicate files', () => {
      const file1 = new File(['content'], 'report.xml');
      const file2 = new File(['content'], 'report.xml');
      // First add
      component.onFileSelect({ target: { files: [file1] } } as unknown as Event);
      // Second add with same name/size
      component.onFileSelect({ target: { files: [file2] } } as unknown as Event);
      expect(component.selectedFiles().length).toBe(1);
    });
  });

  describe('drag and drop', () => {
    it('should set isDragOver on dragOver', () => {
      const event = { preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as DragEvent;
      component.onDragOver(event);
      expect(component.isDragOver).toBe(true);
    });

    it('should clear isDragOver on dragLeave', () => {
      component.isDragOver = true;
      const event = { preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as DragEvent;
      component.onDragLeave(event);
      expect(component.isDragOver).toBe(false);
    });

    it('should handle drop with files', () => {
      const file = new File([''], 'dropped.xml');
      const event = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        dataTransfer: { files: [file] },
      } as unknown as DragEvent;
      component.onDrop(event);
      expect(component.isDragOver).toBe(false);
      expect(component.selectedFiles().length).toBe(1);
    });
  });

  describe('file management', () => {
    it('should remove file by index', () => {
      const f1 = new File([''], 'a.xml');
      const f2 = new File([''], 'b.xml');
      component.onFileSelect({ target: { files: [f1, f2] } } as unknown as Event);
      expect(component.selectedFiles().length).toBe(2);
      component.removeFile(0);
      expect(component.selectedFiles().length).toBe(1);
      expect(component.selectedFiles()[0].name).toBe('b.xml');
    });

    it('should clear all files', () => {
      component.onFileSelect({ target: { files: [new File([''], 'a.xml')] } } as unknown as Event);
      component.clearFiles();
      expect(component.selectedFiles().length).toBe(0);
      expect(component.uploadResults().length).toBe(0);
    });
  });

  describe('formatFileSize', () => {
    it('should format 0 bytes', () => {
      expect(component.formatFileSize(0)).toBe('0 Bytes');
    });

    it('should format bytes', () => {
      expect(component.formatFileSize(500)).toBe('500 Bytes');
    });

    it('should format KB', () => {
      expect(component.formatFileSize(1024)).toBe('1 KB');
    });

    it('should format MB', () => {
      expect(component.formatFileSize(1048576)).toBe('1 MB');
    });
  });

  describe('upload', () => {
    it('should not upload with no files', () => {
      component.uploadFiles();
      expect(apiService.upload).not.toHaveBeenCalled();
    });

    it('should upload files sequentially', () => {
      const file = new File([''], 'report.xml');
      component.onFileSelect({ target: { files: [file] } } as unknown as Event);

      apiService.upload.mockReturnValue(of({ id: 'r1', records: [] } as any));
      component.uploadFiles();

      expect(apiService.upload).toHaveBeenCalledWith(file);
      expect(component.uploadResults().length).toBe(1);
      expect(component.uploadResults()[0].success).toBe(true);
      expect(component.isUploading()).toBe(false);
    });

    it('should handle upload errors and continue', () => {
      const f1 = new File([''], 'fail.xml');
      const f2 = new File([''], 'pass.xml');
      component.onFileSelect({ target: { files: [f1, f2] } } as unknown as Event);

      apiService.upload
        .mockReturnValueOnce(throwError(() => ({ error: { message: 'Bad file' } })))
        .mockReturnValueOnce(of({ id: 'r2', records: [] } as any));

      component.uploadFiles();

      expect(component.uploadResults().length).toBe(2);
      expect(component.uploadResults()[0].success).toBe(false);
      expect(component.uploadResults()[0].message).toBe('Bad file');
      expect(component.uploadResults()[1].success).toBe(true);
    });
  });
});
