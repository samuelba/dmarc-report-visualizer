import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { ApiService, DmarcReport, PagedResult } from '../../services/api.service';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { FormsModule } from '@angular/forms';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { XmlViewerDialogComponent } from '../../components/xml-viewer-dialog/xml-viewer-dialog.component';

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
  ],
  template: `
    <main class="reports-content">
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Filter by domain</mat-label>
        <mat-select [(ngModel)]="domainFilter" (selectionChange)="onFilterChange()">
          <mat-option value="">All domains</mat-option>
          <mat-option *ngFor="let domain of domains()" [value]="domain">{{ domain }}</mat-option>
        </mat-select>
      </mat-form-field>

      <table mat-table [dataSource]="reports()" class="mat-elevation-z1">
        <ng-container matColumnDef="domain">
          <th mat-header-cell *matHeaderCellDef>Domain</th>
          <td mat-cell *matCellDef="let r">{{ r.domain }}</td>
        </ng-container>
        <ng-container matColumnDef="orgName">
          <th mat-header-cell *matHeaderCellDef>Reporting Org</th>
          <td mat-cell *matCellDef="let r">{{ r.orgName || 'N/A' }}</td>
        </ng-container>
        <ng-container matColumnDef="reportId">
          <th mat-header-cell *matHeaderCellDef>Report ID</th>
          <td mat-cell *matCellDef="let r">{{ r.reportId }}</td>
        </ng-container>
        <ng-container matColumnDef="beginDate">
          <th mat-header-cell *matHeaderCellDef>Begin</th>
          <td mat-cell *matCellDef="let r">{{ r.beginDate | date: 'short' }}</td>
        </ng-container>
        <ng-container matColumnDef="endDate">
          <th mat-header-cell *matHeaderCellDef>End</th>
          <td mat-cell *matCellDef="let r">{{ r.endDate | date: 'short' }}</td>
        </ng-container>

        <ng-container matColumnDef="actions">
          <th mat-header-cell *matHeaderCellDef>Actions</th>
          <td mat-cell *matCellDef="let r">
            <button mat-button color="primary" (click)="viewXml(r.id)">View XML</button>
          </td>
        </ng-container>

        <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
        <tr mat-row *matRowDef="let row; columns: displayedColumns"></tr>
      </table>

      <mat-paginator
        [length]="total()"
        [pageSize]="pageSize()"
        [pageIndex]="page() - 1"
        [pageSizeOptions]="[10, 25, 50, 100]"
        showFirstLastButtons
        (page)="onPage($event)"
      ></mat-paginator>
    </main>
  `,
  styles: [
    `
      main {
        display: block;
      }
      table {
        width: 100%;
        margin: 16px 0;
      }
    `,
  ],
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
  readonly pageSize = signal(20);
  readonly domains = signal<string[]>([]);
  domainFilter = '';
  displayedColumns = ['domain', 'orgName', 'reportId', 'beginDate', 'endDate', 'actions'];

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
          error: (err) => {
            this.snackBar.open('Failed to load XML report', 'Close', {
              duration: 5000,
            });
          },
        });
      },
      error: (err) => {
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
    const queryParams: any = {};
    if (this.domainFilter) queryParams.domain = this.domainFilter;
    if (this.page() > 1) queryParams.page = this.page();
    if (this.pageSize() !== 20) queryParams.pageSize = this.pageSize();

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
    this.api
      .listReports({ domain: this.domainFilter, page: this.page(), pageSize: this.pageSize() })
      .subscribe((res: PagedResult<DmarcReport>) => {
        this.reports.set(res.data);
        this.total.set(res.total);
      });
  }

  viewXml(id: string) {
    this.api.getReportXml(id).subscribe((xml) => {
      // Find the report to get additional details
      const report = this.reports().find(r => r.id === id);
      
      this.dialog.open(XmlViewerDialogComponent, {
        data: { 
          xml, 
          reportId: id,
          title: `DMARC Report XML - ${report?.domain || 'Unknown Domain'}` 
        },
        width: '90%',
        maxWidth: '1400px',
        height: '85vh',
      });
    });
  }
}
