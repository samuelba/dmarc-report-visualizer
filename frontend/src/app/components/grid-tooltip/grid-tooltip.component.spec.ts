import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GridTooltipComponent, GridTooltipRow, GridTooltipSection } from './grid-tooltip.component';

describe('GridTooltipComponent', () => {
  let component: GridTooltipComponent;
  let fixture: ComponentFixture<GridTooltipComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GridTooltipComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(GridTooltipComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should default rows to empty array', () => {
    expect(component.rows).toEqual([]);
  });

  it('should default sections to empty array', () => {
    expect(component.sections).toEqual([]);
  });

  it('should accept title input', () => {
    component.title = 'Test Title';
    expect(component.title).toBe('Test Title');
  });

  it('should accept rows input', () => {
    const rows: GridTooltipRow[] = [
      { label: 'Status', value: 'Pass', statusClass: 'pass' },
      { label: 'Count', value: '42', icon: 'check' },
    ];
    component.rows = rows;
    expect(component.rows).toEqual(rows);
  });

  it('should accept sections input', () => {
    const sections: GridTooltipSection[] = [{ title: 'Section 1', rows: [{ label: 'A', value: 'B' }] }];
    component.sections = sections;
    expect(component.sections).toEqual(sections);
  });

  it('should accept emptyMessage input', () => {
    component.emptyMessage = 'No data available';
    expect(component.emptyMessage).toBe('No data available');
  });
});
