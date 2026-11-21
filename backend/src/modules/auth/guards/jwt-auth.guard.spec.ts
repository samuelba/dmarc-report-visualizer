import { Controller, ExecutionContext, Get } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ApiTokenGuard } from './api-token.guard';
import { Public } from '../decorators/public.decorator';
import { ApiTokenAuth } from '../decorators/api-token-auth.decorator';

@Controller()
class FixtureController {
  @Get('private')
  privateRoute() {}

  @Public()
  @Get('public')
  publicRoute() {}

  @ApiTokenAuth()
  @Get('token')
  tokenRoute() {}
}

function contextFor(handler: () => void): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => FixtureController,
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let passportCanActivate: jest.SpyInstance;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [JwtAuthGuard],
    }).compile();

    guard = module.get<JwtAuthGuard>(JwtAuthGuard);
    passportCanActivate = jest
      .spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype), 'canActivate')
      .mockReturnValue('passport');
  });

  afterEach(() => {
    passportCanActivate.mockRestore();
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('requires the session cookie on normal routes', () => {
    const proto = FixtureController.prototype;

    expect(guard.canActivate(contextFor(proto.privateRoute))).toBe('passport');
    expect(passportCanActivate).toHaveBeenCalled();
  });

  it('skips authentication on @Public() routes', () => {
    const proto = FixtureController.prototype;

    expect(guard.canActivate(contextFor(proto.publicRoute))).toBe(true);
    expect(passportCanActivate).not.toHaveBeenCalled();
  });

  it('leaves @ApiTokenAuth() routes to ApiTokenGuard', () => {
    const proto = FixtureController.prototype;

    expect(guard.canActivate(contextFor(proto.tokenRoute))).toBe(true);
    expect(passportCanActivate).not.toHaveBeenCalled();
    expect(Reflect.getMetadata(GUARDS_METADATA, proto.tokenRoute)).toEqual([
      ApiTokenGuard,
    ]);
  });
});
