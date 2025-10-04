import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MaterialModule } from '../../shared/material.module';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { DashboardFilterComponent } from '../../components/dashboard-filter/dashboard-filter.component';
import { WorldMapComponent } from '../../components/world-map/world-map.component';
import { EnhancedTopIpsComponent } from '../../components/enhanced-top-ips/enhanced-top-ips.component';
import { ApiService } from '../../services/api.service';
import { NgxEchartsModule } from 'ngx-echarts';

interface FilterParams {
  domains: string[];
  fromDate?: Date;
  toDate?: Date;
}

interface HeatmapPoint {
  latitude: number;
  longitude: number;
  count: number;
  passCount: number;
  failCount: number;
}

interface CountryData {
  country: string;
  countryName: string;
  count: number;
  dmarcPassCount: number;
  dkimPassCount: number;
  spfPassCount: number;
}

interface HeaderFromRow {
  headerFrom: string;
  count: number;
  dmarcPassCount: number;
  dkimPassCount: number;
  spfPassCount: number;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MaterialModule,
    MatPaginatorModule,
    DashboardFilterComponent,
    WorldMapComponent,
    EnhancedTopIpsComponent,
    NgxEchartsModule,
  ],
  template: `
    <div class="dashboard-container">
      <div class="dashboard-content">
        <!-- Filter Section -->
        <app-dashboard-filter (filterChange)="onFilterChange($event)" (refreshRequested)="refreshData()">
        </app-dashboard-filter>

        <!-- Summary Cards -->
        <div class="summary-cards">
          <mat-card class="summary-card">
            <mat-card-header>
              <mat-card-title>
                <mat-icon>public</mat-icon>
                Countries
              </mat-card-title>
            </mat-card-header>
            <mat-card-content>
              <div class="metric-value">{{ totalCountries }}</div>
              <div class="metric-label">Unique Countries</div>
            </mat-card-content>
          </mat-card>

          <mat-card class="summary-card">
            <mat-card-header>
              <mat-card-title>
                <mat-icon>location_on</mat-icon>
                Locations
              </mat-card-title>
            </mat-card-header>
            <mat-card-content>
              <div class="metric-value">{{ totalLocations }}</div>
              <div class="metric-label">Geographic Points</div>
            </mat-card-content>
          </mat-card>

          <mat-card class="summary-card">
            <mat-card-header>
              <mat-card-title>
                <mat-icon>security</mat-icon>
                Global Pass Rate
              </mat-card-title>
            </mat-card-header>
            <mat-card-content>
              <div
                class="metric-value"
                [class.success]="globalPassRate >= 80"
                [class.warning]="globalPassRate >= 50 && globalPassRate < 80"
                [class.danger]="globalPassRate < 50"
              >
                {{ globalPassRate }}%
              </div>
              <div class="metric-sub">
                <span
                  ><strong>DKIM:</strong>
                  {{ (totalReports > 0 ? (dkimPass / totalReports) * 100 : 0) | number: '1.0-0' }}%</span
                >
                <span
                  ><strong>SPF:</strong>
                  {{ (totalReports > 0 ? (spfPass / totalReports) * 100 : 0) | number: '1.0-0' }}%</span
                >
              </div>
              <div class="metric-label">DMARC Authentication</div>
            </mat-card-content>
          </mat-card>

          <mat-card class="summary-card">
            <mat-card-header>
              <mat-card-title>
                <mat-icon>email</mat-icon>
                Total Records
              </mat-card-title>
            </mat-card-header>
            <mat-card-content>
              <div class="metric-value">{{ totalReports | number }}</div>
              <div class="metric-label">Email Records</div>
            </mat-card-content>
          </mat-card>
        </div>

        <!-- Charts -->
        <div class="charts-grid">
          <mat-card class="chart-card">
            <mat-card-header>
              <mat-card-title>
                <mat-icon>show_chart</mat-icon>
                Email Reports Over Time
              </mat-card-title>
            </mat-card-header>
            <mat-card-content>
              <div echarts [options]="volumeChartOptions" class="chart"></div>
            </mat-card-content>
          </mat-card>

          <mat-card class="chart-card">
            <mat-card-header>
              <mat-card-title>
                <mat-icon>stacked_line_chart</mat-icon>
                Disposition Over Time
              </mat-card-title>
            </mat-card-header>
            <mat-card-content>
              <div echarts [options]="dispositionChartOptions" class="chart"></div>
            </mat-card-content>
          </mat-card>
        </div>

        <!-- DNS Validation Issues - Hidden for now -->
        <!--
        <mat-card class="dns-issues-card">
          <mat-card-header>
            <mat-card-title>
              <mat-icon>dns</mat-icon>
              DNS Configuration Issues
            </mat-card-title>
            <mat-card-subtitle>
              Real-time DNS validation of DMARC, SPF, and DKIM records for your domains
            </mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <div *ngIf="loadingDnsIssues" class="loading-container">
              <mat-spinner></mat-spinner>
              <p>Validating DNS records...</p>
            </div>

            <div *ngIf="!loadingDnsIssues && domainsWithDnsIssues.length === 0" class="no-issues">
              <mat-icon class="success-icon">check_circle</mat-icon>
              <p>Excellent! All your domains have proper DNS configuration.</p>
            </div>

            <div *ngIf="!loadingDnsIssues && domainsWithDnsIssues.length > 0">
              <div class="dns-issues-list">
                <div *ngFor="let domain of domainsWithDnsIssues" class="dns-issue-item" [class]="'severity-' + domain.severity">
                  <div class="issue-header">
                    <div class="domain-name">
                      <mat-icon [class]="getDnsSeverityIcon(domain.severity)">{{ getDnsSeverityIconName(domain.severity) }}</mat-icon>
                      <strong>{{ domain.domain }}</strong>
                      <span class="severity-badge" [class]="'severity-' + domain.severity">{{ domain.severity.toUpperCase() }}</span>
                    </div>
                  </div>
                  <div class="issue-summary">
                    {{ domain.summary }}
                  </div>
                  <div class="dns-status">
                    <div class="dns-record" [class.has-issues]="!domain.dmarc.exists || domain.dmarc.issues.length > 0">
                      <span class="record-label">DMARC:</span>
                      <span *ngIf="domain.dmarc.exists" class="record-exists">✅ {{ domain.dmarc.policy || 'Found' }}</span>
                      <span *ngIf="!domain.dmarc.exists" class="record-missing">❌ Missing</span>
                      <div *ngIf="domain.dmarc.issues.length > 0" class="record-issues">
                        <small *ngFor="let issue of domain.dmarc.issues">• {{ issue }}</small>
                      </div>
                    </div>
                    <div class="dns-record" [class.has-issues]="!domain.spf.exists || domain.spf.issues.length > 0">
                      <span class="record-label">SPF:</span>
                      <span *ngIf="domain.spf.exists" class="record-exists">✅ Found</span>
                      <span *ngIf="!domain.spf.exists" class="record-missing">❌ Missing</span>
                      <div *ngIf="domain.spf.issues.length > 0" class="record-issues">
                        <small *ngFor="let issue of domain.spf.issues">• {{ issue }}</small>
                      </div>
                    </div>
                    <div class="dns-record" [class.has-issues]="domain.dkim.foundSelectors === 0 || domain.dkim.issues.length > 0">
                      <span class="record-label">DKIM:</span>
                      <span *ngIf="domain.dkim.foundSelectors > 0" class="record-exists">✅ {{ domain.dkim.foundSelectors }} selector(s)</span>
                      <span *ngIf="domain.dkim.foundSelectors === 0" class="record-missing">❌ No selectors found</span>
                      <div *ngIf="domain.dkim.issues.length > 0" class="record-issues">
                        <small *ngFor="let issue of domain.dkim.issues">• {{ issue }}</small>
                      </div>
                    </div>
                  </div>
                  <div class="recommendations" *ngIf="domain.recommendations.length > 0">
                    <strong>Recommendations:</strong>
                    <ul>
                      <li *ngFor="let rec of domain.recommendations">{{ rec }}</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </mat-card-content>
        </mat-card>
        -->

        <!-- Top Countries + Header-From Domains -->
        <div class="top-tables-grid">
          <!-- Top Countries -->
          <mat-card class="countries-card">
            <mat-card-header>
              <mat-card-title>
                <mat-icon>flag</mat-icon>
                Top Countries by Email Volume
              </mat-card-title>
              <mat-card-subtitle>
                Countries with the highest number of email records ({{ totalCountriesCount }} total)
              </mat-card-subtitle>
            </mat-card-header>
            <mat-card-content>
              <div *ngIf="loadingCountries" class="loading-container">
                <mat-spinner></mat-spinner>
                <p>Loading country data...</p>
              </div>

              <div *ngIf="!loadingCountries">
                <div class="countries-list">
                  <div *ngFor="let country of topCountries; let i = index" class="country-item">
                    <div class="country-rank">{{ (countriesPage - 1) * countriesPageSize + i + 1 }}</div>
                    <div class="country-info">
                      <div class="country-name">
                        <mat-icon>flag</mat-icon>
                        {{ country.countryName || country.country }}
                      </div>
                      <div class="country-stats">
                        <span class="total-count">{{ country.count | number }} records</span>
                        <span
                          class="pass-rate"
                          [class.success]="getPassRate(country) >= 80"
                          [class.warning]="getPassRate(country) >= 50 && getPassRate(country) < 80"
                          [class.danger]="getPassRate(country) < 50"
                        >
                          {{ getPassRate(country) }}% DMARC pass
                        </span>
                        <span><strong>DKIM:</strong> {{ getDkimPassRate(country) }}%</span>
                        <span><strong>SPF:</strong> {{ getSpfPassRate(country) }}%</span>
                      </div>
                    </div>
                    <div class="country-progress">
                      <mat-progress-bar
                        mode="determinate"
                        [value]="getPassRate(country)"
                        [color]="getProgressColor(country)"
                      >
                      </mat-progress-bar>
                    </div>
                  </div>
                </div>

                <mat-paginator
                  *ngIf="totalCountriesCount > countriesPageSize"
                  [length]="totalCountriesCount"
                  [pageSize]="countriesPageSize"
                  [pageIndex]="countriesPage - 1"
                  [pageSizeOptions]="[5, 10, 25, 50]"
                  (page)="onCountriesPageChange($event)"
                  showFirstLastButtons
                >
                </mat-paginator>
              </div>
            </mat-card-content>
          </mat-card>

          <!-- Top Header-From Domains -->
          <mat-card class="headerfrom-card">
            <mat-card-header>
              <mat-card-title>
                <mat-icon>alternate_email</mat-icon>
                Top Header-From Domains
              </mat-card-title>
              <mat-card-subtitle>
                Domains found in the email Header-From ({{ headerFromTotal }} total)
              </mat-card-subtitle>
            </mat-card-header>
            <mat-card-content>
              <div *ngIf="loadingHeaderFrom" class="loading-container">
                <mat-spinner></mat-spinner>
                <p>Loading domain data...</p>
              </div>

              <div *ngIf="!loadingHeaderFrom">
                <div class="headerfrom-list">
                  <div *ngFor="let row of headerFromRows; let i = index" class="headerfrom-item">
                    <div class="hf-rank">{{ (headerFromPage - 1) * headerFromPageSize + i + 1 }}</div>
                    <div class="hf-info">
                      <div class="hf-name">
                        <mat-icon>alternate_email</mat-icon>
                        {{ row.headerFrom || 'Unknown' }}
                      </div>
                      <div class="hf-stats">
                        <span class="total-count">{{ row.count | number }} records</span>
                        <span
                          class="pass-rate"
                          [class.success]="getHeaderFromDmarcPassRate(row) >= 80"
                          [class.warning]="getHeaderFromDmarcPassRate(row) >= 50 && getHeaderFromDmarcPassRate(row) < 80"
                          [class.danger]="getHeaderFromDmarcPassRate(row) < 50"
                        >
                          {{ getHeaderFromDmarcPassRate(row) }}% DMARC pass
                        </span>
                        <span><strong>DKIM:</strong> {{ getHeaderFromDkimPassRate(row) }}%</span>
                        <span><strong>SPF:</strong> {{ getHeaderFromSpfPassRate(row) }}%</span>
                      </div>
                    </div>
                    <div class="hf-progress">
                      <mat-progress-bar
                        mode="determinate"
                        [value]="getHeaderFromDmarcPassRate(row)"
                        [color]="getHeaderFromProgressColor(row)"
                      >
                      </mat-progress-bar>
                    </div>
                  </div>
                </div>

                <mat-paginator
                  *ngIf="headerFromTotal > headerFromPageSize"
                  [length]="headerFromTotal"
                  [pageSize]="headerFromPageSize"
                  [pageIndex]="headerFromPage - 1"
                  [pageSizeOptions]="[5, 10, 25, 50]"
                  (page)="onHeaderFromPageChange($event)"
                  showFirstLastButtons
                >
                </mat-paginator>
              </div>
            </mat-card-content>
          </mat-card>
        </div>

        <!-- World Map -->
        <app-world-map [heatmapData]="heatmapData" [loading]="loadingHeatmap"> </app-world-map>

        <!-- Enhanced Top IPs -->
        <app-enhanced-top-ips [filterParams]="currentFilter"> </app-enhanced-top-ips>

        <!-- DMARC Insights -->
        <mat-card class="insights-card">
          <mat-card-header>
            <mat-card-title>
              <mat-icon>insights</mat-icon>
              DMARC Insights & Recommendations
            </mat-card-title>
          </mat-card-header>
          <mat-card-content>
            <div class="insights-grid">
              <div class="insight-item" *ngFor="let insight of dmarcInsights">
                <mat-icon [class]="insight.severity">{{ insight.icon }}</mat-icon>
                <div class="insight-content">
                  <h4>{{ insight.title }}</h4>
                  <p>{{ insight.description }}</p>
                  <div *ngIf="insight.action" class="insight-action">
                    <strong>Recommended Action:</strong> {{ insight.action }}
                  </div>
                </div>
              </div>
            </div>
          </mat-card-content>
        </mat-card>
      </div>
    </div>
  `,
  styles: [
    `
      .dashboard-container {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
      }

      .spacer {
        flex: 1;
      }

      .dashboard-content {
        flex: 1;
        padding: 20px;
      }

      .summary-cards {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: 20px;
        margin-bottom: 20px;
      }

      .summary-card {
        text-align: center;
      }

      .summary-card mat-card-title {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        font-size: 16px;
      }

      .metric-value {
        font-size: 2.5rem;
        font-weight: bold;
        margin: 16px 0 8px;
      }

      .metric-value.success {
        color: #4caf50;
      }

      .metric-value.warning {
        color: #ff9800;
      }

      .metric-value.danger {
        color: #f44336;
      }

      .metric-label {
        color: #666;
        font-size: 14px;
      }

      .metric-sub {
        display: flex;
        justify-content: center;
        gap: 16px;
        margin-top: 4px;
        color: #555;
      }

      .top-tables-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
        gap: 20px;
        margin-bottom: 20px;
      }

      .countries-card {
        margin-bottom: 0;
      }

      .dns-issues-card {
        margin-bottom: 20px;
      }

      .no-issues {
        text-align: center;
        padding: 40px;
        color: #4caf50;
      }

      .success-icon {
        font-size: 48px;
        width: 48px;
        height: 48px;
        color: #4caf50;
      }

      .dns-issues-list {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .dns-issue-item {
        padding: 16px;
        border-radius: 8px;
        border-left: 4px solid #ff9800;
      }

      .dns-issue-item.severity-critical {
        background-color: #ffebee;
        border-left-color: #f44336;
      }

      .dns-issue-item.severity-warning {
        background-color: #fff3e0;
        border-left-color: #ff9800;
      }

      .dns-issue-item.severity-good {
        background-color: #e8f5e8;
        border-left-color: #4caf50;
      }

      .issue-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
      }

      .domain-name {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 16px;
      }

      .severity-badge {
        font-size: 10px;
        font-weight: bold;
        padding: 2px 6px;
        border-radius: 10px;
        color: white;
      }

      .severity-badge.severity-critical {
        background-color: #f44336;
      }

      .severity-badge.severity-warning {
        background-color: #ff9800;
      }

      .severity-badge.severity-good {
        background-color: #4caf50;
      }

      .issue-summary {
        font-size: 14px;
        color: #555;
        margin-bottom: 12px;
        font-style: italic;
      }

      .dns-status {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 12px;
      }

      .dns-record {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .record-label {
        font-weight: bold;
        font-size: 12px;
        color: #333;
      }

      .record-exists {
        color: #4caf50;
        font-size: 12px;
      }

      .record-missing {
        color: #f44336;
        font-size: 12px;
      }

      .record-issues {
        margin-left: 16px;
        color: #666;
      }

      .record-issues small {
        display: block;
        font-size: 10px;
        margin: 2px 0;
      }

      .recommendations {
        font-size: 12px;
        color: #555;
        background-color: rgba(255, 255, 255, 0.7);
        padding: 8px;
        border-radius: 4px;
      }

      .recommendations ul {
        margin: 4px 0 0 16px;
        padding: 0;
      }

      .recommendations li {
        margin: 2px 0;
      }

      .critical-severity {
        color: #f44336;
      }

      .warning-severity {
        color: #ff9800;
      }

      .good-severity {
        color: #4caf50;
      }

      .charts-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
        gap: 20px;
        margin-bottom: 20px;
      }

      .chart-card .chart {
        height: 280px;
        width: 100%;
      }

      .loading-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 40px;
        gap: 16px;
      }

      .countries-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
        margin-bottom: 16px; /* Add gap before pagination */
      }

      .country-item {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 12px;
        background-color: #f9f9f9;
        border-radius: 8px;
      }

      .country-rank {
        font-size: 18px;
        font-weight: bold;
        color: #666;
        min-width: 30px;
      }

      .country-info {
        flex: 1;
      }

      .country-name {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 500;
        margin-bottom: 4px;
      }

      .country-stats {
        display: flex;
        gap: 16px;
        font-size: 14px;
      }

      .total-count {
        color: #666;
      }

      .pass-rate.success {
        color: #4caf50;
      }

      .pass-rate.warning {
        color: #ff9800;
      }

      .pass-rate.danger {
        color: #f44336;
      }

      .country-progress {
        width: 100px;
      }

      /* Header-From list styles */
      .headerfrom-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
        margin-bottom: 16px; /* Add gap before pagination */
      }

      .headerfrom-item {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 12px;
        background-color: #f9f9f9;
        border-radius: 8px;
      }

      .hf-rank {
        font-size: 18px;
        font-weight: bold;
        color: #666;
        min-width: 30px;
      }

      .hf-info {
        flex: 1;
      }

      .hf-name {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 500;
        margin-bottom: 4px;
        word-break: break-all;
      }

      .hf-stats {
        display: flex;
        gap: 16px;
        font-size: 14px;
        flex-wrap: wrap;
      }

      .hf-progress {
        width: 100px;
      }

      .insights-card {
        margin-bottom: 20px;
      }

      .insights-grid {
        display: flex;
        flex-direction: column;
        gap: 20px;
      }

      .insight-item {
        display: flex;
        gap: 16px;
        padding: 16px;
        background-color: #f9f9f9;
        border-radius: 8px;
        border-left: 4px solid #2196f3;
      }

      .insight-item mat-icon {
        font-size: 24px;
        width: 24px;
        height: 24px;
      }

      .insight-item mat-icon.info {
        color: #2196f3;
      }

      .insight-item mat-icon.warning {
        color: #ff9800;
      }

      .insight-item mat-icon.error {
        color: #f44336;
      }

      .insight-item mat-icon.success {
        color: #4caf50;
      }

      .insight-content h4 {
        margin: 0 0 8px;
        color: #333;
      }

      .insight-content p {
        margin: 0 0 8px;
        color: #666;
      }

      .insight-action {
        font-size: 14px;
        color: #333;
      }

      mat-card-header {
        margin-bottom: 16px;
      }

      mat-card-title {
        display: flex;
        align-items: center;
        gap: 8px;
      }
    `,
  ],
})
export class DashboardComponent implements OnInit {
  currentFilter: FilterParams = { domains: [] };
  heatmapData: HeatmapPoint[] = [];
  topCountries: CountryData[] = [];

  headerFromRows: HeaderFromRow[] = [];

  // Summary metrics
  totalCountries = 0;
  totalLocations = 0;
  globalPassRate = 0;
  totalReports = 0;
  dkimPass = 0;
  spfPass = 0;

  // Loading states
  loadingHeatmap = false;
  loadingCountries = false;
  loadingDnsIssues = false;
  loadingHeaderFrom = false;

  // Countries pagination
  countriesPage = 1;
  countriesPageSize = 10;
  totalCountriesCount = 0;

  // Header-From pagination
  headerFromPage = 1;
  headerFromPageSize = 10;
  headerFromTotal = 0;

  // Charts
  volumeChartOptions: any;
  dispositionChartOptions: any;

  // DNS validation issues
  domainsWithDnsIssues: Array<{
    domain: string;
    severity: 'good' | 'warning' | 'critical';
    summary: string;
    recommendations: string[];
    dmarc: {
      exists: boolean;
      policy?: string;
      issues: string[];
    };
    spf: {
      exists: boolean;
      issues: string[];
    };
    dkim: {
      foundSelectors: number;
      issues: string[];
    };
  }> = [];

  // DMARC insights
  dmarcInsights = [
    {
      icon: 'info',
      severity: 'info',
      title: 'Geographic Distribution Analysis',
      description: 'Monitor sender locations to identify legitimate vs. suspicious traffic patterns.',
      action: 'Review IPs from unexpected countries and verify their legitimacy.',
    },
    {
      icon: 'security',
      severity: 'success',
      title: 'Authentication Success Tracking',
      description: 'Track DKIM and SPF authentication success rates across different regions.',
      action: 'Focus on improving authentication for regions with low pass rates.',
    },
    {
      icon: 'warning',
      severity: 'warning',
      title: 'Suspicious IP Monitoring',
      description: 'IPs with consistently failing DMARC checks may indicate spoofing attempts.',
      action: 'Investigate IPs with high failure rates and consider blocking if malicious.',
    },
    {
      icon: 'trending_up',
      severity: 'info',
      title: 'Policy Effectiveness',
      description: 'Analyze how your DMARC policy (none/quarantine/reject) affects email delivery.',
      action: 'Gradually move from "none" to "quarantine" to "reject" as authentication improves.',
    },
  ];

  constructor(private apiService: ApiService) {}

  ngOnInit() {
    // Don't load data here - wait for the filter component to emit its initial filterChange event
    // This prevents a race condition where we load data twice (once with no filter, once with the default 30d filter)
  }

  onFilterChange(filter: FilterParams) {
    this.currentFilter = filter;
    this.countriesPage = 1;
    this.headerFromPage = 1;
    this.loadData();
  }

  refreshData() {
    this.loadData();
  }

  onCountriesPageChange(event: PageEvent) {
    this.countriesPage = event.pageIndex + 1;
    this.countriesPageSize = event.pageSize;
    this.loadCountriesData();
  }

  onHeaderFromPageChange(event: PageEvent) {
    this.headerFromPage = event.pageIndex + 1;
    this.headerFromPageSize = event.pageSize;
    this.loadHeaderFromData();
  }

  private loadData() {
    this.loadHeatmapData();
    this.loadCountriesData();
    this.loadHeaderFromData();
    this.loadCharts();
    this.loadAuthSummary();
    // this.loadDnsIssues(); // Hidden for now
  }

  private loadHeatmapData() {
    this.loadingHeatmap = true;

    const params = {
      domain: this.currentFilter.domains.length === 1 ? this.currentFilter.domains[0] : undefined,
      from: this.currentFilter.fromDate?.toISOString(),
      to: this.currentFilter.toDate?.toISOString(),
    };

    this.apiService.getGeoHeatmap(params).subscribe({
      next: (data) => {
        this.heatmapData = data;
        this.totalLocations = data.length;

        // heatmap no longer drives global metrics to avoid denominator mismatch

        this.loadingHeatmap = false;
      },
      error: (error) => {
        console.error('Failed to load heatmap data:', error);
        this.loadingHeatmap = false;
      },
    });
  }

  private loadAuthSummary() {
    const params = {
      domain: this.currentFilter.domains.length === 1 ? this.currentFilter.domains[0] : undefined,
      from: this.currentFilter.fromDate?.toISOString(),
      to: this.currentFilter.toDate?.toISOString(),
    };
    this.apiService.authSummary(params).subscribe({
      next: (s) => {
        this.totalReports = s.total;
        this.dkimPass = s.dkimPass;
        this.spfPass = s.spfPass;
        this.globalPassRate = s.total > 0 ? Math.round((s.dmarcPass / s.total) * 100) : 0;
      },
      error: (e) => console.error('Failed to load auth summary', e),
    });
  }

  private loadCharts() {
    const params = {
      domain: this.currentFilter.domains.length === 1 ? this.currentFilter.domains[0] : undefined,
      from: this.currentFilter.fromDate?.toISOString(),
      to: this.currentFilter.toDate?.toISOString(),
      interval: 'day' as const,
    };

    this.apiService.timeseries(params).subscribe({
      next: (rows) => {
        this.volumeChartOptions = {
          tooltip: { trigger: 'axis' },
          xAxis: { type: 'time' },
          yAxis: { type: 'value' },
          grid: { left: 12, right: 12, bottom: 12, top: 24, containLabel: true },
          series: [
            {
              type: 'line',
              symbol: 'circle',
              symbolSize: 6,
              smooth: false,
              areaStyle: { opacity: 0.08 },
              lineStyle: { width: 2 },
              data: rows.map((pt) => [pt.date, pt.count]),
            },
          ],
        } as any;
      },
      error: (e) => console.error('Failed to load volume timeseries', e),
    });

    this.apiService.dispositionTimeseries(params).subscribe({
      next: (rows) => {
        this.dispositionChartOptions = {
          tooltip: { trigger: 'axis' },
          legend: {
            data: ['none', 'quarantine', 'reject'],
            top: 0,
            left: 'center',
          },
          xAxis: { type: 'time' },
          yAxis: { type: 'value' },
          grid: { left: 12, right: 12, bottom: 12, top: 40, containLabel: true },
          series: [
            {
              name: 'none',
              type: 'line',
              stack: 'total',
              areaStyle: {},
              smooth: false,
              data: rows.map((d) => [d.date, d.none]),
            },
            {
              name: 'quarantine',
              type: 'line',
              stack: 'total',
              areaStyle: {},
              smooth: false,
              data: rows.map((d) => [d.date, d.quarantine]),
            },
            {
              name: 'reject',
              type: 'line',
              stack: 'total',
              areaStyle: {},
              smooth: false,
              data: rows.map((d) => [d.date, d.reject]),
            },
          ],
        } as any;
      },
      error: (e) => console.error('Failed to load disposition timeseries', e),
    });
  }

  private loadCountriesData() {
    this.loadingCountries = true;

    const params = {
      domain: this.currentFilter.domains.length === 1 ? this.currentFilter.domains[0] : undefined,
      from: this.currentFilter.fromDate?.toISOString(),
      to: this.currentFilter.toDate?.toISOString(),
      page: this.countriesPage,
      pageSize: this.countriesPageSize,
    };

    this.apiService.getTopCountries(params).subscribe({
      next: (response: any) => {
        // Check if response is paginated or just an array
        if (Array.isArray(response)) {
          // Legacy response format - just an array
          this.topCountries = response;
          this.totalCountriesCount = response.length;
        } else {
          // Paginated response format
          this.topCountries = response.data || [];
          this.totalCountriesCount = response.total || 0;
        }
        this.totalCountries = Math.min(this.totalCountriesCount, 50); // For the summary card
        this.loadingCountries = false;
      },
      error: (error) => {
        console.error('Failed to load countries data:', error);
        this.loadingCountries = false;
      },
    });
  }

  private loadHeaderFromData() {
    this.loadingHeaderFrom = true;

    const params = {
      domain: this.currentFilter.domains.length === 1 ? this.currentFilter.domains[0] : undefined,
      from: this.currentFilter.fromDate?.toISOString(),
      to: this.currentFilter.toDate?.toISOString(),
      page: this.headerFromPage,
      pageSize: this.headerFromPageSize,
    };

    this.apiService.getTopHeaderFrom(params).subscribe({
      next: (response) => {
        this.headerFromRows = response.data || [];
        this.headerFromTotal = response.total || 0;
        this.loadingHeaderFrom = false;
      },
      error: (error) => {
        console.error('Failed to load header-from data:', error);
        this.loadingHeaderFrom = false;
      },
    });
  }

  getPassRate(country: CountryData): number {
    return country.count > 0 ? Math.round((country.dmarcPassCount / country.count) * 100) : 0;
  }

  getDkimPassRate(country: CountryData): number {
    return country.count > 0 ? Math.round((country.dkimPassCount / country.count) * 100) : 0;
  }

  getSpfPassRate(country: CountryData): number {
    return country.count > 0 ? Math.round((country.spfPassCount / country.count) * 100) : 0;
  }

  getProgressColor(country: CountryData): 'primary' | 'accent' | 'warn' {
    const passRate = this.getPassRate(country);
    if (passRate >= 80) return 'primary';
    if (passRate >= 50) return 'accent';
    return 'warn';
  }

  getHeaderFromDmarcPassRate(row: HeaderFromRow): number {
    return row.count > 0 ? Math.round((row.dmarcPassCount / row.count) * 100) : 0;
  }

  getHeaderFromDkimPassRate(row: HeaderFromRow): number {
    return row.count > 0 ? Math.round((row.dkimPassCount / row.count) * 100) : 0;
  }

  getHeaderFromSpfPassRate(row: HeaderFromRow): number {
    return row.count > 0 ? Math.round((row.spfPassCount / row.count) * 100) : 0;
  }

  getHeaderFromProgressColor(row: HeaderFromRow): 'primary' | 'accent' | 'warn' {
    const passRate = this.getHeaderFromDmarcPassRate(row);
    if (passRate >= 80) return 'primary';
    if (passRate >= 50) return 'accent';
    return 'warn';
  }

  private loadDnsIssues() {
    this.loadingDnsIssues = true;

    const params = {
      domain: this.currentFilter.domains.length === 1 ? this.currentFilter.domains[0] : undefined,
      limit: 10,
    };

    this.apiService.getDomainsWithDnsIssues(params).subscribe({
      next: (data) => {
        this.domainsWithDnsIssues = data;
        this.loadingDnsIssues = false;
      },
      error: (error) => {
        console.error('Failed to load DNS validation issues:', error);
        this.loadingDnsIssues = false;
      },
    });
  }

  getDnsSeverityIcon(severity: string): string {
    switch (severity) {
      case 'critical':
        return 'critical-severity';
      case 'warning':
        return 'warning-severity';
      case 'good':
        return 'good-severity';
      default:
        return 'warning-severity';
    }
  }

  getDnsSeverityIconName(severity: string): string {
    switch (severity) {
      case 'critical':
        return 'error';
      case 'warning':
        return 'warning';
      case 'good':
        return 'check_circle';
      default:
        return 'help';
    }
  }
}
