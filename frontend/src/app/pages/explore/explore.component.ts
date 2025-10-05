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
import { XmlViewerDialogComponent } from '../../components/xml-viewer-dialog/xml-viewer-dialog.component';

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
  ],
  template: `
    <main class="explore">
      <section class="filters">
        <mat-form-field appearance="outline">
          <mat-label>Domain</mat-label>
          <mat-select [(ngModel)]="filters.domain" multiple (selectionChange)="onFilterChange()">
            <mat-option *ngFor="let v of domains()" [value]="v">{{ v }}</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Disposition</mat-label>
          <mat-select [(ngModel)]="filters.disposition" multiple (selectionChange)="onFilterChange()">
            <mat-option value="none">none</mat-option>
            <mat-option value="quarantine">quarantine</mat-option>
            <mat-option value="reject">reject</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>DKIM</mat-label>
          <mat-select [(ngModel)]="filters.dkim" multiple (selectionChange)="onFilterChange()">
            <mat-option value="pass">pass</mat-option>
            <mat-option value="fail">fail</mat-option>
            <mat-option value="missing">missing</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>SPF</mat-label>
          <mat-select [(ngModel)]="filters.spf" multiple (selectionChange)="onFilterChange()">
            <mat-option value="pass">pass</mat-option>
            <mat-option value="fail">fail</mat-option>
            <mat-option value="missing">missing</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Source IP</mat-label>
          <mat-select [(ngModel)]="filters.sourceIp" multiple (selectionChange)="onFilterChange()">
            <mat-option *ngFor="let v of ips()" [value]="v">{{ v }}</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Header From</mat-label>
          <mat-select [(ngModel)]="filters.headerFrom" multiple (selectionChange)="onFilterChange()">
            <mat-option *ngFor="let v of headerFroms()" [value]="v">{{ v }}</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Envelope From</mat-label>
          <mat-select [(ngModel)]="filters.envelopeFrom" multiple (selectionChange)="onFilterChange()">
            <mat-option *ngFor="let v of envelopeFroms()" [value]="v">{{ v }}</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Envelope To</mat-label>
          <mat-select [(ngModel)]="filters.envelopeTo" multiple (selectionChange)="onFilterChange()">
            <mat-option *ngFor="let v of envelopeTos()" [value]="v">{{ v }}</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>DKIM Domain</mat-label>
          <mat-select [(ngModel)]="filters.dkimDomain" multiple (selectionChange)="onFilterChange()">
            <mat-option *ngFor="let v of dkimDomains()" [value]="v">{{ v }}</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>SPF Domain</mat-label>
          <mat-select [(ngModel)]="filters.spfDomain" multiple (selectionChange)="onFilterChange()">
            <mat-option *ngFor="let v of spfDomains()" [value]="v">{{ v }}</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Country</mat-label>
          <mat-select [(ngModel)]="filters.country" multiple (selectionChange)="onFilterChange()">
            <mat-option *ngFor="let v of sortedCountries()" [value]="v">{{ getCountryName(v) }}</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Time Period</mat-label>
          <input
            matInput
            [(ngModel)]="timePeriodInput"
            (input)="onTimePeriodInputChange()"
            placeholder="e.g. 30, 7d, 4m, 5y, or 'all'"
          />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>From</mat-label>
          <input matInput [matDatepicker]="fromPicker" [(ngModel)]="filters.from" (dateChange)="onFilterChange()" />
          <mat-datepicker-toggle matSuffix [for]="fromPicker"></mat-datepicker-toggle>
          <mat-datepicker #fromPicker></mat-datepicker>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>To</mat-label>
          <input matInput [matDatepicker]="toPicker" [(ngModel)]="filters.to" (dateChange)="onFilterChange()" />
          <mat-datepicker-toggle matSuffix [for]="toPicker"></mat-datepicker-toggle>
          <mat-datepicker #toPicker></mat-datepicker>
        </mat-form-field>
        <mat-form-field appearance="outline" class="contains-filter">
          <mat-label>Contains (search all columns)</mat-label>
          <input matInput [(ngModel)]="filters.contains" (input)="onFilterChange()" placeholder="Search..." />
          <mat-icon matSuffix>search</mat-icon>
        </mat-form-field>
        <div class="actions">
          <button mat-raised-button color="primary" (click)="apply()">Apply</button>
          <button mat-button (click)="clear()">Clear</button>
        </div>
      </section>

      <section>
        <table
          mat-table
          [dataSource]="rows()"
          [multiTemplateDataRows]="true"
          matSort
          (matSortChange)="onSort($event)"
          class="mat-elevation-z1"
        >
          <ng-container matColumnDef="expand">
            <th mat-header-cell *matHeaderCellDef></th>
            <td mat-cell *matCellDef="let r">
              <button mat-icon-button (click)="toggleExpand(r)">
                <mat-icon>{{ expandedRow === r ? 'expand_less' : 'expand_more' }}</mat-icon>
              </button>
            </td>
          </ng-container>
          <ng-container matColumnDef="date">
            <th mat-header-cell *matHeaderCellDef mat-sort-header="date">Date</th>
            <td mat-cell *matCellDef="let r">{{ r.report?.beginDate | date: 'short' }}</td>
          </ng-container>
          <ng-container matColumnDef="org">
            <th mat-header-cell *matHeaderCellDef mat-sort-header="orgName">Reporting Org</th>
            <td mat-cell *matCellDef="let r">{{ r.report?.orgName || 'N/A' }}</td>
          </ng-container>
          <ng-container matColumnDef="ip">
            <th mat-header-cell *matHeaderCellDef mat-sort-header="ip">IP</th>
            <td mat-cell *matCellDef="let r">{{ r.sourceIp }}</td>
          </ng-container>
          <ng-container matColumnDef="count">
            <th mat-header-cell *matHeaderCellDef mat-sort-header="count">Count</th>
            <td mat-cell *matCellDef="let r">{{ r.count }}</td>
          </ng-container>
          <ng-container matColumnDef="disp">
            <th mat-header-cell *matHeaderCellDef mat-sort-header="disposition">Disposition</th>
            <td mat-cell *matCellDef="let r">
              <span [class]="getDispositionClass(r.disposition)">
                {{ getDispositionIcon(r.disposition) }} {{ r.disposition }}
              </span>
            </td>
          </ng-container>
          <ng-container matColumnDef="dkim">
            <th mat-header-cell *matHeaderCellDef mat-sort-header="dkim">DKIM</th>
            <td mat-cell *matCellDef="let r">
              <span [class]="getDkimAuthClass(r)"> {{ getDkimAuthIcon(r) }} {{ getDkimAuthLabel(r) }} </span>
            </td>
          </ng-container>
          <ng-container matColumnDef="spf">
            <th mat-header-cell *matHeaderCellDef mat-sort-header="spf">SPF</th>
            <td mat-cell *matCellDef="let r">
              <span [class]="getSpfAuthClass(r)"> {{ getSpfAuthIcon(r) }} {{ getSpfAuthLabel(r) }} </span>
            </td>
          </ng-container>
          <ng-container matColumnDef="country">
            <th mat-header-cell *matHeaderCellDef mat-sort-header="country">Country</th>
            <td mat-cell *matCellDef="let r">{{ getCountryName(r.geoCountry) }}</td>
          </ng-container>
          <ng-container matColumnDef="from">
            <th mat-header-cell *matHeaderCellDef mat-sort-header="headerFrom">Header From</th>
            <td mat-cell *matCellDef="let r">{{ r.headerFrom }}</td>
          </ng-container>
          <ng-container matColumnDef="envelopeTo">
            <th mat-header-cell *matHeaderCellDef mat-sort-header="envelopeTo">Envelope To</th>
            <td mat-cell *matCellDef="let r">{{ r.envelopeTo }}</td>
          </ng-container>
          <ng-container matColumnDef="auth">
            <th mat-header-cell *matHeaderCellDef>Auth Results</th>
            <td mat-cell *matCellDef="let r">
              <div class="auth">
                <div class="dkim" *ngIf="r.dkimResults?.length">
                  <strong>DKIM:</strong> <span [innerHTML]="formatDkimResultsColored(r)"></span>
                </div>
                <div class="spf" *ngIf="r.spfResults?.length">
                  <strong>SPF:</strong> <span [innerHTML]="formatSpfResultsColored(r)"></span>
                </div>
                <div *ngIf="!r.dkimResults?.length && !r.spfResults?.length" class="auth-missing">
                  ⚪ No auth results
                </div>
              </div>
            </td>
          </ng-container>
          <ng-container matColumnDef="actions">
            <th mat-header-cell *matHeaderCellDef>Actions</th>
            <td mat-cell *matCellDef="let r">
              <button mat-button color="primary" (click)="viewXml(r)">View XML</button>
            </td>
          </ng-container>

          <ng-container matColumnDef="detail">
            <td mat-cell *matCellDef="let r" [attr.colspan]="displayed.length">
              <div *ngIf="expandedRow === r" class="detail-content">
                <div class="detail-section">
                  <h4>Identifiers</h4>
                  <div><strong>Envelope From:</strong> {{ r.envelopeFrom || 'N/A' }}</div>
                  <div><strong>Envelope To:</strong> {{ r.envelopeTo || 'N/A' }}</div>
                </div>

                <div class="detail-section" *ngIf="r.reasonType || r.reasonComment">
                  <h4>Policy Override</h4>
                  <div *ngIf="r.reasonType"><strong>Reason Type:</strong> {{ r.reasonType }}</div>
                  <div *ngIf="r.reasonComment"><strong>Reason Comment:</strong> {{ r.reasonComment }}</div>
                </div>

                <div class="detail-section" *ngIf="r.report?.policy">
                  <h4>Published Policy</h4>
                  <div class="policy-grid">
                    <div *ngIf="r.report.policy.p">
                      <strong>Policy:</strong>
                      <span [class]="getPolicyClass(r.report.policy.p)">{{ r.report.policy.p }}</span>
                    </div>
                    <div *ngIf="r.report.policy.sp">
                      <strong>Subdomain Policy:</strong>
                      <span [class]="getPolicyClass(r.report.policy.sp)">{{ r.report.policy.sp }}</span>
                    </div>
                    <div *ngIf="r.report.policy.adkim">
                      <strong>DKIM Alignment:</strong> {{ r.report.policy.adkim }}
                    </div>
                    <div *ngIf="r.report.policy.aspf"><strong>SPF Alignment:</strong> {{ r.report.policy.aspf }}</div>
                    <div *ngIf="r.report.policy.pct !== undefined">
                      <strong>Percentage:</strong> {{ r.report.policy.pct }}%
                    </div>
                    <div *ngIf="r.report.policy.fo"><strong>Failure Options:</strong> {{ r.report.policy.fo }}</div>
                  </div>
                </div>
              </div>
            </td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="displayed"></tr>
          <tr mat-row *matRowDef="let row; columns: displayed" class="element-row"></tr>
          <tr
            mat-row
            *matRowDef="let row; columns: ['detail']"
            class="detail-row"
            [class.expanded]="expandedRow === row"
          ></tr>
        </table>

        <mat-paginator
          [length]="total()"
          [pageSize]="pageSize()"
          [pageIndex]="page() - 1"
          [pageSizeOptions]="[10, 25, 50, 100]"
          showFirstLastButtons
          (page)="onPage($event)"
        ></mat-paginator>
      </section>
    </main>
  `,
  styles: [
    `
      .explore {
        display: block;
        padding: 16px;
      }
    `,
    `
      .filters {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(220px, max-content));
        gap: 12px;
        align-items: end;
        margin-bottom: 16px;
      }
    `,
    `
      .actions {
        display: flex;
        gap: 8px;
        white-space: nowrap;
        grid-column: 1/-1;
        justify-self: start;
        margin-top: 12px;
      }
    `,
    `
      .contains-filter {
        grid-column: 1/-1;
        max-width: 400px;
      }
    `,
    `
      .contains-filter .mat-mdc-form-field-flex {
        background-color: #f8f9fa;
        border-radius: 4px;
      }
    `,
    `
      table {
        width: 100%;
        margin: 16px 0;
      }
    `,
    `
      .auth {
        font-size: 12px;
        color: #fff;
      }
    `,
    `
      .detail-row {
        display: none;
      }
    `,
    `
      .detail-row.expanded {
        display: table-row;
      }
    `,
    `
      .detail-content {
        padding: 16px;
        background-color: #f5f5f5;
        border-top: 1px solid #ddd;
      }
    `,
    `
      .detail-section {
        margin-bottom: 16px;
      }
    `,
    `
      .detail-section h4 {
        margin: 0 0 8px 0;
        color: #333;
        font-size: 14px;
        font-weight: 600;
        border-bottom: 1px solid #ddd;
        padding-bottom: 4px;
      }
    `,
    `
      .detail-section:last-child {
        margin-bottom: 0;
      }
    `,
    `
      .policy-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 8px;
      }
    `,
    `
      .policy-reject {
        color: #d32f2f;
        font-weight: 600;
        background-color: #ffebee;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 12px;
      }
    `,
    `
      .policy-quarantine {
        color: #f57c00;
        font-weight: 600;
        background-color: #fff3e0;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 12px;
      }
    `,
    `
      .policy-none {
        color: #388e3c;
        font-weight: 500;
        background-color: #e8f5e8;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 12px;
      }
    `,
    `
      .policy-unknown {
        color: #757575;
        font-weight: 400;
        background-color: #f5f5f5;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 12px;
      }
    `,

    // Disposition styling
    `
      .disposition-reject {
        color: #d32f2f;
        font-weight: 600;
        background-color: #ffebee;
        padding: 2px 6px;
        border-radius: 12px;
        font-size: 12px;
      }
    `,
    `
      .disposition-quarantine {
        color: #f57c00;
        font-weight: 600;
        background-color: #fff3e0;
        padding: 2px 6px;
        border-radius: 12px;
        font-size: 12px;
      }
    `,
    `
      .disposition-none {
        color: #388e3c;
        font-weight: 500;
        background-color: #e8f5e8;
        padding: 2px 6px;
        border-radius: 12px;
        font-size: 12px;
      }
    `,
    `
      .disposition-missing {
        color: #757575;
        font-weight: 400;
        background-color: #f5f5f5;
        padding: 2px 6px;
        border-radius: 12px;
        font-size: 12px;
      }
    `,

    // Authentication styling
    `
      .auth-pass {
        color: #2e7d32;
        font-weight: 500;
        background-color: #e8f5e8;
        padding: 2px 6px;
        border-radius: 8px;
        font-size: 12px;
      }
    `,
    `
      .auth-fail {
        color: #c62828;
        font-weight: 600;
        background-color: #ffebee;
        padding: 2px 6px;
        border-radius: 8px;
        font-size: 12px;
      }
    `,
    `
      .auth-missing {
        color: #9e9e9e;
        font-weight: 400;
        background-color: #f5f5f5;
        padding: 2px 6px;
        border-radius: 8px;
        font-size: 12px;
        font-style: italic;
        border: 1px dashed #ccc;
      }
    `,
  ],
})
export class ExploreComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);

  readonly rows = signal<DmarcRecord[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly pageSize = signal(20);
  sort: { active?: string; direction?: 'asc' | 'desc' } = { active: 'date', direction: 'desc' };
  timePeriodInput: string = '30d';

  displayed = ['expand', 'date', 'org', 'ip', 'country', 'count', 'disp', 'dkim', 'spf', 'from', 'auth', 'actions'];

  filters: any = {
    domain: [] as string[],
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
  };

  readonly domains = signal<string[]>([]);
  readonly ips = signal<string[]>([]);
  readonly envelopeTos = signal<string[]>([]);
  readonly envelopeFroms = signal<string[]>([]);
  readonly headerFroms = signal<string[]>([]);
  readonly dkimDomains = signal<string[]>([]);
  readonly spfDomains = signal<string[]>([]);
  readonly countries = signal<string[]>([]);

  // Computed signal to return countries sorted alphabetically by their display names
  readonly sortedCountries = computed(() => {
    return this.countries().slice().sort((a, b) => {
      const nameA = this.getCountryName(a);
      const nameB = this.getCountryName(b);
      return nameA.localeCompare(nameB);
    });
  });

  // Country code to name mapping
  private countryNames: { [key: string]: string } = {
    AD: 'Andorra',
    AE: 'United Arab Emirates',
    AF: 'Afghanistan',
    AG: 'Antigua and Barbuda',
    AI: 'Anguilla',
    AL: 'Albania',
    AM: 'Armenia',
    AO: 'Angola',
    AQ: 'Antarctica',
    AR: 'Argentina',
    AS: 'American Samoa',
    AT: 'Austria',
    AU: 'Australia',
    AW: 'Aruba',
    AX: 'Åland Islands',
    AZ: 'Azerbaijan',
    BA: 'Bosnia and Herzegovina',
    BB: 'Barbados',
    BD: 'Bangladesh',
    BE: 'Belgium',
    BF: 'Burkina Faso',
    BG: 'Bulgaria',
    BH: 'Bahrain',
    BI: 'Burundi',
    BJ: 'Benin',
    BL: 'Saint Barthélemy',
    BM: 'Bermuda',
    BN: 'Brunei',
    BO: 'Bolivia',
    BQ: 'Caribbean Netherlands',
    BR: 'Brazil',
    BS: 'Bahamas',
    BT: 'Bhutan',
    BV: 'Bouvet Island',
    BW: 'Botswana',
    BY: 'Belarus',
    BZ: 'Belize',
    CA: 'Canada',
    CC: 'Cocos Islands',
    CD: 'DR Congo',
    CF: 'Central African Republic',
    CG: 'Republic of the Congo',
    CH: 'Switzerland',
    CI: "Côte d'Ivoire",
    CK: 'Cook Islands',
    CL: 'Chile',
    CM: 'Cameroon',
    CN: 'China',
    CO: 'Colombia',
    CR: 'Costa Rica',
    CU: 'Cuba',
    CV: 'Cape Verde',
    CW: 'Curaçao',
    CX: 'Christmas Island',
    CY: 'Cyprus',
    CZ: 'Czech Republic',
    DE: 'Germany',
    DJ: 'Djibouti',
    DK: 'Denmark',
    DM: 'Dominica',
    DO: 'Dominican Republic',
    DZ: 'Algeria',
    EC: 'Ecuador',
    EE: 'Estonia',
    EG: 'Egypt',
    EH: 'Western Sahara',
    ER: 'Eritrea',
    ES: 'Spain',
    ET: 'Ethiopia',
    FI: 'Finland',
    FJ: 'Fiji',
    FK: 'Falkland Islands',
    FM: 'Micronesia',
    FO: 'Faroe Islands',
    FR: 'France',
    GA: 'Gabon',
    GB: 'United Kingdom',
    GD: 'Grenada',
    GE: 'Georgia',
    GF: 'French Guiana',
    GG: 'Guernsey',
    GH: 'Ghana',
    GI: 'Gibraltar',
    GL: 'Greenland',
    GM: 'Gambia',
    GN: 'Guinea',
    GP: 'Guadeloupe',
    GQ: 'Equatorial Guinea',
    GR: 'Greece',
    GS: 'South Georgia',
    GT: 'Guatemala',
    GU: 'Guam',
    GW: 'Guinea-Bissau',
    GY: 'Guyana',
    HK: 'Hong Kong',
    HM: 'Heard Island',
    HN: 'Honduras',
    HR: 'Croatia',
    HT: 'Haiti',
    HU: 'Hungary',
    ID: 'Indonesia',
    IE: 'Ireland',
    IL: 'Israel',
    IM: 'Isle of Man',
    IN: 'India',
    IO: 'British Indian Ocean Territory',
    IQ: 'Iraq',
    IR: 'Iran',
    IS: 'Iceland',
    IT: 'Italy',
    JE: 'Jersey',
    JM: 'Jamaica',
    JO: 'Jordan',
    JP: 'Japan',
    KE: 'Kenya',
    KG: 'Kyrgyzstan',
    KH: 'Cambodia',
    KI: 'Kiribati',
    KM: 'Comoros',
    KN: 'Saint Kitts and Nevis',
    KP: 'North Korea',
    KR: 'South Korea',
    KW: 'Kuwait',
    KY: 'Cayman Islands',
    KZ: 'Kazakhstan',
    LA: 'Laos',
    LB: 'Lebanon',
    LC: 'Saint Lucia',
    LI: 'Liechtenstein',
    LK: 'Sri Lanka',
    LR: 'Liberia',
    LS: 'Lesotho',
    LT: 'Lithuania',
    LU: 'Luxembourg',
    LV: 'Latvia',
    LY: 'Libya',
    MA: 'Morocco',
    MC: 'Monaco',
    MD: 'Moldova',
    ME: 'Montenegro',
    MF: 'Saint Martin',
    MG: 'Madagascar',
    MH: 'Marshall Islands',
    MK: 'North Macedonia',
    ML: 'Mali',
    MM: 'Myanmar',
    MN: 'Mongolia',
    MO: 'Macao',
    MP: 'Northern Mariana Islands',
    MQ: 'Martinique',
    MR: 'Mauritania',
    MS: 'Montserrat',
    MT: 'Malta',
    MU: 'Mauritius',
    MV: 'Maldives',
    MW: 'Malawi',
    MX: 'Mexico',
    MY: 'Malaysia',
    MZ: 'Mozambique',
    NA: 'Namibia',
    NC: 'New Caledonia',
    NE: 'Niger',
    NF: 'Norfolk Island',
    NG: 'Nigeria',
    NI: 'Nicaragua',
    NL: 'Netherlands',
    NO: 'Norway',
    NP: 'Nepal',
    NR: 'Nauru',
    NU: 'Niue',
    NZ: 'New Zealand',
    OM: 'Oman',
    PA: 'Panama',
    PE: 'Peru',
    PF: 'French Polynesia',
    PG: 'Papua New Guinea',
    PH: 'Philippines',
    PK: 'Pakistan',
    PL: 'Poland',
    PM: 'Saint Pierre and Miquelon',
    PN: 'Pitcairn Islands',
    PR: 'Puerto Rico',
    PS: 'Palestine',
    PT: 'Portugal',
    PW: 'Palau',
    PY: 'Paraguay',
    QA: 'Qatar',
    RE: 'Réunion',
    RO: 'Romania',
    RS: 'Serbia',
    RU: 'Russia',
    RW: 'Rwanda',
    SA: 'Saudi Arabia',
    SB: 'Solomon Islands',
    SC: 'Seychelles',
    SD: 'Sudan',
    SE: 'Sweden',
    SG: 'Singapore',
    SH: 'Saint Helena',
    SI: 'Slovenia',
    SJ: 'Svalbard and Jan Mayen',
    SK: 'Slovakia',
    SL: 'Sierra Leone',
    SM: 'San Marino',
    SN: 'Senegal',
    SO: 'Somalia',
    SR: 'Suriname',
    SS: 'South Sudan',
    ST: 'São Tomé and Príncipe',
    SV: 'El Salvador',
    SX: 'Sint Maarten',
    SY: 'Syria',
    SZ: 'Eswatini',
    TC: 'Turks and Caicos Islands',
    TD: 'Chad',
    TF: 'French Southern Territories',
    TG: 'Togo',
    TH: 'Thailand',
    TJ: 'Tajikistan',
    TK: 'Tokelau',
    TL: 'East Timor',
    TM: 'Turkmenistan',
    TN: 'Tunisia',
    TO: 'Tonga',
    TR: 'Turkey',
    TT: 'Trinidad and Tobago',
    TV: 'Tuvalu',
    TW: 'Taiwan',
    TZ: 'Tanzania',
    UA: 'Ukraine',
    UG: 'Uganda',
    UM: 'U.S. Minor Outlying Islands',
    US: 'United States',
    UY: 'Uruguay',
    UZ: 'Uzbekistan',
    VA: 'Vatican City',
    VC: 'Saint Vincent and the Grenadines',
    VE: 'Venezuela',
    VG: 'British Virgin Islands',
    VI: 'U.S. Virgin Islands',
    VN: 'Vietnam',
    VU: 'Vanuatu',
    WF: 'Wallis and Futuna',
    WS: 'Samoa',
    YE: 'Yemen',
    YT: 'Mayotte',
    ZA: 'South Africa',
    ZM: 'Zambia',
    ZW: 'Zimbabwe',
  };

  ngOnInit(): void {
    this.loadFiltersFromUrl();
    // Apply default 30d time period if no date filters in URL
    const params = this.route.snapshot.queryParams;
    if (!params['from'] && !params['to']) {
      this.applyTimePeriodToFilter();
    }

    // Load distincts (date-scoped for domain + headerFrom)
    this.loadDistincts();

    this.search();
  }

  private getFromToIso(): { from?: string; to?: string } {
    const fromIso = this.filters.from ? new Date(this.filters.from).toISOString() : undefined;
    const toIso = this.filters.to ? new Date(this.filters.to).toISOString() : undefined;
    return { from: fromIso, to: toIso };
  }

  private loadDateScopedDistincts() {
    const { from, to } = this.getFromToIso();
    this.api.getRecordDistinct('domain', { from, to }).subscribe((v) => this.domains.set(v));
    this.api.getRecordDistinct('headerFrom', { from, to }).subscribe((v) => this.headerFroms.set(v));
  }

  private loadDistincts() {
    // Date-scoped lists
    this.loadDateScopedDistincts();

    // Other lists unchanged
    this.api.getRecordDistinct('sourceIp').subscribe((v) => this.ips.set(v));
    this.api.getRecordDistinct('envelopeTo').subscribe((v) => this.envelopeTos.set(v));
    this.api.getRecordDistinct('envelopeFrom').subscribe((v) => this.envelopeFroms.set(v));
    this.api.getRecordDistinct('dkimDomain').subscribe((v) => this.dkimDomains.set(v));
    this.api.getRecordDistinct('spfDomain').subscribe((v) => this.spfDomains.set(v));
    this.api.getRecordDistinct('country').subscribe((v) => this.countries.set(v));
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
    };
    this.timePeriodInput = '30d';
    this.applyTimePeriodToFilter();
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
      sort: this.sort.active,
      order: this.sort.direction,
    };
    this.api.searchRecords(p).subscribe((res: PagedResult<DmarcRecord>) => {
      this.rows.set(res.data);
      this.total.set(res.total);
    });
  }

  viewXml(record: DmarcRecord) {
    // Get the report ID from the nested report object
    const reportId = (record as any).report?.id;
    if (!reportId) return;
    
    this.api.getReportXml(reportId).subscribe((xml) => {
      this.dialog.open(XmlViewerDialogComponent, {
        data: { 
          xml, 
          record, 
          reportId: reportId,
          title: `DMARC Report XML - ${record.sourceIp || 'Unknown IP'}` 
        },
        width: '90%',
        maxWidth: '1400px',
        height: '85vh',
      });
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

  public formatDkimResultsColored(r: DmarcRecord): string {
    const arr = r.dkimResults || [];
    return arr
      .map((d: any) => {
        const result = d?.result || 'unknown';
        const icon = result === 'pass' ? '✅' : result === 'fail' ? '❌' : '⚪';
        const cssClass = result === 'pass' ? 'auth-pass' : result === 'fail' ? 'auth-fail' : 'auth-missing';
        return `<span class="${cssClass}">${icon} ${d?.domain || 'unknown'}:${result}</span>`;
      })
      .join(' ');
  }

  public formatSpfResultsColored(r: DmarcRecord): string {
    const arr = r.spfResults || [];
    return arr
      .map((s: any) => {
        const result = s?.result || 'unknown';
        const icon = result === 'pass' ? '✅' : result === 'fail' ? '❌' : '⚪';
        const cssClass = result === 'pass' ? 'auth-pass' : result === 'fail' ? 'auth-fail' : 'auth-missing';
        return `<span class="${cssClass}">${icon} ${s?.domain || 'unknown'}:${result}</span>`;
      })
      .join(' ');
  }

  expandedRow: DmarcRecord | null = null;
  toggleExpand(r: DmarcRecord) {
    this.expandedRow = this.expandedRow === r ? null : r;
  }

  // Auto-update table when filters change
  onFilterChange() {
    this.page.set(1);
    this.updateUrl();
    // Refresh date-scoped distincts when filters (especially dates) change
    this.loadDateScopedDistincts();
    this.search();
  }

  onTimePeriodInputChange() {
    this.applyTimePeriodToFilter();
    // Refresh date-scoped distincts when time period changes
    this.loadDateScopedDistincts();
    this.onFilterChange();
  }

  private applyTimePeriodToFilter() {
    const input = this.timePeriodInput.trim().toLowerCase();

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
    if (!code) return '';
    return this.countryNames[code.toUpperCase()] || code;
  }

  // Load filters from URL parameters
  private loadFiltersFromUrl() {
    const params = this.route.snapshot.queryParams;

    if (params['domain']) this.filters.domain = Array.isArray(params['domain']) ? params['domain'] : [params['domain']];
    if (params['disposition'])
      this.filters.disposition = Array.isArray(params['disposition']) ? params['disposition'] : [params['disposition']];
    if (params['dkim']) this.filters.dkim = Array.isArray(params['dkim']) ? params['dkim'] : [params['dkim']];
    if (params['spf']) this.filters.spf = Array.isArray(params['spf']) ? params['spf'] : [params['spf']];
    if (params['sourceIp'])
      this.filters.sourceIp = Array.isArray(params['sourceIp']) ? params['sourceIp'] : [params['sourceIp']];
    if (params['envelopeTo'])
      this.filters.envelopeTo = Array.isArray(params['envelopeTo']) ? params['envelopeTo'] : [params['envelopeTo']];
    if (params['envelopeFrom'])
      this.filters.envelopeFrom = Array.isArray(params['envelopeFrom'])
        ? params['envelopeFrom']
        : [params['envelopeFrom']];
    if (params['headerFrom'])
      this.filters.headerFrom = Array.isArray(params['headerFrom']) ? params['headerFrom'] : [params['headerFrom']];
    if (params['dkimDomain'])
      this.filters.dkimDomain = Array.isArray(params['dkimDomain']) ? params['dkimDomain'] : [params['dkimDomain']];
    if (params['spfDomain'])
      this.filters.spfDomain = Array.isArray(params['spfDomain']) ? params['spfDomain'] : [params['spfDomain']];
    if (params['country'])
      this.filters.country = Array.isArray(params['country']) ? params['country'] : [params['country']];
    if (params['from']) this.filters.from = new Date(params['from']);
    if (params['to']) this.filters.to = new Date(params['to']);
    if (params['contains']) this.filters.contains = params['contains'];
    if (params['page']) this.page.set(parseInt(params['page'], 10));
    if (params['pageSize']) this.pageSize.set(parseInt(params['pageSize'], 10));
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
        return '🔴';
      case 'quarantine':
        return '🟡';
      case 'none':
        return '🟢';
      default:
        return '⚪';
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

  getAuthIcon(authResult: string | undefined): string {
    switch (authResult) {
      case 'pass':
        return '✅';
      case 'fail':
        return '❌';
      default:
        return '⚪';
    }
  }

  // DKIM-specific methods that consider both policy_evaluated and auth_results
  getDkimAuthLabel(record: DmarcRecord): string {
    const policyResult = record.dmarcDkim;
    const hasAuthResults = record.dkimResults && record.dkimResults.length > 0;

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

  getDkimAuthIcon(record: DmarcRecord): string {
    const label = this.getDkimAuthLabel(record);
    switch (label) {
      case 'pass':
        return '✅';
      case 'fail':
        return '❌';
      case 'missing':
        return '⚪';
      default:
        return '⚪';
    }
  }

  getDkimAuthClass(record: DmarcRecord): string {
    const label = this.getDkimAuthLabel(record);
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

  // SPF-specific methods that consider both policy_evaluated and auth_results
  getSpfAuthLabel(record: DmarcRecord): string {
    const policyResult = record.dmarcSpf;
    const hasAuthResults = record.spfResults && record.spfResults.length > 0;

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

  getSpfAuthIcon(record: DmarcRecord): string {
    const label = this.getSpfAuthLabel(record);
    switch (label) {
      case 'pass':
        return '✅';
      case 'fail':
        return '❌';
      case 'missing':
        return '⚪';
      default:
        return '⚪';
    }
  }

  getSpfAuthClass(record: DmarcRecord): string {
    const label = this.getSpfAuthLabel(record);
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

    if (this.filters.domain.length) queryParams.domain = this.filters.domain;
    if (this.filters.disposition.length) queryParams.disposition = this.filters.disposition;
    if (this.filters.dkim.length) queryParams.dkim = this.filters.dkim;
    if (this.filters.spf.length) queryParams.spf = this.filters.spf;
    if (this.filters.sourceIp.length) queryParams.sourceIp = this.filters.sourceIp;
    if (this.filters.envelopeTo.length) queryParams.envelopeTo = this.filters.envelopeTo;
    if (this.filters.envelopeFrom.length) queryParams.envelopeFrom = this.filters.envelopeFrom;
    if (this.filters.headerFrom.length) queryParams.headerFrom = this.filters.headerFrom;
    if (this.filters.dkimDomain.length) queryParams.dkimDomain = this.filters.dkimDomain;
    if (this.filters.spfDomain.length) queryParams.spfDomain = this.filters.spfDomain;
    if (this.filters.country.length) queryParams.country = this.filters.country;
    if (this.filters.from) queryParams.from = this.filters.from.toISOString().split('T')[0];
    if (this.filters.to) queryParams.to = this.filters.to.toISOString().split('T')[0];
    if (this.filters.contains) queryParams.contains = this.filters.contains;
    if (this.page() > 1) queryParams.page = this.page();
    if (this.pageSize() !== 20) queryParams.pageSize = this.pageSize();

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'replace',
    });
  }
}
