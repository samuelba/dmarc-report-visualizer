import { vi } from 'vitest';

/**
 * Vitest equivalent of jasmine.SpyObj<T>
 * Makes all methods on T also be Vitest Mock instances.
 */
export type SpyObj<T> = {
  [K in keyof T]: T[K] & ReturnType<typeof vi.fn>;
};

/**
 * Vitest equivalent of jasmine.createSpyObj().
 * Creates an object where each named method is a vi.fn() mock.
 */
export function createSpyObj<T = any>(_baseName: string, methodNames: string[]): SpyObj<T> {
  const obj: Record<string, unknown> = {};
  for (const method of methodNames) {
    obj[method] = vi.fn();
  }
  return obj as SpyObj<T>;
}
