import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MessageComponent } from './message.component';

describe('MessageComponent', () => {
  let component: MessageComponent;
  let fixture: ComponentFixture<MessageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MessageComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(MessageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should default to info type', () => {
    expect(component.type).toBe('info');
  });

  it('should default showBorder to true', () => {
    expect(component.showBorder).toBe(true);
  });

  describe('defaultIcon', () => {
    it('should return custom icon when set', () => {
      component.icon = 'custom_icon';
      expect(component.defaultIcon).toBe('custom_icon');
    });

    it('should return info icon for info type', () => {
      component.type = 'info';
      expect(component.defaultIcon).toBe('info');
    });

    it('should return warning icon for warning type', () => {
      component.type = 'warning';
      expect(component.defaultIcon).toBe('warning');
    });

    it('should return error icon for error type', () => {
      component.type = 'error';
      expect(component.defaultIcon).toBe('error');
    });

    it('should return check_circle icon for success type', () => {
      component.type = 'success';
      expect(component.defaultIcon).toBe('check_circle');
    });
  });

  describe('showIcon', () => {
    it('should be false when icon is undefined', () => {
      component.icon = undefined;
      expect(component.showIcon).toBe(false);
    });

    it('should be true when icon is set', () => {
      component.icon = 'star';
      expect(component.showIcon).toBe(true);
    });
  });
});
