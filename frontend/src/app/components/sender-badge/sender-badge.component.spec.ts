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

  it.each(['legacy', 'manual', undefined] as const)('shows nothing for %s reports', (authStatus) => {
    const el = render({ authStatus });

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
