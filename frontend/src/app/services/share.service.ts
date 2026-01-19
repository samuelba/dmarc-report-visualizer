import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

@Injectable({
  providedIn: 'root',
})
export class ShareService {
  private readonly snackBar = inject(MatSnackBar);

  copyLink(params: { [key: string]: string }, successMessage: string = 'Share link copied to clipboard') {
    // Build the current page URL without hash
    const baseUrl = window.location.origin + window.location.pathname;

    // Get current query params
    const currentParams = new URLSearchParams(window.location.search);

    // Update params
    Object.entries(params).forEach(([key, value]) => {
      if (value) {
        currentParams.set(key, value);
      } else {
        currentParams.delete(key);
      }
    });

    // Build the shareable URL
    const shareUrl = `${baseUrl}?${currentParams.toString()}`;

    navigator.clipboard.writeText(shareUrl).then(
      () => {
        this.snackBar.open(successMessage, 'Close', {
          duration: 3000,
          horizontalPosition: 'center',
          verticalPosition: 'bottom',
        });
      },
      (_err) => {
        this.snackBar.open('Failed to copy link', 'Close', {
          duration: 3000,
          horizontalPosition: 'center',
          verticalPosition: 'bottom',
        });
      }
    );
  }
}
