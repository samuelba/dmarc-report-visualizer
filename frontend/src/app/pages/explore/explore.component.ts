import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { ApiService, DmarcRecord, PagedResult } from '../../services/api.service';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { XmlViewerDialogComponent } from '../../components/xml-viewer-dialog/xml-viewer-dialog.component';
import {
  RecordDetailsDialogComponent,
  RecordDetailsDialogData,
} from '../../components/record-details-dialog/record-details-dialog.component';
import {
  CombinedDateFilterComponent,
  DateFilterValue,
} from '../../components/combined-date-filter/combined-date-filter.component';

@Component({
  standalone: true,
  selector: 'app-explore',
  imports: [
    CommonModule,
    FormsModule,
    MatTableModule,
    MatPaginatorModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatSortModule,
    MatDialogModule,
    MatTooltipModule,
    CombinedDateFilterComponent,
  ],
  templateUrl: './explore.component.html',
  styleUrls: ['./explore.component.scss'],
})
export class ExploreComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

  hoveredInfoRecordId: string | null = null;
  selectedRecordId: string | null = null;

  readonly rows = signal<DmarcRecord[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly pageSize = signal(20);
  sort: { active?: string; direction?: 'asc' | 'desc' } = { active: 'date', direction: 'desc' };

  // Combined date filter value
  dateFilterValue: DateFilterValue = { mode: 'period', periodInput: '30d' };

  displayed = ['date', 'org', 'ip', 'country', 'count', 'disp', 'dkim', 'spf', 'forwarded', 'from', 'auth', 'actions'];

  filters: any = {
    domain: [] as string[],
    orgName: [] as string[],
    disposition: [] as string[],
    dkim: [] as string[],
    spf: [] as string[],
    sourceIp: [] as string[],
    envelopeTo: [] as string[],
    envelopeFrom: [] as string[],
    headerFrom: [] as string[],
    dkimDomain: [] as string[],
    spfDomain: [] as string[],
    country: [] as string[],
    from: '',
    to: '',
    contains: '',
    isForwarded: '',
  };

  readonly domains = signal<string[]>([]);
  readonly orgNames = signal<string[]>([]);
  readonly ips = signal<string[]>([]);
  readonly envelopeTos = signal<string[]>([]);
  readonly envelopeFroms = signal<string[]>([]);
  readonly headerFroms = signal<string[]>([]);
  readonly dkimDomains = signal<string[]>([]);
  readonly spfDomains = signal<string[]>([]);
  readonly countries = signal<string[]>([]);

  // Computed signal to return countries sorted alphabetically by their display names
  readonly sortedCountries = computed(() => {
    return this.countries()
      .slice()
      .sort((a, b) => {
        const nameA = this.getCountryName(a);
        const nameB = this.getCountryName(b);
        return nameA.localeCompare(nameB);
      });
  });

  ngOnInit(): void {
    this.loadFiltersFromUrl();
    // Apply default 30d time period if no date filters in URL
    const params = this.route.snapshot.queryParams;
    if (!params['from'] && !params['to'] && !params['period']) {
      this.applyTimePeriodToFilter('30d');
    }

    // Load distincts (date-scoped for domain + headerFrom)
    this.loadDistincts();

    this.search();

    // Check if there's a recordId in the URL to auto-open XML viewer
    if (params['recordId']) {
      this.openRecordXmlViewer(params['recordId']);
    }
  }

  private openRecordXmlViewer(recordId: string) {
    // First fetch the record details
    this.api.getRecordById(recordId).subscribe({
      next: (record) => {
        // Then get the report ID from the record
        const reportId = (record as any).report?.id;
        if (!reportId) {
          this.snackBar.open('Cannot load XML: Report ID not found', 'Close', {
            duration: 5000,
          });
          return;
        }

        // Get the XML and open the dialog
        this.api.getReportXml(reportId).subscribe({
          next: (xml) => {
            this.openXmlViewer(record, xml);
          },
          error: (_err) => {
            this.snackBar.open('Failed to load XML report', 'Close', {
              duration: 5000,
            });
          },
        });
      },
      error: (_err) => {
        this.snackBar.open('Failed to load record details', 'Close', {
          duration: 5000,
        });
      },
    });
  }

  private getFromToIso(): { from?: string; to?: string } {
    const fromIso = this.filters.from ? new Date(this.filters.from).toISOString() : undefined;
    const toIso = this.filters.to ? new Date(this.filters.to).toISOString() : undefined;
    return { from: fromIso, to: toIso };
  }

  private loadDateScopedDistincts() {
    const { from, to } = this.getFromToIso();
    this.api.getRecordDistinct('domain', { from, to }).subscribe((v) => this.domains.set(v));
    this.api.getRecordDistinct('orgName', { from, to }).subscribe((v) => this.orgNames.set(v));
    this.api.getRecordDistinct('headerFrom', { from, to }).subscribe((v) => this.headerFroms.set(v));
    this.api.getRecordDistinct('sourceIp', { from, to }).subscribe((v) => this.ips.set(v));
    this.api.getRecordDistinct('envelopeFrom', { from, to }).subscribe((v) => this.envelopeFroms.set(v));
    this.api.getRecordDistinct('envelopeTo', { from, to }).subscribe((v) => this.envelopeTos.set(v));
    this.api.getRecordDistinct('dkimDomain', { from, to }).subscribe((v) => this.dkimDomains.set(v));
    this.api.getRecordDistinct('spfDomain', { from, to }).subscribe((v) => this.spfDomains.set(v));
    this.api.getRecordDistinct('country', { from, to }).subscribe((v) => this.countries.set(v));
  }

  private loadDistincts() {
    // All lists are now date-scoped
    this.loadDateScopedDistincts();
  }

  onPage(e: PageEvent) {
    this.page.set(e.pageIndex + 1);
    this.pageSize.set(e.pageSize);
    this.updateUrl();
    this.search();
  }

  apply() {
    this.page.set(1);
    this.updateUrl();
    this.search();
  }

  clear() {
    this.filters = {
      domain: [],
      orgName: [],
      disposition: [],
      dkim: [],
      spf: [],
      sourceIp: [],
      envelopeTo: [],
      envelopeFrom: [],
      headerFrom: [],
      dkimDomain: [],
      spfDomain: [],
      country: [],
      from: '',
      to: '',
      contains: '',
      isForwarded: '',
    };
    this.dateFilterValue = { mode: 'period', periodInput: '30d' };
    this.applyTimePeriodToFilter('30d');
    // reload date-scoped options after resetting time period
    this.loadDateScopedDistincts();
    this.page.set(1);
    this.updateUrl();
    this.search();
  }

  private search() {
    const p: any = {
      page: this.page(),
      pageSize: this.pageSize(),
      domain: this.filters.domain.length ? this.filters.domain : undefined,
      orgName: this.filters.orgName.length ? this.filters.orgName : undefined,
      disposition: this.filters.disposition.length ? this.filters.disposition : undefined,
      dkim: this.filters.dkim.length ? this.filters.dkim : undefined,
      spf: this.filters.spf.length ? this.filters.spf : undefined,
      sourceIp: this.filters.sourceIp.length ? this.filters.sourceIp : undefined,
      envelopeTo: this.filters.envelopeTo.length ? this.filters.envelopeTo : undefined,
      envelopeFrom: this.filters.envelopeFrom.length ? this.filters.envelopeFrom : undefined,
      headerFrom: this.filters.headerFrom.length ? this.filters.headerFrom : undefined,
      dkimDomain: this.filters.dkimDomain.length ? this.filters.dkimDomain : undefined,
      spfDomain: this.filters.spfDomain.length ? this.filters.spfDomain : undefined,
      country: this.filters.country.length ? this.filters.country : undefined,
      from: this.filters.from ? new Date(this.filters.from).toISOString() : undefined,
      to: this.filters.to ? new Date(this.filters.to).toISOString() : undefined,
      contains: this.filters.contains ? this.filters.contains : undefined,
      isForwarded: this.filters.isForwarded
        ? this.filters.isForwarded === 'true'
          ? true
          : this.filters.isForwarded === 'false'
            ? false
            : this.filters.isForwarded === 'unknown'
              ? null
              : undefined
        : undefined,
      sort: this.sort.active,
      order: this.sort.direction,
    };
    this.api.searchRecords(p).subscribe((res: PagedResult<DmarcRecord>) => {
      this.rows.set(res.data);
      this.total.set(res.total);
    });
  }

  openRecordDetails(record: DmarcRecord) {
    this.selectedRecordId = record.id;
    const dialogRef = this.dialog.open(RecordDetailsDialogComponent, {
      data: {
        record,
        getCountryName: this.getCountryName.bind(this),
      } as RecordDetailsDialogData,
      width: '800px',
      maxWidth: '90vw',
      height: '85vh',
    });

    // Handle actions from the dialog (e.g., view XML)
    dialogRef.afterClosed().subscribe((result) => {
      if (result?.action === 'viewXml') {
        this.viewXml(result.record);
      } else {
        // Clear selection when dialog is closed without action
        this.selectedRecordId = null;
      }
    });
  }

  private openXmlViewer(record: DmarcRecord, xml: string) {
    this.selectedRecordId = record.id;
    const reportId = (record as any).report?.id;
    const dialogRef = this.dialog.open(XmlViewerDialogComponent, {
      data: {
        xml,
        record,
        reportId: reportId,
        title: `DMARC Report XML - ${record.sourceIp || 'Unknown IP'}`,
      },
      width: '90%',
      maxWidth: '1400px',
      height: '85vh',
    });

    // Handle actions from the XML viewer (e.g., view record details)
    dialogRef.afterClosed().subscribe((result) => {
      if (result?.action === 'viewRecordDetails' && result.record) {
        this.openRecordDetails(result.record);
      } else {
        // Clear selection when dialog is closed without action
        this.selectedRecordId = null;
      }
    });
  }

  viewXml(record: DmarcRecord) {
    // Get the report ID from the nested report object
    const reportId = (record as any).report?.id;
    if (!reportId) {
      return;
    }

    this.api.getReportXml(reportId).subscribe((xml) => {
      this.openXmlViewer(record, xml);
    });
  }

  onSort(e: Sort) {
    this.sort = { active: e.active, direction: (e.direction || 'asc') as any };
    this.search();
  }

  formatDkimResults(r: DmarcRecord): string {
    const arr = r.dkimResults || [];
    return arr.map((d: any) => `${d?.domain || ''}:${d?.result || ''}`).join(', ');
  }

  formatSpfResults(r: DmarcRecord): string {
    const arr = r.spfResults || [];
    return arr.map((s: any) => `${s?.domain || ''}:${s?.result || ''}`).join(', ');
  }

  public getAuthResultsForDisplay(r: DmarcRecord, type: 'dkim' | 'spf'): Array<{ domain: string; result: string }> {
    const arr = type === 'dkim' ? r.dkimResults || [] : r.spfResults || [];
    return arr.map((item: any) => ({
      domain: item?.domain || 'unknown',
      result: item?.result || 'unknown',
    }));
  }

  public getDkimResultsForDisplay(r: DmarcRecord): Array<{ domain: string; result: string }> {
    return this.getAuthResultsForDisplay(r, 'dkim');
  }

  public getSpfResultsForDisplay(r: DmarcRecord): Array<{ domain: string; result: string }> {
    return this.getAuthResultsForDisplay(r, 'spf');
  }

  public getResultIcon(result: string): string {
    switch (result) {
      case 'pass':
        return 'check_box';
      case 'fail':
        return 'cancel';
      default:
        return 'help_center';
    }
  }

  // Auto-update table when filters change
  onFilterChange() {
    this.page.set(1);
    this.updateUrl();
    // Refresh date-scoped distincts when filters (especially dates) change
    this.loadDateScopedDistincts();
    this.search();
  }

  onDateFilterChange(value: DateFilterValue) {
    this.dateFilterValue = value;

    if (value.mode === 'period') {
      this.applyTimePeriodToFilter(value.periodInput || '30d');
    } else {
      // Date range mode
      this.filters.from = value.fromDate || '';
      this.filters.to = value.toDate || '';
    }

    // Refresh date-scoped distincts when dates change
    this.loadDateScopedDistincts();
    this.onFilterChange();
  }

  private applyTimePeriodToFilter(periodInput: string = '30d') {
    const input = periodInput.trim().toLowerCase();

    if (input === 'all' || input === '') {
      this.filters.from = '';
      this.filters.to = '';
      return;
    }

    const days = this.parseTimePeriodToDays(input);
    if (days > 0) {
      const now = new Date();

      // Set toDate to end of yesterday (since today's reports likely aren't available yet)
      const toDate = new Date(now);
      toDate.setDate(now.getDate() - 1); // Go to yesterday
      toDate.setHours(23, 59, 59, 999); // End of yesterday

      // Set fromDate to start of the day N days before yesterday
      const fromDate = new Date(now);
      fromDate.setDate(now.getDate() - days); // Go back N days from today
      fromDate.setHours(0, 0, 0, 0); // Start of that day

      this.filters.from = fromDate;
      this.filters.to = toDate;
    } else {
      // Invalid input, reset to no time restriction
      this.filters.from = '';
      this.filters.to = '';
    }
  }

  private parseTimePeriodToDays(input: string): number {
    // Handle plain numbers (assume days)
    if (/^\d+$/.test(input)) {
      return parseInt(input, 10);
    }

    // Handle format with suffix (d, m, y)
    const match = input.match(/^(\d+)([dmy])$/);
    if (match) {
      const value = parseInt(match[1], 10);
      const unit = match[2];

      switch (unit) {
        case 'd':
          return value; // days
        case 'm':
          return value * 30; // months (approximate)
        case 'y':
          return value * 365; // years (approximate)
        default:
          return 0;
      }
    }

    return 0; // Invalid format
  }

  // Get country name from code
  getCountryName(code: string | undefined): string {
    if (!code) {
      return '';
    }
    try {
      return this.regionNames.of(code.toUpperCase()) || code;
    } catch (_error) {
      // If the country code is invalid, just return it as-is
      return code;
    }
  }

  // Check if record has any geo data
  hasGeoData(record: DmarcRecord): boolean {
    return !!(
      record.geoCountry ||
      record.geoCity ||
      record.geoIsp ||
      record.geoOrg ||
      (record.geoLatitude !== undefined && record.geoLatitude !== null) ||
      (record.geoLongitude !== undefined && record.geoLongitude !== null) ||
      record.geoLookupStatus ||
      record.geoLookupCompletedAt
    );
  }

  // Check if record has policy data
  hasPolicyData(record: DmarcRecord): boolean {
    const policy = (record as any).report?.policy;
    return !!(policy && (policy.p || policy.sp || policy.adkim || policy.aspf || policy.pct !== undefined));
  }

  // Check if record has forwarding data
  hasForwardingData(record: DmarcRecord): boolean {
    return record.isForwarded !== undefined && record.isForwarded !== null;
  }

  // Format date for URL without timezone issues
  private formatDateForUrl(date: Date): string {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Load filters from URL parameters
  private loadFiltersFromUrl() {
    const params = this.route.snapshot.queryParams;

    if (params['domain']) {
      this.filters.domain = Array.isArray(params['domain']) ? params['domain'] : [params['domain']];
    }
    if (params['orgName']) {
      this.filters.orgName = Array.isArray(params['orgName']) ? params['orgName'] : [params['orgName']];
    }
    if (params['disposition']) {
      this.filters.disposition = Array.isArray(params['disposition']) ? params['disposition'] : [params['disposition']];
    }
    if (params['dkim']) {
      this.filters.dkim = Array.isArray(params['dkim']) ? params['dkim'] : [params['dkim']];
    }
    if (params['spf']) {
      this.filters.spf = Array.isArray(params['spf']) ? params['spf'] : [params['spf']];
    }
    if (params['sourceIp']) {
      this.filters.sourceIp = Array.isArray(params['sourceIp']) ? params['sourceIp'] : [params['sourceIp']];
    }
    if (params['envelopeTo']) {
      this.filters.envelopeTo = Array.isArray(params['envelopeTo']) ? params['envelopeTo'] : [params['envelopeTo']];
    }
    if (params['envelopeFrom']) {
      this.filters.envelopeFrom = Array.isArray(params['envelopeFrom'])
        ? params['envelopeFrom']
        : [params['envelopeFrom']];
    }
    if (params['headerFrom']) {
      this.filters.headerFrom = Array.isArray(params['headerFrom']) ? params['headerFrom'] : [params['headerFrom']];
    }
    if (params['dkimDomain']) {
      this.filters.dkimDomain = Array.isArray(params['dkimDomain']) ? params['dkimDomain'] : [params['dkimDomain']];
    }
    if (params['spfDomain']) {
      this.filters.spfDomain = Array.isArray(params['spfDomain']) ? params['spfDomain'] : [params['spfDomain']];
    }
    if (params['country']) {
      this.filters.country = Array.isArray(params['country']) ? params['country'] : [params['country']];
    }

    // Load date filter from URL
    if (params['period']) {
      this.dateFilterValue = { mode: 'period', periodInput: params['period'] };
      this.applyTimePeriodToFilter(params['period']);
    } else if (params['from'] || params['to']) {
      this.dateFilterValue = {
        mode: 'range',
        fromDate: params['from'] ? new Date(params['from']) : undefined,
        toDate: params['to'] ? new Date(params['to']) : undefined,
      };
      if (params['from']) {
        this.filters.from = new Date(params['from']);
      }
      if (params['to']) {
        this.filters.to = new Date(params['to']);
      }
    }

    if (params['contains']) {
      this.filters.contains = params['contains'];
    }
    if (params['isForwarded']) {
      this.filters.isForwarded = params['isForwarded'];
    }
    if (params['page']) {
      this.page.set(parseInt(params['page'], 10));
    }
    if (params['pageSize']) {
      this.pageSize.set(parseInt(params['pageSize'], 10));
    }
  }

  // Visual styling methods for table cells
  getDispositionClass(disposition: string | undefined): string {
    switch (disposition) {
      case 'reject':
        return 'disposition-reject';
      case 'quarantine':
        return 'disposition-quarantine';
      case 'none':
        return 'disposition-none';
      default:
        return 'disposition-missing';
    }
  }

  getDispositionIcon(disposition: string | undefined): string {
    switch (disposition) {
      case 'reject':
        return 'cancel';
      case 'quarantine':
        return 'coronavirus';
      case 'none':
        return 'check_box';
      default:
        return '';
    }
  }

  getAuthClass(authResult: string | undefined): string {
    switch (authResult) {
      case 'pass':
        return 'auth-pass';
      case 'fail':
        return 'auth-fail';
      default:
        return 'auth-missing';
    }
  }

  // Generic authentication methods that consider both policy_evaluated and auth_results
  private getAuthLabel(record: DmarcRecord, type: 'dkim' | 'spf'): string {
    const policyResult = type === 'dkim' ? record.dmarcDkim : record.dmarcSpf;
    const hasAuthResults =
      type === 'dkim'
        ? record.dkimResults && record.dkimResults.length > 0
        : record.spfResults && record.spfResults.length > 0;

    if (policyResult === 'pass') {
      return 'pass';
    } else if (policyResult === 'fail') {
      if (hasAuthResults) {
        return 'fail'; // Authentication was attempted but failed
      } else {
        return 'missing'; // No authentication attempted (likely missing DNS record)
      }
    } else {
      return 'missing'; // No policy result
    }
  }

  private getAuthIcon(label: string): string {
    switch (label) {
      case 'pass':
        return 'check_box';
      case 'fail':
        return 'cancel';
      case 'missing':
        return '';
      default:
        return '';
    }
  }

  private getAuthClassByLabel(label: string): string {
    switch (label) {
      case 'pass':
        return 'auth-pass';
      case 'fail':
        return 'auth-fail';
      case 'missing':
        return 'auth-missing';
      default:
        return 'auth-missing';
    }
  }

  // DKIM-specific wrapper methods
  getDkimAuthLabel(record: DmarcRecord): string {
    return this.getAuthLabel(record, 'dkim');
  }

  getDkimAuthIcon(record: DmarcRecord): string {
    const label = this.getDkimAuthLabel(record);
    return this.getAuthIcon(label);
  }

  getDkimAuthClass(record: DmarcRecord): string {
    const label = this.getDkimAuthLabel(record);
    return this.getAuthClassByLabel(label);
  }

  // SPF-specific wrapper methods
  getSpfAuthLabel(record: DmarcRecord): string {
    return this.getAuthLabel(record, 'spf');
  }

  getSpfAuthIcon(record: DmarcRecord): string {
    const label = this.getSpfAuthLabel(record);
    return this.getAuthIcon(label);
  }

  getSpfAuthClass(record: DmarcRecord): string {
    const label = this.getSpfAuthLabel(record);
    return this.getAuthClassByLabel(label);
  }

  // Forwarded email helpers
  getForwardedLabel(record: DmarcRecord): string {
    if (record.isForwarded === true) {
      return 'Yes';
    } else if (record.isForwarded === false) {
      return 'No';
    } else {
      return '?';
    }
  }

  getForwardedIcon(record: DmarcRecord): string {
    if (record.isForwarded === true) {
      return 'forward';
    } else if (record.isForwarded === false) {
      return '';
    } else {
      return 'question_mark';
    }
  }

  getForwardedClass(record: DmarcRecord): string {
    if (record.isForwarded === true) {
      return 'forwarded-yes';
    } else if (record.isForwarded === false) {
      return 'forwarded-no';
    } else {
      return 'forwarded-unknown';
    }
  }

  // Policy styling method
  getPolicyClass(policy: string): string {
    switch (policy) {
      case 'reject':
        return 'policy-reject';
      case 'quarantine':
        return 'policy-quarantine';
      case 'none':
        return 'policy-none';
      default:
        return 'policy-unknown';
    }
  }

  // Update URL with current filter state
  private updateUrl() {
    const queryParams: any = {};

    if (this.filters.domain.length) {
      queryParams.domain = this.filters.domain;
    }
    if (this.filters.orgName.length) {
      queryParams.orgName = this.filters.orgName;
    }
    if (this.filters.disposition.length) {
      queryParams.disposition = this.filters.disposition;
    }
    if (this.filters.dkim.length) {
      queryParams.dkim = this.filters.dkim;
    }
    if (this.filters.spf.length) {
      queryParams.spf = this.filters.spf;
    }
    if (this.filters.sourceIp.length) {
      queryParams.sourceIp = this.filters.sourceIp;
    }
    if (this.filters.envelopeTo.length) {
      queryParams.envelopeTo = this.filters.envelopeTo;
    }
    if (this.filters.envelopeFrom.length) {
      queryParams.envelopeFrom = this.filters.envelopeFrom;
    }
    if (this.filters.headerFrom.length) {
      queryParams.headerFrom = this.filters.headerFrom;
    }
    if (this.filters.dkimDomain.length) {
      queryParams.dkimDomain = this.filters.dkimDomain;
    }
    if (this.filters.spfDomain.length) {
      queryParams.spfDomain = this.filters.spfDomain;
    }
    if (this.filters.country.length) {
      queryParams.country = this.filters.country;
    }

    // Save date filter to URL
    if (this.dateFilterValue.mode === 'period' && this.dateFilterValue.periodInput) {
      queryParams.period = this.dateFilterValue.periodInput;
    } else if (this.dateFilterValue.mode === 'range') {
      if (this.filters.from) {
        queryParams.from = this.formatDateForUrl(this.filters.from);
      }
      if (this.filters.to) {
        queryParams.to = this.formatDateForUrl(this.filters.to);
      }
    }

    if (this.filters.contains) {
      queryParams.contains = this.filters.contains;
    }
    if (this.filters.isForwarded) {
      queryParams.isForwarded = this.filters.isForwarded;
    }
    if (this.page() > 1) {
      queryParams.page = this.page();
    }
    if (this.pageSize() !== 20) {
      queryParams.pageSize = this.pageSize();
    }

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'replace',
    });
  }
}
