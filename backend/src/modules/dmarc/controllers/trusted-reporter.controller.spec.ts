import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { TrustedReporterController } from './trusted-reporter.controller';
import { TrustedReporterService } from '../services/trusted-reporter.service';

describe('TrustedReporterController', () => {
  const service = {
    listUnaligned: jest.fn(),
    listTrusted: jest.fn(),
    trust: jest.fn(),
    revoke: jest.fn(),
  };
  const controller = new TrustedReporterController(
    service as unknown as TrustedReporterService,
  );

  afterEach(() => jest.resetAllMocks());

  it('is restricted to administrators', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, TrustedReporterController),
    ).toContain(AdminGuard);
  });

  it('lists unaligned senders and trusted pairs', async () => {
    service.listUnaligned.mockResolvedValue(['u']);
    service.listTrusted.mockResolvedValue(['t']);

    await expect(controller.listUnaligned()).resolves.toEqual(['u']);
    await expect(controller.listTrusted()).resolves.toEqual(['t']);
  });

  it('trusts a pair on behalf of the signed-in admin', async () => {
    const dto = {
      claimedDomain: 'yahooinc.com',
      authDomain: 'dmarc.yahoo.com',
    };
    service.trust.mockResolvedValue({ upgradedReports: 3 });

    await expect(
      controller.trust(dto, {
        user: { id: 'u1', email: 'admin@example.com' },
      } as never),
    ).resolves.toEqual({ upgradedReports: 3 });
    expect(service.trust).toHaveBeenCalledWith(dto, {
      id: 'u1',
      email: 'admin@example.com',
    });
  });

  it('revokes a pair', async () => {
    service.revoke.mockResolvedValue({ downgradedReports: 3 });

    await expect(controller.revoke('pair-1')).resolves.toEqual({
      downgradedReports: 3,
    });
    expect(service.revoke).toHaveBeenCalledWith('pair-1');
  });
});
