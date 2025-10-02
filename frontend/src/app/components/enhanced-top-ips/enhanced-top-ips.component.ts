import { Component, Input, OnInit, OnChanges, SimpleChanges, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../shared/material.module';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator, PageEvent } from '@angular/material/paginator';
import { ApiService } from '../../services/api.service';

interface EnhancedIpData {
  sourceIp: string;
  count: number;
  passCount: number;
  failCount: number;
  dkimPassCount: number;
  spfPassCount: number;
  country?: string;
  countryName?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
}

interface FilterParams {
  domains: string[];
  fromDate?: Date;
  toDate?: Date;
}

@Component({
  selector: 'app-enhanced-top-ips',
  standalone: true,
  imports: [CommonModule, MaterialModule],
  template: `
    <mat-card class="ips-card">
      <mat-card-header>
        <mat-card-title>
          <mat-icon>router</mat-icon>
          Top Sender IPs with Geographic Information
        </mat-card-title>
        <mat-card-subtitle>
          Source IP addresses sending emails to your domain with location and authentication results
        </mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        <div *ngIf="loading" class="loading-container">
          <mat-spinner></mat-spinner>
          <p>Loading IP data...</p>
        </div>

        <div *ngIf="!loading" class="table-container">
          <table mat-table [dataSource]="dataSource" class="full-width-table">
            <!-- IP Address Column -->
            <ng-container matColumnDef="sourceIp">
              <th mat-header-cell *matHeaderCellDef>IP Address</th>
              <td mat-cell *matCellDef="let element">
                <div class="ip-cell">
                  <code>{{ element.sourceIp }}</code>
                  <mat-icon
                    *ngIf="element.latitude && element.longitude"
                    class="location-icon"
                    matTooltip="Geographic location available"
                  >
                    location_on
                  </mat-icon>
                </div>
              </td>
            </ng-container>

            <!-- Location Column -->
            <ng-container matColumnDef="location">
              <th mat-header-cell *matHeaderCellDef>Location</th>
              <td mat-cell *matCellDef="let element">
                <div class="location-cell">
                  <div *ngIf="element.countryName || element.country" class="country">
                    <mat-icon class="flag-icon">flag</mat-icon>
                    {{ element.countryName || element.country }}
                  </div>
                  <div *ngIf="element.city" class="city">
                    <mat-icon class="city-icon">location_city</mat-icon>
                    {{ element.city }}
                  </div>
                  <div *ngIf="!element.country && !element.city" class="no-location">
                    <mat-icon>help_outline</mat-icon>
                    Unknown
                  </div>
                </div>
              </td>
            </ng-container>

            <!-- Total Count Column -->
            <ng-container matColumnDef="count">
              <th mat-header-cell *matHeaderCellDef>Total Records</th>
              <td mat-cell *matCellDef="let element">
                <span class="count-badge">{{ element.count | number }}</span>
              </td>
            </ng-container>

            <!-- DMARC Pass Column -->
            <ng-container matColumnDef="passCount">
              <th mat-header-cell *matHeaderCellDef>DMARC Pass</th>
              <td mat-cell *matCellDef="let element">
                <div class="auth-result">
                  <span class="pass-count">{{ element.passCount | number }}</span>
                  <span class="percentage pass"> ({{ getPercentage(element.passCount, element.count) }}%) </span>
                </div>
              </td>
            </ng-container>

            <!-- DKIM Pass Column -->
            <ng-container matColumnDef="dkimPass">
              <th mat-header-cell *matHeaderCellDef>DKIM Pass</th>
              <td mat-cell *matCellDef="let element">
                <div class="auth-result">
                  <span class="pass-count">{{ element.dkimPassCount | number }}</span>
                  <span class="percentage pass"> ({{ getPercentage(element.dkimPassCount, element.count) }}%) </span>
                </div>
              </td>
            </ng-container>

            <!-- SPF Pass Column -->
            <ng-container matColumnDef="spfPass">
              <th mat-header-cell *matHeaderCellDef>SPF Pass</th>
              <td mat-cell *matCellDef="let element">
                <div class="auth-result">
                  <span class="pass-count">{{ element.spfPassCount | number }}</span>
                  <span class="percentage pass"> ({{ getPercentage(element.spfPassCount, element.count) }}%) </span>
                </div>
              </td>
            </ng-container>

            <!-- DMARC Fail Column -->
            <ng-container matColumnDef="failCount">
              <th mat-header-cell *matHeaderCellDef>DMARC Fail</th>
              <td mat-cell *matCellDef="let element">
                <div class="auth-result">
                  <span class="fail-count">{{ element.failCount | number }}</span>
                  <span class="percentage fail"> ({{ getPercentage(element.failCount, element.count) }}%) </span>
                </div>
              </td>
            </ng-container>

            <!-- Success Rate Column -->
            <ng-container matColumnDef="successRate">
              <th mat-header-cell *matHeaderCellDef>Success Rate</th>
              <td mat-cell *matCellDef="let element">
                <div class="success-rate">
                  <mat-progress-bar
                    mode="determinate"
                    [value]="getPercentage(element.passCount, element.count)"
                    [color]="getProgressBarColor(element.passCount, element.count)"
                  >
                  </mat-progress-bar>
                  <span class="rate-text"> {{ getPercentage(element.passCount, element.count) }}% </span>
                </div>
              </td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
            <tr mat-row *matRowDef="let row; columns: displayedColumns"></tr>
          </table>

          <mat-paginator
            #paginator
            [length]="totalCount"
            [pageSize]="pageSize"
            [pageIndex]="currentPage"
            [pageSizeOptions]="[10, 25, 50, 100]"
            (page)="onPageChange($event)"
            showFirstLastButtons
          >
          </mat-paginator>
        </div>
      </mat-card-content>
    </mat-card>
  `,
  styles: [
    `
      .ips-card {
        margin-bottom: 20px;
      }

      .loading-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 40px;
        gap: 16px;
      }

      .table-container {
        width: 100%;
      }

      .full-width-table {
        width: 100%;
      }

      .ip-cell {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .ip-cell code {
        font-family: 'Courier New', monospace;
        background-color: #f5f5f5;
        padding: 2px 6px;
        border-radius: 4px;
      }

      .location-icon {
        color: #4caf50;
        font-size: 16px;
        width: 16px;
        height: 16px;
      }

      .location-cell {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .country,
      .city,
      .no-location {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 12px;
      }

      .flag-icon,
      .city-icon {
        font-size: 14px;
        width: 14px;
        height: 14px;
      }

      .country {
        font-weight: 500;
      }

      .city {
        color: #666;
      }

      .no-location {
        color: #999;
      }

      .count-badge {
        background-color: #e3f2fd;
        color: #1976d2;
        padding: 4px 8px;
        border-radius: 12px;
        font-weight: 500;
      }

      .auth-result {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .pass-count {
        color: #4caf50;
        font-weight: 500;
      }

      .fail-count {
        color: #f44336;
        font-weight: 500;
      }

      .percentage {
        font-size: 11px;
      }

      .percentage.pass {
        color: #4caf50;
      }

      .percentage.fail {
        color: #f44336;
      }

      .success-rate {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 80px;
      }

      .rate-text {
        font-size: 12px;
        text-align: center;
      }

      mat-card-header {
        margin-bottom: 16px;
      }

      mat-card-title {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      mat-paginator {
        margin-top: 16px;
      }
    `,
  ],
})
export class EnhancedTopIpsComponent implements OnInit, OnChanges {
  @Input() filterParams: FilterParams = { domains: [] };
  @ViewChild(MatPaginator) paginator!: MatPaginator;

  displayedColumns: string[] = [
    'sourceIp',
    'location',
    'count',
    'dkimPass',
    'spfPass',
    'passCount',
    'failCount',
    'successRate',
  ];
  dataSource = new MatTableDataSource<EnhancedIpData>([]);
  loading = false;
  totalCount = 0;
  pageSize = 10;
  currentPage = 0;

  constructor(private apiService: ApiService) {}

  ngOnInit() {
    this.loadData();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['filterParams']) {
      this.currentPage = 0;
      this.loadData();
    }
  }

  private loadData() {
    this.loading = true;

    const params = {
      domain: this.filterParams.domains.length === 1 ? this.filterParams.domains[0] : undefined,
      from: this.filterParams.fromDate?.toISOString(),
      to: this.filterParams.toDate?.toISOString(),
      page: this.currentPage + 1,
      pageSize: this.pageSize,
    };

    this.apiService.getTopIpsEnhanced(params).subscribe({
      next: (response) => {
        this.dataSource.data = response.data;
        this.totalCount = response.total;
        this.loading = false;
      },
      error: (error) => {
        console.error('Failed to load enhanced IP data:', error);
        this.loading = false;
      },
    });
  }

  onPageChange(event: PageEvent) {
    this.currentPage = event.pageIndex;
    this.pageSize = event.pageSize;
    this.loadData();
  }

  getPercentage(value: number, total: number): number {
    return total > 0 ? Math.round((value / total) * 100) : 0;
  }

  getProgressBarColor(passCount: number, total: number): 'primary' | 'accent' | 'warn' {
    const percentage = this.getPercentage(passCount, total);
    if (percentage >= 80) return 'primary';
    if (percentage >= 50) return 'accent';
    return 'warn';
  }
}
