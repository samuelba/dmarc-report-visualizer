import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { ServiceUnavailableException } from '@nestjs/common';
import { EmailQueueService } from './email-queue.service';

describe('EmailQueueService', () => {
  it('throws when queueing email without Redis', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EmailQueueService],
    }).compile();

    const service = module.get<EmailQueueService>(EmailQueueService);

    await expect(
      service.queueEmail({
        to: 'user@example.com',
        subject: 'Test',
        text: 'Hello',
      }),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('throws when queueing invite email without Redis', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EmailQueueService],
    }).compile();

    const service = module.get<EmailQueueService>(EmailQueueService);

    await expect(
      service.queueInviteEmail('user@example.com', 'token', 'Admin'),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('queues email when Redis queue is available', async () => {
    const add = jest.fn().mockResolvedValue({ id: 'job-1' });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailQueueService,
        {
          provide: getQueueToken('email'),
          useValue: { add },
        },
      ],
    }).compile();

    const service = module.get<EmailQueueService>(EmailQueueService);
    const jobId = await service.queueEmail({
      to: 'user@example.com',
      subject: 'Test',
      text: 'Hello',
    });

    expect(jobId).toBe('job-1');
    expect(add).toHaveBeenCalledWith(
      'send-email',
      expect.objectContaining({ to: 'user@example.com' }),
      expect.any(Object),
    );
  });

  it('queues invite email when Redis queue is available', async () => {
    const add = jest.fn().mockResolvedValue({ id: 'job-2' });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailQueueService,
        {
          provide: getQueueToken('email'),
          useValue: { add },
        },
      ],
    }).compile();

    const service = module.get<EmailQueueService>(EmailQueueService);
    const jobId = await service.queueInviteEmail(
      'user@example.com',
      'token',
      'Admin',
    );

    expect(jobId).toBe('job-2');
    expect(add).toHaveBeenCalledWith(
      'send-invite-email',
      { email: 'user@example.com', token: 'token', inviterName: 'Admin' },
      expect.any(Object),
    );
  });
});
