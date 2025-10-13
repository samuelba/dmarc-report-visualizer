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
  templateUrl: './enhanced-top-ips.component.html',
  styleUrls: ['./enhanced-top-ips.component.scss'],
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
    if (percentage >= 80) {
      return 'primary';
    }
    if (percentage >= 50) {
      return 'accent';
    }
    return 'warn';
  }
}
