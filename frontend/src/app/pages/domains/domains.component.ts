import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MaterialModule } from '../../shared/material.module';
import { ApiService, DomainStatistics, CreateDomainDto, UpdateDomainDto } from '../../services/api.service';
import { MatDialog } from '@angular/material/dialog';
import {
  DomainDialogComponent,
  DomainDialogData,
  DomainDialogResult,
} from '../../components/domain-dialog/domain-dialog.component';
import { DomainCardComponent } from '../../components/domain-card/domain-card.component';
import { MatSnackBar } from '@angular/material/snack-bar';

@Component({
  selector: 'app-domains',
  standalone: true,
  imports: [CommonModule, FormsModule, MaterialModule, DomainCardComponent],
  templateUrl: './domains.component.html',
  styleUrls: ['./domains.component.scss'],
})
export class DomainsComponent implements OnInit {
  daysBack = 30;
  loading = signal(false);
  statistics = signal<DomainStatistics[]>([]);

  // Computed lists
  get managedDomains(): DomainStatistics[] {
    return this.statistics().filter((s) => s.isManaged);
  }

  get unknownDomains(): DomainStatistics[] {
    return this.statistics().filter((s) => !s.isManaged);
  }

  constructor(
    private api: ApiService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.loadStatistics();
  }

  loadStatistics(): void {
    this.loading.set(true);
    this.api.getDomainStatistics(this.daysBack).subscribe({
      next: (data) => {
        this.statistics.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error loading domain statistics:', err);
        this.snackBar.open('Error loading domain statistics', 'Close', { duration: 3000 });
        this.loading.set(false);
      },
    });
  }

  onDaysBackChange(): void {
    this.loadStatistics();
  }

  openAddDomainDialog(): void {
    const dialogRef = this.dialog.open(DomainDialogComponent, {
      width: '500px',
      data: { mode: 'add' } as DomainDialogData,
    });

    dialogRef.afterClosed().subscribe((result: DomainDialogResult | undefined) => {
      if (result) {
        this.api.createDomain(result as CreateDomainDto).subscribe({
          next: () => {
            this.snackBar.open('Domain added successfully', 'Close', { duration: 3000 });
            this.loadStatistics();
          },
          error: (err) => {
            console.error('Error adding domain:', err);
            const message = err.error?.message || 'Error adding domain';
            this.snackBar.open(message, 'Close', { duration: 5000 });
          },
        });
      }
    });
  }

  addUnknownDomain(domain: string): void {
    this.api.createDomain({ domain }).subscribe({
      next: () => {
        this.snackBar.open('Domain added to managed list', 'Close', { duration: 3000 });
        this.loadStatistics();
      },
      error: (err) => {
        console.error('Error adding domain:', err);
        const message = err.error?.message || 'Error adding domain';
        this.snackBar.open(message, 'Close', { duration: 5000 });
      },
    });
  }

  editDomain(stat: DomainStatistics): void {
    if (!stat.id) {
      this.snackBar.open('Domain ID not available', 'Close', { duration: 3000 });
      return;
    }

    const dialogRef = this.dialog.open(DomainDialogComponent, {
      width: '500px',
      data: {
        mode: 'edit',
        domain: stat.domain,
        notes: stat.notes,
      } as DomainDialogData,
    });

    dialogRef.afterClosed().subscribe((result: DomainDialogResult | undefined) => {
      if (result) {
        this.api.updateDomain(stat.id!, result as UpdateDomainDto).subscribe({
          next: () => {
            this.snackBar.open('Domain updated successfully', 'Close', { duration: 3000 });
            this.loadStatistics();
          },
          error: (err) => {
            console.error('Error updating domain:', err);
            this.snackBar.open('Error updating domain', 'Close', { duration: 3000 });
          },
        });
      }
    });
  }

  removeDomain(stat: DomainStatistics): void {
    if (!stat.id) {
      this.snackBar.open('Domain ID not available', 'Close', { duration: 3000 });
      return;
    }

    if (!confirm(`Are you sure you want to remove ${stat.domain} from your managed domains?`)) {
      return;
    }

    this.api.deleteDomain(stat.id).subscribe({
      next: () => {
        this.snackBar.open('Domain removed successfully', 'Close', { duration: 3000 });
        this.loadStatistics();
      },
      error: (err) => {
        console.error('Error removing domain:', err);
        this.snackBar.open('Error removing domain', 'Close', { duration: 3000 });
      },
    });
  }
}
