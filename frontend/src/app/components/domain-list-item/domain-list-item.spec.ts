import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { DomainListItemComponent } from './domain-list-item';
import { DomainStatistics } from '../../services/api.service';

describe('DomainListItemComponent', () => {
  let component: DomainListItemComponent;
  let fixture: ComponentFixture<DomainListItemComponent>;
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
      imports: [DomainListItemComponent, BrowserAnimationsModule],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(DomainListItemComponent);
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
    component.daysBack = 60;
    component.onExplore();
    expect(navigateSpy).toHaveBeenCalledWith(['/explore'], {
      queryParams: { headerFrom: 'example.com', period: '60d' },
    });
  });

  describe('getPassRateClass', () => {
    it('should return good for rate >= 85', () => {
      expect(component.getPassRateClass(85)).toBe('pass-rate-good');
    });

    it('should return warning for rate >= 60 and < 85', () => {
      expect(component.getPassRateClass(70)).toBe('pass-rate-warning');
    });

    it('should return danger for rate < 60', () => {
      expect(component.getPassRateClass(30)).toBe('pass-rate-danger');
    });
  });
});
