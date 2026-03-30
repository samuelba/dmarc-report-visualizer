import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ShareService } from './share.service';

describe('ShareService', () => {
  let service: ShareService;
  let snackBarSpy: { open: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    snackBarSpy = { open: vi.fn() };

    TestBed.configureTestingModule({
      providers: [ShareService, { provide: MatSnackBar, useValue: snackBarSpy }],
    });
    service = TestBed.inject(ShareService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('copyLink', () => {
    it('should build URL with params and copy to clipboard', async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: { writeText: writeTextMock },
      });

      service.copyLink({ domain: 'example.com', from: '2024-01-01' });

      // Wait for the promise to resolve
      await vi.waitFor(() => {
        expect(writeTextMock).toHaveBeenCalled();
      });

      const calledUrl = writeTextMock.mock.calls[0][0] as string;
      expect(calledUrl).toContain('domain=example.com');
      expect(calledUrl).toContain('from=2024-01-01');

      expect(snackBarSpy.open).toHaveBeenCalledWith(
        'Share link copied to clipboard',
        'Close',
        expect.objectContaining({ duration: 3000 })
      );
    });

    it('should use custom success message', async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: { writeText: writeTextMock },
      });

      service.copyLink({ key: 'val' }, 'Custom message');

      await vi.waitFor(() => {
        expect(snackBarSpy.open).toHaveBeenCalledWith(
          'Custom message',
          'Close',
          expect.objectContaining({ duration: 3000 })
        );
      });
    });

    it('should delete params with empty values', async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: { writeText: writeTextMock },
      });

      service.copyLink({ domain: 'example.com', empty: '' });

      await vi.waitFor(() => {
        expect(writeTextMock).toHaveBeenCalled();
      });

      const calledUrl = writeTextMock.mock.calls[0][0] as string;
      expect(calledUrl).toContain('domain=example.com');
      expect(calledUrl).not.toContain('empty');
    });

    it('should show error message when clipboard fails', async () => {
      const writeTextMock = vi.fn().mockRejectedValue(new Error('Clipboard error'));
      Object.assign(navigator, {
        clipboard: { writeText: writeTextMock },
      });

      service.copyLink({ key: 'val' });

      await vi.waitFor(() => {
        expect(snackBarSpy.open).toHaveBeenCalledWith(
          'Failed to copy link',
          'Close',
          expect.objectContaining({ duration: 3000 })
        );
      });
    });
  });
});
