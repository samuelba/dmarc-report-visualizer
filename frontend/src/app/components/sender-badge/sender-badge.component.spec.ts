import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { vi } from 'vitest';
import { SenderBadgeComponent } from './sender-badge.component';
import { DmarcReport } from '../../services/api.service';

describe('SenderBadgeComponent', () => {
  let fixture: ComponentFixture<SenderBadgeComponent>;
  let component: SenderBadgeComponent;

  const render = (report: Partial<DmarcReport>): HTMLElement => {
    component.report = report;
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SenderBadgeComponent, BrowserAnimationsModule],
    }).compileComponents();

    fixture = TestBed.createComponent(SenderBadgeComponent);
    component = fixture.componentInstance;
  });

  it('shows a verified mark for aligned reports', () => {
    const el = render({ authStatus: 'aligned', authDomain: 'google.com' });

    expect(el.querySelector('[data-testid="sender-badge-aligned"]')).not.toBeNull();
    expect(component.tooltip).toBe('Verified sender: google.com');
  });

  it('names the authenticated domain for unaligned reports', () => {
    const el = render({
      authStatus: 'unaligned',
      authDomain: 'dmarc.yahoo.com',
      claimedDomain: 'yahooinc.com',
    });

    expect(el.textContent).toContain('Sent by dmarc.yahoo.com');
    expect(component.tooltip).toBe('Authenticated as dmarc.yahoo.com, but the report claims yahooinc.com');
  });

  it('warns about unverified reports', () => {
    const el = render({ authStatus: 'unverified' });

    expect(el.textContent).toContain('Unverified sender');
  });

  it('labels manually uploaded reports', () => {
    const el = render({ authStatus: 'manual' });

    expect(el.querySelector('[data-testid="sender-badge-manual"]')).not.toBeNull();
    expect(el.textContent).toContain('Manual upload');
    expect(component.tooltip).toBe('Uploaded by a user, so there is no email sender to verify');
  });

  it('labels reports received while sender verification was off', () => {
    const el = render({ authStatus: 'unchecked' });

    expect(el.querySelector('[data-testid="sender-badge-unchecked"]')).not.toBeNull();
    expect(el.textContent).toContain('Not checked');
    expect(component.tooltip).toBe('Received while sender verification was turned off');
  });

  it('labels reports stored before sender verification', () => {
    const el = render({ authStatus: 'legacy' });

    expect(el.querySelector('[data-testid="sender-badge-legacy"]')).not.toBeNull();
    expect(el.textContent).toContain('Legacy');
    expect(component.tooltip).toBe('Stored before sender verification was introduced');
  });

  it('shows nothing when the status is missing', () => {
    const el = render({ authStatus: undefined });

    expect(el.querySelector('.sender-badge')).toBeNull();
  });

  it('emits details without triggering the row click', () => {
    render({ authStatus: 'unverified' });
    const details = vi.fn();
    component.details.subscribe(details);
    const event = new MouseEvent('click', { bubbles: true });
    const stop = vi.spyOn(event, 'stopPropagation');

    (fixture.nativeElement as HTMLElement).querySelector('.sender-badge')!.dispatchEvent(event);

    expect(details).toHaveBeenCalled();
    expect(stop).toHaveBeenCalled();
  });
});
