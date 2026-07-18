import { describe, expect, it } from 'vitest';
import {
  getInviteReturnPath,
  getSafeInternalReturnPath,
} from './return-path';

describe('authentication return paths', () => {
  it('preserves internal invite paths', () => {
    const path = getInviteReturnPath('token with spaces');
    expect(path).toBe('/onboarding?invite=token+with+spaces&accept=1');
    expect(getSafeInternalReturnPath(path)).toBe(path);
  });

  it.each([
    'https://evil.example/path',
    '//evil.example/path',
    '/\\evil.example/path',
    '/path\nLocation: https://evil.example',
  ])('rejects unsafe return path %s', (path) => {
    expect(getSafeInternalReturnPath(path)).toBeNull();
  });
});
