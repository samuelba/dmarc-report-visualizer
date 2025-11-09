import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { SamlSettingsComponent, SamlConfigResponse } from './saml-settings.component';
import { AuthService } from '../../../services/auth.service';

describe('SamlSettingsComponent', () => {
  let component: SamlSettingsComponent;
  let fixture: ComponentFixture<SamlSettingsComponent>;
  let authService: jasmine.SpyObj<AuthService>;

  const mockConfig: SamlConfigResponse = {
    enabled: true,
    configured: true,
    spEntityId: 'test-sp-entity',
    spAcsUrl: 'https://test.example.com/auth/saml/callback',
    idpEntityId: 'test-idp-entity',
    idpSsoUrl: 'https://idp.example.com/sso',
    hasIdpCertificate: true,
  };

  beforeEach(async () => {
    const authServiceSpy = jasmine.createSpyObj('AuthService', [
      'getSamlConfig',
      'updateSamlConfig',
      'enableSaml',
      'disableSaml',
      'downloadSamlMetadata',
    ]);

    await TestBed.configureTestingModule({
      imports: [
        SamlSettingsComponent,
        HttpClientTestingModule,
        ReactiveFormsModule,
        MatSnackBarModule,
        NoopAnimationsModule,
      ],
      providers: [{ provide: AuthService, useValue: authServiceSpy }],
    }).compileComponents();

    authService = TestBed.inject(AuthService) as jasmine.SpyObj<AuthService>;
    fixture = TestBed.createComponent(SamlSettingsComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load configuration on init', () => {
    authService.getSamlConfig.and.returnValue(of(mockConfig));

    component.ngOnInit();

    expect(authService.getSamlConfig).toHaveBeenCalled();
    expect(component.config()).toEqual(mockConfig);
    expect(component.loading()).toBe(false);
  });

  it('should handle configuration load error', () => {
    authService.getSamlConfig.and.returnValue(throwError(() => new Error('Load failed')));

    component.ngOnInit();

    expect(authService.getSamlConfig).toHaveBeenCalled();
    expect(component.loading()).toBe(false);
  });

  it('should download SP metadata', () => {
    const mockBlob = new Blob(['<xml></xml>'], { type: 'application/xml' });
    authService.downloadSamlMetadata.and.returnValue(of(mockBlob));
    spyOn(window.URL, 'createObjectURL').and.returnValue('blob:test');
    spyOn(window.URL, 'revokeObjectURL');

    component.downloadMetadata();

    expect(authService.downloadSamlMetadata).toHaveBeenCalled();
    expect(component.loading()).toBe(false);
  });

  it('should copy text to clipboard', async () => {
    spyOn(navigator.clipboard, 'writeText').and.returnValue(Promise.resolve());

    await component.copyToClipboard('test-text', 'Test Label');

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('test-text');
  });

  it('should submit metadata configuration', () => {
    authService.updateSamlConfig.and.returnValue(of(mockConfig));
    authService.getSamlConfig.and.returnValue(of(mockConfig));

    component.metadataForm.patchValue({ idpMetadataXml: '<xml></xml>' });
    component.submitMetadata();

    expect(authService.updateSamlConfig).toHaveBeenCalledWith({
      idpMetadataXml: '<xml></xml>',
    });
  });

  it('should submit manual configuration', () => {
    authService.updateSamlConfig.and.returnValue(of(mockConfig));
    authService.getSamlConfig.and.returnValue(of(mockConfig));

    component.manualForm.patchValue({
      idpEntityId: 'test-entity',
      idpSsoUrl: 'https://idp.example.com/sso',
      idpCertificate: 'test-cert',
    });
    component.submitManualConfig();

    expect(authService.updateSamlConfig).toHaveBeenCalledWith({
      idpEntityId: 'test-entity',
      idpSsoUrl: 'https://idp.example.com/sso',
      idpCertificate: 'test-cert',
    });
  });

  it('should enable SAML', () => {
    authService.enableSaml.and.returnValue(of(void 0));
    authService.getSamlConfig.and.returnValue(of(mockConfig));
    component.config.set(mockConfig);

    const mockEvent = { checked: true, source: { checked: true } };
    component.toggleSaml(mockEvent);

    expect(authService.enableSaml).toHaveBeenCalled();
  });

  it('should disable SAML with confirmation', () => {
    authService.disableSaml.and.returnValue(of(void 0));
    authService.getSamlConfig.and.returnValue(of(mockConfig));
    component.config.set(mockConfig);
    spyOn(window, 'confirm').and.returnValue(true);

    const mockEvent = { checked: false, source: { checked: false } };
    component.toggleSaml(mockEvent);

    expect(window.confirm).toHaveBeenCalled();
    expect(authService.disableSaml).toHaveBeenCalled();
  });

  it('should test SAML login', () => {
    component.config.set(mockConfig);
    spyOn(window, 'open').and.returnValue({} as Window);

    component.testSamlLogin();

    expect(window.open).toHaveBeenCalledWith('/api/auth/saml/login', 'saml-test', 'width=800,height=600');
  });
});
