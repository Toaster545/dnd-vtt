import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { wsGuard } from './ws-guard';

describe('wsGuard', () => {
  it('passes results through', async () => {
    await expect(wsGuard(() => Promise.resolve(7))).resolves.toBe(7);
  });

  it('converts HTTP exceptions into structured WsExceptions', async () => {
    const error = await wsGuard(() =>
      Promise.reject(new ForbiddenException()),
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WsException);
    expect((error as WsException).getError()).toMatchObject({ status: 403 });

    const missing = await wsGuard(() =>
      Promise.reject(new NotFoundException('Map not found')),
    ).catch((e: unknown) => e);
    expect((missing as WsException).getError()).toEqual({
      status: 404,
      message: 'Map not found',
    });
  });

  it('leaves unexpected errors alone', async () => {
    await expect(
      wsGuard(() => Promise.reject(new Error('boom'))),
    ).rejects.toThrow('boom');
  });
});
