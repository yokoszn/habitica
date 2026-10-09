import { describe, expect, test } from 'vitest';
import { sanitizeTaskMessage } from '@/libs/notifications';

describe('sanitizeTaskMessage', () => {
  test('keeps the markup of the message templates', () => {
    const message = '@manager has assigned you the task <span class="notification-bold">Task</span>.';
    expect(sanitizeTaskMessage(message)).to.equal(message);
  });

  test('keeps text that the server already escaped unchanged', () => {
    const message = '<span class="notification-bold">&lt;b&gt; &amp; &quot;&#39;</span> was unchecked';
    expect(sanitizeTaskMessage(message)).to.equal(message);
  });

  test('escapes markup in messages built without escaping', () => {
    const message = '@manager has assigned you the task <span class="notification-bold"><img src=x onerror="alert(1)"></span>.';
    expect(sanitizeTaskMessage(message)).to.equal('@manager has assigned you the task <span class="notification-bold">&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</span>.');
  });

  test('only restores spans without other attributes', () => {
    expect(sanitizeTaskMessage('<span class="notification-bold" onclick="x">a</span>'))
      .to.equal('&lt;span class=&quot;notification-bold&quot; onclick=&quot;x&quot;&gt;a</span>');
    expect(sanitizeTaskMessage('<span class="x" style="y">a</span>'))
      .to.equal('&lt;span class=&quot;x&quot; style=&quot;y&quot;&gt;a</span>');
  });

  test('returns an empty string for a missing message', () => {
    expect(sanitizeTaskMessage(undefined)).to.equal('');
  });
});
