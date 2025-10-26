import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatCardModule } from '@angular/material/card';
import { DmarcRecord, ApiService } from '../../services/api.service';

export interface RecordDetailsDialogData {
  record: DmarcRecord;
  getCountryName: (code: string | undefined) => string;
}

@Component({
  selector: 'app-record-details-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule, MatTooltipModule, MatCardModule],
  templateUrl: './record-details-dialog.component.html',
  styleUrls: ['./record-details-dialog.component.scss'],
})
export class RecordDetailsDialogComponent {
  constructor(
    @Inject(MAT_DIALOG_DATA) public data: RecordDetailsDialogData,
    private dialogRef: MatDialogRef<RecordDetailsDialogComponent>,
    private api: ApiService
  ) {}

  get record(): DmarcRecord {
    return this.data.record;
  }

  getCountryName(code: string | undefined): string {
    return this.data.getCountryName(code);
  }

  getReportBeginDate(): string | undefined {
    return (this.record as any).report?.beginDate;
  }

  getPolicy(): any {
    return (this.record as any).report?.policy;
  }

  hasIdentifiers(): boolean {
    return !!(this.record.headerFrom || this.record.envelopeFrom || this.record.envelopeTo);
  }

  hasGeoData(): boolean {
    return !!(
      this.record.geoCountry ||
      this.record.geoCity ||
      this.record.geoIsp ||
      this.record.geoOrg ||
      (this.record.geoLatitude !== undefined && this.record.geoLatitude !== null) ||
      (this.record.geoLongitude !== undefined && this.record.geoLongitude !== null) ||
      this.record.geoLookupStatus ||
      this.record.geoLookupCompletedAt
    );
  }

  hasPolicyData(): boolean {
    const policy = this.getPolicy();
    return !!(policy && (policy.p || policy.sp || policy.adkim || policy.aspf || policy.pct !== undefined));
  }

  hasForwardingData(): boolean {
    return this.record.isForwarded !== undefined && this.record.isForwarded !== null;
  }

  hasPolicyOverride(): boolean {
    return !!(this.record.reasonType || this.record.reasonComment);
  }

  getForwardedLabel(): string {
    if (this.record.isForwarded === true) {
      return 'Yes';
    } else if (this.record.isForwarded === false) {
      return 'No';
    } else {
      return 'Unknown';
    }
  }

  getForwardedIcon(): string {
    if (this.record.isForwarded === true) {
      return 'forward';
    } else if (this.record.isForwarded === false) {
      return '';
    } else {
      return 'question_mark';
    }
  }

  getForwardedClass(): string {
    if (this.record.isForwarded === true) {
      return 'forwarded-yes';
    } else if (this.record.isForwarded === false) {
      return 'forwarded-no';
    } else {
      return 'forwarded-unknown';
    }
  }

  getAuthIcon(result: string | undefined): string {
    switch (result) {
      case 'pass':
        return 'check_box';
      case 'fail':
        return 'cancel';
      default:
        return 'help_center';
    }
  }

  getAuthClass(result: string | undefined): string {
    switch (result) {
      case 'pass':
        return 'auth-pass';
      case 'fail':
        return 'auth-fail';
      default:
        return 'auth-missing';
    }
  }

  viewXml() {
    this.dialogRef.close({ action: 'viewXml', record: this.record });
  }

  close() {
    this.dialogRef.close();
  }
}
