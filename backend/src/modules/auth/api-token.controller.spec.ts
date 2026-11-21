import { GUARDS_METADATA, HEADERS_METADATA } from '@nestjs/common/constants';
import { SameOriginGuard } from './guards/same-origin.guard';
import { ApiTokenController } from './api-token.controller';
import { ApiTokenService } from './services/api-token.service';
import { AdminGuard } from './guards/admin.guard';

describe('ApiTokenController', () => {
  const proto = ApiTokenController.prototype;
  const guardsOf = (handler: unknown) =>
    (Reflect.getMetadata(GUARDS_METADATA, handler as object) ??
      []) as unknown[];

  it('only accepts same-origin browser requests', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, ApiTokenController)).toContain(
      SameOriginGuard,
    );
  });

  it('keeps the new token out of caches', () => {
    expect(Reflect.getMetadata(HEADERS_METADATA, proto.create)).toContainEqual({
      name: 'Cache-Control',
      value: 'no-store',
    });
  });

  it('restricts listing and revoking other users tokens to admins', () => {
    expect(guardsOf(proto.listAll)).toContain(AdminGuard);
    expect(guardsOf(proto.revokeAny)).toContain(AdminGuard);
  });

  it('lets every signed-in user manage their own tokens', () => {
    for (const handler of [
      proto.listOwn,
      proto.create,
      proto.revokeOwn,
      proto.revokeAllOwn,
    ]) {
      expect(guardsOf(handler)).not.toContain(AdminGuard);
    }
  });

  it('always acts on the signed-in user', async () => {
    const service = {
      listForUser: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
      revokeOwn: jest.fn().mockResolvedValue({}),
      revokeAllForUser: jest.fn().mockResolvedValue(2),
    };
    const controller = new ApiTokenController(
      service as unknown as ApiTokenService,
    );
    const request = { user: { id: 'user-1' } } as never;

    await controller.listOwn(request);
    await controller.create({ name: 'laptop' }, request);
    await controller.revokeOwn('token-1', request);
    const result = await controller.revokeAllOwn(request);

    expect(service.listForUser).toHaveBeenCalledWith('user-1');
    expect(service.create).toHaveBeenCalledWith('user-1', { name: 'laptop' });
    expect(service.revokeOwn).toHaveBeenCalledWith('user-1', 'token-1');
    expect(result).toEqual({ revoked: 2 });
  });
});
