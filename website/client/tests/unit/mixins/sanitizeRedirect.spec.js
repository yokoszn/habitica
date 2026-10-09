import { describe, expect, test } from 'vitest';
import sanitizeRedirect from '@/mixins/sanitizeRedirect';

const sanitize = redirect => sanitizeRedirect.methods.sanitizeRedirect(redirect);

describe('sanitizeRedirect mixin', () => {
  test('keeps paths on this site', () => {
    expect(sanitize('/tasks')).toBe('/tasks');
    expect(sanitize('/groups/guild/123?tab=chat#bottom')).toBe('/groups/guild/123?tab=chat#bottom');
  });

  test('falls back to the start page for empty or invalid values', () => {
    expect(sanitize(undefined)).toBe('/');
    expect(sanitize('')).toBe('/');
    expect(sanitize(['/tasks'])).toBe('/');
    expect(sanitize('tasks')).toBe('/');
  });

  test('does not redirect to other sites', () => {
    [
      'https://evil.example/',
      '//evil.example/',
      '/\\evil.example/',
      '/\t/evil.example/',
      '/\n/evil.example/',
      'javascript:alert(1)', // eslint-disable-line no-script-url
    ].forEach(redirect => {
      expect(sanitize(redirect)).toBe('/');
    });
  });
});
