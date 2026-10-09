import { describe, expect, test } from 'vitest';
import markdown from '@/directives/markdown';

describe('markdown directive', () => {
  test('renders markdown', () => {
    const el = document.createElement('div');
    markdown(el, { value: '**bold**', oldValue: undefined });
    expect(el.innerHTML).toContain('<strong>bold</strong>');
  });

  // Used for user content (for example in the report dialogs), so HTML must not be rendered
  test('escapes HTML', () => {
    const el = document.createElement('div');
    markdown(el, { value: '<img src=x onerror=alert(1)>', oldValue: undefined });
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toContain('<img src=x onerror=alert(1)>');
  });
});
