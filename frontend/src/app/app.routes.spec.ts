import { describe, expect, it } from 'vitest';
import { routes } from './app.routes';
import { adminGuard, authGuard } from './guards';

describe('app routes', () => {
  const guardsOf = (path: string) => routes.find((r) => r.path === path)?.canActivate ?? [];

  it.each(['upload', 'settings', 'users'])('restricts %s to administrators', (path) => {
    expect(guardsOf(path)).toEqual([authGuard, adminGuard]);
  });
});
