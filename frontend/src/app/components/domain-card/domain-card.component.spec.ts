import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { DomainCardComponent } from './domain-card.component';
import { DomainStatistics } from '../../services/api.service';

describe('DomainCardComponent', () => {
  let component: DomainCardComponent;
  let fixture: ComponentFixture<DomainCardComponent>;
  let router: Router;

  const mockDomain: DomainStatistics = {
    id: 'd1',
    domain: 'example.com',
    isManaged: true,
    totalMessages: 100,
    passedMessages: 90,
    failedMessages: 10,
    dmarcPassRate: 90,
    spfPassRate: 85,
    dkimPassRate: 88,
    uniqueSources: 5,
    notes: null,
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DomainCardComponent, BrowserAnimationsModule],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(DomainCardComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    component.domain = mockDomain;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should emit edit event', () => {
    const editSpy = vi.spyOn(component.edit, 'emit');
    component.onEdit();
    expect(editSpy).toHaveBeenCalledWith(mockDomain);
  });

  it('should emit remove event', () => {
    const removeSpy = vi.spyOn(component.remove, 'emit');
    component.onRemove();
    expect(removeSpy).toHaveBeenCalledWith(mockDomain);
  });

  it('should emit addToManaged event', () => {
    const addSpy = vi.spyOn(component.addToManaged, 'emit');
    component.onAddToManaged();
    expect(addSpy).toHaveBeenCalledWith('example.com');
  });

  it('should navigate to explore on onExplore', () => {
    const navigateSpy = vi.spyOn(router, 'navigate');
    component.daysBack = 30;
    component.onExplore();
    expect(navigateSpy).toHaveBeenCalledWith(['/explore'], {
      queryParams: { headerFrom: 'example.com', period: '30d' },
    });
  });

  describe('getPassRateClass', () => {
    it('should return good for rate >= 85', () => {
      expect(component.getPassRateClass(85)).toBe('pass-rate-good');
      expect(component.getPassRateClass(100)).toBe('pass-rate-good');
    });

    it('should return warning for rate >= 60 and < 85', () => {
      expect(component.getPassRateClass(60)).toBe('pass-rate-warning');
      expect(component.getPassRateClass(84)).toBe('pass-rate-warning');
    });

    it('should return danger for rate < 60', () => {
      expect(component.getPassRateClass(59)).toBe('pass-rate-danger');
      expect(component.getPassRateClass(0)).toBe('pass-rate-danger');
    });
  });
});
