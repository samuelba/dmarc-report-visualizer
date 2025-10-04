import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService, DmarcReport, PagedResult } from '../../services/api.service';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { FormsModule } from '@angular/forms';

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
  ],
  template: `
    <main>
      <mat-form-field appearance="outline">
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
        padding: 16px;
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

  readonly reports = signal<DmarcReport[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly pageSize = signal(20);
  readonly domains = signal<string[]>([]);
  domainFilter = '';
  displayedColumns = ['domain', 'orgName', 'reportId', 'beginDate', 'endDate', 'actions'];

  ngOnInit(): void {
    this.loadDomains();
    this.fetch();
  }

  onPage(e: PageEvent) {
    this.page.set(e.pageIndex + 1);
    this.pageSize.set(e.pageSize);
    this.fetch();
  }

  onFilterChange() {
    this.page.set(1);
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
      const blob = new Blob([xml], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    });
  }
}
