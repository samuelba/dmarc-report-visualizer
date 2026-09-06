import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { SamlService } from './saml.service';
import { SamlConfig } from '../entities/saml-config.entity';
import { User } from '../entities/user.entity';

jest.mock('ioredis', () => {
  const MockRedis = jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    ping: jest.fn().mockResolvedValue('PONG'),
    quit: jest.fn().mockResolvedValue('OK'),
  }));
  return {
    __esModule: true,
    default: MockRedis,
  };
});

describe('SamlService Redis initialization', () => {
  const RedisMock = Redis as unknown as jest.Mock;

  async function createService(
    redisHost: string | undefined,
  ): Promise<SamlService> {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SamlService,
        {
          provide: getRepositoryToken(SamlConfig),
          useValue: { find: jest.fn(), create: jest.fn(), save: jest.fn() },
        },
        {
          provide: getRepositoryToken(User),
          useValue: { findOne: jest.fn(), create: jest.fn(), save: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: unknown) => {
              if (key === 'REDIS_HOST') {
                return redisHost ?? defaultValue;
              }
              if (key === 'REDIS_PORT') {
                return 6379;
              }
              return defaultValue;
            }),
          },
        },
      ],
    }).compile();

    return module.get<SamlService>(SamlService);
  }

  beforeEach(() => {
    RedisMock.mockClear();
  });

  it('does not connect to Redis when REDIS_HOST is unset', async () => {
    const service = await createService(undefined);

    await service.onModuleInit();

    expect(RedisMock).not.toHaveBeenCalled();
    expect((service as unknown as { redis: unknown }).redis).toBeNull();
  });

  it('connects to Redis when REDIS_HOST is set', async () => {
    const service = await createService('redis');

    await service.onModuleInit();

    expect(RedisMock).toHaveBeenCalled();
    expect((service as unknown as { redis: unknown }).redis).not.toBeNull();
  });
});
