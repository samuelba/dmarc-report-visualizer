import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
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
    RouterLink,
    MaterialModule,
    MatPaginatorModule,
    DashboardFilterComponent,
    WorldMapComponent,
    EnhancedTopIpsComponent,
    NgxEchartsModule,
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent implements OnInit {
  private readonly regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

  currentFilter: FilterParams = { domains: [] };
  heatmapData: HeatmapPoint[] = [];
  topCountries: CountryData[] = [];

  headerFromRows: HeaderFromRow[] = [];
  managedDomains: string[] = [];

  // Summary metrics
  totalCountries = 0;
  totalLocations = 0;
  globalPassRate = 0;
  globalDkimPassRate = 0;
  globalSpfPassRate = 0;
  totalReports = 0;
  dkimPass = 0;
  spfPass = 0;

  // Loading states
  loadingHeatmap = false;
  loadingCountries = false;
  loadingHeaderFrom = false;
  loadingAuthBreakdown = false;

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
  authPassRateChartOptions: any;
  emailVolumeChartOptions: any;
  dkimPieChartOptions: any;
  spfPieChartOptions: any;

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
    // Load managed domains list
    this.loadManagedDomains();
    // Don't load data here - wait for the filter component to emit its initial filterChange event
    // This prevents a race condition where we load data twice (once with no filter, once with the default 30d filter)
  }

  loadManagedDomains() {
    this.apiService.getDomainsList().subscribe({
      next: (domains) => {
        this.managedDomains = domains.map((d) => d.domain.toLowerCase());
      },
      error: (err) => {
        console.error('Error loading managed domains:', err);
      },
    });
  }

  isDomainManaged(domain: string): boolean {
    return this.managedDomains.includes(domain.toLowerCase());
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
  }

  // Format date for API without timezone issues
  private formatDateForApi(date?: Date): string | undefined {
    if (!date) {
      return undefined;
    }
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private loadHeatmapData() {
    this.loadingHeatmap = true;

    const params = {
      domain: this.currentFilter.domains.length === 1 ? this.currentFilter.domains[0] : undefined,
      from: this.formatDateForApi(this.currentFilter.fromDate),
      to: this.formatDateForApi(this.currentFilter.toDate),
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
      from: this.formatDateForApi(this.currentFilter.fromDate),
      to: this.formatDateForApi(this.currentFilter.toDate),
    };
    this.apiService.authSummary(params).subscribe({
      next: (s) => {
        this.totalReports = s.total;
        this.dkimPass = s.dkimPass;
        this.spfPass = s.spfPass;
        this.globalPassRate = s.total > 0 ? Math.round((s.dmarcPass / s.total) * 1000) / 10 : 0;
        this.globalDkimPassRate = s.total > 0 ? Math.round((s.dkimPass / s.total) * 1000) / 10 : 0;
        this.globalSpfPassRate = s.total > 0 ? Math.round((s.spfPass / s.total) * 1000) / 10 : 0;
      },
      error: (e) => console.error('Failed to load auth summary', e),
    });

    // Load auth breakdown for pie charts
    this.apiService.authBreakdown(params).subscribe({
      next: (data) => {
        // DKIM Pie Chart with Pass, Fail, and Missing
        this.dkimPieChartOptions = {
          animation: false,
          tooltip: {
            trigger: 'item',
            formatter: '{b}: {c} ({d}%)',
          },
          series: [
            {
              name: 'DKIM',
              type: 'pie',
              radius: ['50%', '100%'],
              center: ['50%', '55%'],
              startAngle: 220,
              endAngle: -40,
              animation: false,
              data: [
                { value: data.dkim.pass, name: 'Pass', itemStyle: { color: '#4caf50' } },
                { value: data.dkim.fail, name: 'Fail', itemStyle: { color: '#f44336' } },
                { value: data.dkim.missing, name: 'Missing', itemStyle: { color: '#9e9e9e' } },
              ],
              label: {
                show: false,
                position: 'center',
              },
              labelLine: {
                show: false,
              },
            },
          ],
        };

        // SPF Pie Chart
        this.spfPieChartOptions = {
          animation: false,
          tooltip: {
            trigger: 'item',
            formatter: '{b}: {c} ({d}%)',
          },
          series: [
            {
              name: 'SPF',
              type: 'pie',
              radius: ['50%', '100%'],
              center: ['50%', '55%'],
              startAngle: 220,
              endAngle: -40,
              animation: false,
              data: [
                { value: data.spf.pass, name: 'Pass', itemStyle: { color: '#4caf50' } },
                { value: data.spf.fail, name: 'Fail', itemStyle: { color: '#f44336' } },
              ],
              label: {
                show: false,
                position: 'center',
              },
              labelLine: {
                show: false,
              },
            },
          ],
        };
      },
      error: (e) => console.error('Failed to load auth breakdown', e),
    });
  }

  private loadCharts() {
    const params = {
      domain: this.currentFilter.domains.length === 1 ? this.currentFilter.domains[0] : undefined,
      from: this.formatDateForApi(this.currentFilter.fromDate),
      to: this.formatDateForApi(this.currentFilter.toDate),
      interval: 'day' as const,
    };

    // Load auth pass rate timeseries for DKIM/SPF chart at the top
    this.apiService.authPassRateTimeseries(params).subscribe({
      next: (rows) => {
        this.authPassRateChartOptions = {
          tooltip: {
            trigger: 'axis',
            formatter: (params: any) => {
              const data = params[0];
              const date = new Date(data.value[0]).toLocaleDateString();
              let tooltip = `<strong>${date}</strong><br/>`;
              params.forEach((param: any) => {
                tooltip += `${param.marker} ${param.seriesName}: ${param.value[1].toFixed(1)}%<br/>`;
              });
              return tooltip;
            },
          },
          legend: {
            data: ['DKIM Pass Rate', 'SPF Pass Rate'],
            top: 0,
            left: 'center',
          },
          xAxis: { type: 'time' },
          yAxis: {
            type: 'value',
            min: 0,
            max: 100,
            axisLabel: {
              formatter: '{value}%',
            },
          },
          grid: { left: 50, right: 20, bottom: 30, top: 50 },
          series: [
            {
              name: 'DKIM Pass Rate',
              type: 'line',
              symbol: 'circle',
              symbolSize: 6,
              smooth: false,
              data: rows.map((pt) => [pt.date, pt.dkimPassRate]),
            },
            {
              name: 'SPF Pass Rate',
              type: 'line',
              symbol: 'circle',
              symbolSize: 6,
              smooth: false,
              data: rows.map((pt) => [pt.date, pt.spfPassRate]),
            },
          ],
        } as any;
      },
      error: (e) => console.error('Failed to load auth pass rate timeseries', e),
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
          grid: { left: 50, right: 20, bottom: 30, top: 50 },
          series: [
            {
              name: 'none',
              type: 'line',
              symbol: 'circle',
              stack: 'total',
              areaStyle: {},
              smooth: false,
              data: rows.map((d) => [d.date, d.none]),
            },
            {
              name: 'quarantine',
              type: 'line',
              symbol: 'circle',
              stack: 'total',
              areaStyle: {},
              smooth: false,
              data: rows.map((d) => [d.date, d.quarantine]),
            },
            {
              name: 'reject',
              type: 'line',
              symbol: 'circle',
              stack: 'total',
              color: '#ff9800',
              areaStyle: {},
              smooth: false,
              data: rows.map((d) => [d.date, d.reject]),
            },
          ],
        } as any;
      },
      error: (e) => console.error('Failed to load disposition timeseries', e),
    });

    // Load email volume timeseries for the chart at the bottom
    this.apiService.timeseries(params).subscribe({
      next: (rows) => {
        this.volumeChartOptions = {
          tooltip: { trigger: 'axis' },
          xAxis: { type: 'time' },
          yAxis: { type: 'value' },
          grid: { left: 50, right: 20, bottom: 30, top: 30 },
          series: [
            {
              type: 'line',
              symbol: 'circle',
              areaStyle: {},
              smooth: false,
              data: rows.map((pt) => [pt.date, pt.count]),
            },
          ],
        } as any;
      },
      error: (e) => console.error('Failed to load volume timeseries', e),
    });
  }

  private loadCountriesData() {
    this.loadingCountries = true;

    const params = {
      domain: this.currentFilter.domains.length === 1 ? this.currentFilter.domains[0] : undefined,
      from: this.formatDateForApi(this.currentFilter.fromDate),
      to: this.formatDateForApi(this.currentFilter.toDate),
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
      from: this.formatDateForApi(this.currentFilter.fromDate),
      to: this.formatDateForApi(this.currentFilter.toDate),
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
    return country.count > 0 ? Math.round((country.dmarcPassCount / country.count) * 1000) / 10 : 0;
  }

  getDkimPassRate(country: CountryData): number {
    return country.count > 0 ? Math.round((country.dkimPassCount / country.count) * 1000) / 10 : 0;
  }

  getSpfPassRate(country: CountryData): number {
    return country.count > 0 ? Math.round((country.spfPassCount / country.count) * 1000) / 10 : 0;
  }

  getProgressColor(country: CountryData): 'primary' | 'accent' | 'warn' {
    const passRate = this.getPassRate(country);
    if (passRate >= 80) {
      return 'primary';
    }
    if (passRate >= 50) {
      return 'accent';
    }
    return 'warn';
  }

  getHeaderFromDmarcPassRate(row: HeaderFromRow): number {
    return row.count > 0 ? Math.round((row.dmarcPassCount / row.count) * 1000) / 10 : 0;
  }

  getHeaderFromDkimPassRate(row: HeaderFromRow): number {
    return row.count > 0 ? Math.round((row.dkimPassCount / row.count) * 1000) / 10 : 0;
  }

  getHeaderFromSpfPassRate(row: HeaderFromRow): number {
    return row.count > 0 ? Math.round((row.spfPassCount / row.count) * 1000) / 10 : 0;
  }

  getHeaderFromProgressColor(row: HeaderFromRow): 'primary' | 'accent' | 'warn' {
    const passRate = this.getHeaderFromDmarcPassRate(row);
    if (passRate >= 80) {
      return 'primary';
    }
    if (passRate >= 50) {
      return 'accent';
    }
    return 'warn';
  }
}
