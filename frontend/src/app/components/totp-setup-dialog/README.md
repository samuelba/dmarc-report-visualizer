# TOTP Setup Dialog Component

A three-step wizard component for setting up TOTP (Time-based One-Time Password) two-factor authentication.

## Features

- **Step 1: Scan QR Code**
  - Displays QR code for scanning with authenticator apps
  - Shows manual entry code as fallback
  - Lists compatible authenticator apps
  - Copy-to-clipboard functionality for secret

- **Step 2: Verify Setup**
  - 6-digit code input with numeric validation
  - Real-time validation feedback
  - Helpful hints about time synchronization

- **Step 3: Save Recovery Codes**
  - Displays 10 recovery codes in a grid layout
  - Copy all codes to clipboard
  - Download codes as text file
  - Requires acknowledgment before completion

## Usage

```typescript
import { MatDialog } from '@angular/material/dialog';
import { TotpSetupDialogComponent } from './components/totp-setup-dialog/totp-setup-dialog.component';

// In your component
constructor(private dialog: MatDialog) {}

openTotpSetup(): void {
  const dialogRef = this.dialog.open(TotpSetupDialogComponent, {
    width: '600px',
    disableClose: true, // Prevent closing by clicking outside
  });

  dialogRef.afterClosed().subscribe(result => {
    if (result === true) {
      // TOTP was successfully enabled
      console.log('TOTP enabled successfully');
      // Refresh TOTP status or update UI
    } else {
      // User cancelled the setup
      console.log('TOTP setup cancelled');
    }
  });
}
```

## Requirements

This component requires:
- Angular Material Dialog
- AuthService with TOTP methods (setupTotp, enableTotp)
- Material icons
- Clipboard API support

## Accessibility

- Keyboard navigation support
- Screen reader friendly
- High contrast mode compatible
- Focus management between steps
- ARIA labels for buttons

## Responsive Design

- Adapts to mobile screens
- Single column layout on small devices
- Touch-friendly buttons and inputs
