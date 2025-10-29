import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule, MatDialog } from '@angular/material/dialog';
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
    private api: ApiService,
    private dialog: MatDialog
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
      this.record.sourceIp ||
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

  // Determine if the record is for a subdomain based on headerFrom and policy domain
  isSubdomain(): boolean {
    const policyDomain = (this.record as any).report?.domain;
    const headerFrom = this.record.headerFrom;

    if (!policyDomain || !headerFrom) {
      return false;
    }

    // Extract domain from headerFrom (everything after @)
    const headerDomain = headerFrom.toLowerCase();
    const baseDomain = policyDomain.toLowerCase();

    // If headerDomain is exactly the policy domain, it's not a subdomain
    if (headerDomain === baseDomain) {
      return false;
    }

    // If headerDomain ends with .policyDomain, it's a subdomain
    return headerDomain.endsWith('.' + baseDomain);
  }

  // Get which policy applies to this record
  getApplicablePolicy(): 'main' | 'subdomain' | 'unknown' {
    const policy = this.getPolicy();
    if (!policy) {
      return 'unknown';
    }

    return this.isSubdomain() ? 'subdomain' : 'main';
  }

  hasForwardingData(): boolean {
    return this.record.isForwarded !== undefined && this.record.isForwarded !== null;
  }

  hasPolicyOverride(): boolean {
    return !!(this.record.reasonType || this.record.reasonComment);
  }

  // DMARC Overall Status
  getDmarcOverallStatus(): 'pass' | 'fail' {
    // DMARC passes if either DKIM or SPF passes (with alignment)
    if (this.record.dmarcDkim === 'pass' || this.record.dmarcSpf === 'pass') {
      return 'pass';
    }
    return 'fail';
  }

  getDkimOverallStatus(): 'pass' | 'fail' | 'none' {
    // Use dmarcDkim which represents the policy_evaluated result (with alignment)
    if (this.record.dmarcDkim === 'pass') {
      return 'pass';
    } else if (this.record.dmarcDkim === 'fail') {
      return 'fail';
    }
    return 'none';
  }

  getSpfOverallStatus(): 'pass' | 'fail' | 'none' {
    // Use dmarcSpf which represents the policy_evaluated result (with alignment)
    if (this.record.dmarcSpf === 'pass') {
      return 'pass';
    } else if (this.record.dmarcSpf === 'fail') {
      return 'fail';
    }
    return 'none';
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

  async viewXml() {
    const reportId = (this.record as any)?.report?.id;
    // Add flip classes to current dialog pane
    // Remove any stale flip state from previous flips
    this.dialogRef.removePanelClass('flip-enter');
    this.dialogRef.removePanelClass('flip-enter-reverse');
    this.dialogRef.removePanelClass('flip-exit');
    this.dialogRef.removePanelClass('flip-exit-reverse');
    this.dialogRef.addPanelClass('flip-dialog');
    // Forward exit: rotate 0 -> 180deg
    this.dialogRef.addPanelClass('flip-exit');

    // Open the XML dialog immediately with flip-enter; fill XML when loaded
    const { XmlViewerDialogComponent } = await import('../xml-viewer-dialog/xml-viewer-dialog.component');
    const xmlRef = this.dialog.open(XmlViewerDialogComponent, {
      data: {
        xml: '',
        record: this.record,
        reportId,
        title: `DMARC Report XML - ${this.record.sourceIp || 'Unknown IP'}`,
      },
      width: '850px',
      maxWidth: '90vw',
      height: '95vh',
      // Forward enter: start at -180 -> 0deg
      panelClass: ['flip-dialog', 'flip-enter'],
      enterAnimationDuration: '0ms',
      exitAnimationDuration: '0ms',
    });

    // After flip-in completes, clear flip-enter class on the new dialog
    setTimeout(() => xmlRef.removePanelClass('flip-enter'), 650);

    // Fetch XML and inject into the opened dialog
    if (reportId) {
      this.api.getReportXml(reportId).subscribe({
        next: (xml) => {
          if (xmlRef?.componentInstance && typeof (xmlRef.componentInstance as any).setXml === 'function') {
            (xmlRef.componentInstance as any).setXml(xml);
          }
        },
        error: () => {
          // Leave XML dialog open; caller can retry or close.
        },
      });
    }

    // Close the current dialog after the flip duration
    setTimeout(() => this.dialogRef.close({ action: 'flip' }), 600);
  }

  close() {
    this.dialogRef.close();
  }
}
