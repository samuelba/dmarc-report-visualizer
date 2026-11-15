import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { ApiService, DmarcReport, PagedResult } from '../../services/api.service';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { XmlViewerDialogComponent } from '../../components/xml-viewer-dialog/xml-viewer-dialog.component';
import { SenderBadgeComponent } from '../../components/sender-badge/sender-badge.component';
import { ReportDeliveriesDialogComponent } from '../../components/report-deliveries-dialog/report-deliveries-dialog.component';

const DEFAULT_PAGE_SIZE = 20;
const MAX_SKELETON_ROWS = 10;

@Component({
  standalone: true,
  selector: 'app-reports',
  imports: [
    CommonModule,
    MatTableModule,
    MatPaginatorModule,
    MatFormFieldModule,
    MatSelectModule,
    MatButtonModule,
    FormsModule,
    MatDialogModule,
    SenderBadgeComponent,
  ],
  templateUrl: './reports.component.html',
  styleUrls: ['./reports.component.scss'],
})
export class ReportsComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  readonly reports = signal<DmarcReport[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly pageSize = signal(DEFAULT_PAGE_SIZE);
  readonly pageSizeOptions = [10, DEFAULT_PAGE_SIZE, 50, 100];
  readonly loading = signal(false);
  readonly tableRows = computed<readonly unknown[]>(() =>
    this.loading() ? Array.from({ length: Math.min(this.pageSize(), MAX_SKELETON_ROWS) }, (_, i) => i) : this.reports()
  );
  readonly domains = signal<string[]>([]);
  domainFilter = '';
  displayedColumns = ['domain', 'orgName', 'sender', 'reportId', 'beginDate', 'endDate'];

  ngOnInit(): void {
    this.loadFiltersFromUrl();
    this.loadDomains();
    this.fetch();

    // Check if there's a reportId in the URL to auto-open XML viewer
    const params = this.route.snapshot.queryParams;
    if (params['reportId']) {
      this.openReportXmlViewer(params['reportId']);
    }
  }

  private openReportXmlViewer(reportId: string) {
    // Find the report by database ID
    this.api.findOne(reportId).subscribe({
      next: (report) => {
        if (!report) {
          this.snackBar.open('Report not found', 'Close', {
            duration: 5000,
          });
          return;
        }

        // Get the XML and open the dialog
        this.api.getReportXml(reportId).subscribe({
          next: (xml) => {
            this.dialog.open(XmlViewerDialogComponent, {
              data: {
                xml,
                reportId: reportId,
                title: `DMARC Report XML - ${report.domain || 'Unknown Domain'}`,
              },
              width: '90%',
              maxWidth: '1400px',
              height: '85vh',
            });
          },
          error: (_err) => {
            this.snackBar.open('Failed to load XML report', 'Close', {
              duration: 5000,
            });
          },
        });
      },
      error: (_err) => {
        this.snackBar.open('Failed to load report details', 'Close', {
          duration: 5000,
        });
      },
    });
  }

  private loadFiltersFromUrl() {
    const params = this.route.snapshot.queryParams;
    if (params['domain']) {
      this.domainFilter = params['domain'];
    }
    if (params['page']) {
      this.page.set(parseInt(params['page'], 10));
    }
    if (params['pageSize']) {
      this.pageSize.set(parseInt(params['pageSize'], 10));
    }
  }

  private updateUrl() {
    const queryParams = {
      domain: this.domainFilter || null,
      page: this.page() > 1 ? this.page() : null,
      pageSize: this.pageSize() !== DEFAULT_PAGE_SIZE ? this.pageSize() : null,
    };

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  onPage(e: PageEvent) {
    this.page.set(e.pageIndex + 1);
    this.pageSize.set(e.pageSize);
    this.updateUrl();
    this.fetch();
  }

  onFilterChange() {
    this.page.set(1);
    this.updateUrl();
    this.fetch();
  }

  private loadDomains() {
    this.api.getReportDomains().subscribe((res) => {
      this.domains.set(res.domains);
    });
  }

  private fetch() {
    this.loading.set(true);
    this.api
      .listReports({ domain: this.domainFilter, page: this.page(), pageSize: this.pageSize() })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (res: PagedResult<DmarcReport>) => {
          this.reports.set(res.data);
          this.total.set(res.total);
        },
        error: () => {
          this.snackBar.open('Failed to load reports', 'Close', { duration: 5000 });
        },
      });
  }

  openSenderDetails(report: DmarcReport) {
    this.dialog.open(ReportDeliveriesDialogComponent, {
      data: {
        reportId: report.id,
        title: `${report.domain || 'Unknown Domain'} · ${report.orgName || 'Unknown reporter'}`,
        authStatus: report.authStatus,
      },
      width: '720px',
      maxWidth: '95vw',
    });
  }

  openReportDetails(report: DmarcReport) {
    this.api.getReportXml(report.id).subscribe((xml) => {
      this.dialog.open(XmlViewerDialogComponent, {
        data: {
          xml,
          reportId: report.id,
          title: `DMARC Report XML - ${report.domain || 'Unknown Domain'}`,
        },
        width: '90%',
        maxWidth: '1400px',
        height: '85vh',
      });
    });
  }
}
