import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { RecordDetailsDialogComponent } from './record-details-dialog.component';
import { DmarcRecord } from '../../services/api.service';
import { createSpyObj } from '../../../testing/mock-helpers';

describe('RecordDetailsDialogComponent', () => {
  let component: RecordDetailsDialogComponent;
  let fixture: ComponentFixture<RecordDetailsDialogComponent>;

  const mockRecord: DmarcRecord = {
    id: 'r1',
    sourceIp: '1.2.3.4',
    count: 10,
    headerFrom: 'sub.example.com',
    envelopeFrom: 'example.com',
    envelopeTo: 'dest.com',
    dmarcDkim: 'pass',
    dmarcSpf: 'fail',
    spfResult: 'pass',
    spfDomain: 'example.com',
    dkimResult: 'pass',
    dkimDomain: 'example.com',
    disposition: 'none',
    reasonType: 'forwarded',
    reasonComment: 'trusted forwarder',
    geoCountry: 'US',
    geoCity: 'New York',
    geoIsp: 'ISP',
    geoOrg: 'Org',
    geoLatitude: 40.7,
    geoLongitude: -74.0,
    geoLookupStatus: 'completed',
    geoLookupCompletedAt: '2024-01-01',
    isForwarded: true,
    forwardingChainJson: null,
    report: {
      id: 'rpt1',
      domain: 'example.com',
      beginDate: '2024-01-01',
      policy: { p: 'reject', sp: 'none', adkim: 'r', aspf: 'r', pct: 100 },
    } as any,
  };

  const mockGetCountryName = (code: string | undefined) => (code === 'US' ? 'United States' : code || '');

  beforeEach(() => {
    const dialogRefSpy = createSpyObj('MatDialogRef', ['close', 'addPanelClass', 'removePanelClass']);
    const dialogSpy = createSpyObj('MatDialog', ['open']);

    TestBed.configureTestingModule({
      imports: [RecordDetailsDialogComponent],
      providers: [
        { provide: MatDialogRef, useValue: dialogRefSpy },
        { provide: MAT_DIALOG_DATA, useValue: { record: mockRecord, getCountryName: mockGetCountryName } },
        { provide: MatDialog, useValue: dialogSpy },
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

    fixture = TestBed.createComponent(RecordDetailsDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should return record from data', () => {
    expect(component.record.id).toBe('r1');
  });

  it('should delegate getCountryName to data function', () => {
    expect(component.getCountryName('US')).toBe('United States');
  });

  it('should get report begin date', () => {
    expect(component.getReportBeginDate()).toBe('2024-01-01');
  });

  it('should get policy', () => {
    const policy = component.getPolicy();
    expect(policy.p).toBe('reject');
  });

  describe('hasIdentifiers', () => {
    it('should return true when identifiers exist', () => {
      expect(component.hasIdentifiers()).toBe(true);
    });
  });

  describe('hasGeoData', () => {
    it('should return true when geo data exists', () => {
      expect(component.hasGeoData()).toBe(true);
    });
  });

  describe('hasPolicyData', () => {
    it('should return true when policy data exists', () => {
      expect(component.hasPolicyData()).toBe(true);
    });
  });

  describe('isSubdomain', () => {
    it('should return true for subdomain', () => {
      expect(component.isSubdomain()).toBe(true);
    });
  });

  describe('getApplicablePolicy', () => {
    it('should return subdomain for subdomain record', () => {
      expect(component.getApplicablePolicy()).toBe('subdomain');
    });
  });

  describe('hasForwardingData', () => {
    it('should return true when isForwarded is set', () => {
      expect(component.hasForwardingData()).toBe(true);
    });
  });

  describe('hasPolicyOverride', () => {
    it('should return true when reason exists', () => {
      expect(component.hasPolicyOverride()).toBe(true);
    });
  });

  describe('getDmarcOverallStatus', () => {
    it('should return pass when dkim passes', () => {
      expect(component.getDmarcOverallStatus()).toBe('pass');
    });
  });

  describe('getDkimOverallStatus', () => {
    it('should return pass when dmarcDkim passes', () => {
      expect(component.getDkimOverallStatus()).toBe('pass');
    });
  });

  describe('getSpfOverallStatus', () => {
    it('should return fail when dmarcSpf fails', () => {
      expect(component.getSpfOverallStatus()).toBe('fail');
    });
  });

  describe('getForwardedLabel', () => {
    it('should return Yes for forwarded', () => {
      expect(component.getForwardedLabel()).toBe('Yes');
    });
  });

  describe('getForwardedIcon', () => {
    it('should return forward for forwarded', () => {
      expect(component.getForwardedIcon()).toBe('forward');
    });
  });

  describe('getForwardedClass', () => {
    it('should return forwarded-yes for forwarded', () => {
      expect(component.getForwardedClass()).toBe('forwarded-yes');
    });
  });

  describe('getAuthIcon', () => {
    it('should return check_box for pass', () => {
      expect(component.getAuthIcon('pass')).toBe('check_box');
    });

    it('should return cancel for fail', () => {
      expect(component.getAuthIcon('fail')).toBe('cancel');
    });

    it('should return help_center for unknown', () => {
      expect(component.getAuthIcon(undefined)).toBe('help_center');
    });
  });

  describe('getAuthClass', () => {
    it('should return auth-pass for pass', () => {
      expect(component.getAuthClass('pass')).toBe('auth-pass');
    });

    it('should return auth-fail for fail', () => {
      expect(component.getAuthClass('fail')).toBe('auth-fail');
    });

    it('should return auth-missing for unknown', () => {
      expect(component.getAuthClass(undefined)).toBe('auth-missing');
    });
  });
});
