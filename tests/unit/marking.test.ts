import { describe, expect, it } from 'vitest';
import {
  applyPlainBodyMark,
  applySubjectMark,
  hasPlainBodyMark,
  removePlainBodyMark,
  removeSubjectMark,
  stripSubjectMarks,
  subjectToken,
} from '../../src/core/marking.js';

describe('subject marking', () => {
  it('prefixes the canonical bracketed token', () => {
    expect(applySubjectMark('Security notification', 'TLP:AMBER')).toBe('[TLP:AMBER] Security notification');
    expect(subjectToken('TLP:AMBER+STRICT')).toBe('[TLP:AMBER+STRICT]');
  });

  it('is idempotent', () => {
    const once = applySubjectMark('Security notification', 'TLP:AMBER');
    expect(applySubjectMark(once, 'TLP:AMBER')).toBe(once);
  });

  it('replaces an existing token rather than duplicating it', () => {
    expect(applySubjectMark('[TLP:GREEN] Update', 'TLP:AMBER')).toBe('[TLP:AMBER] Update');
    expect(applySubjectMark('Re: [TLP:GREEN] Update', 'TLP:RED')).toBe('[TLP:RED] Re: Update');
  });

  it('removes obsolete and bare tokens', () => {
    expect(stripSubjectMarks('[TLP:WHITE] Public notice')).toBe('Public notice');
    expect(stripSubjectMarks('TLP:AMBER bare token')).toBe('bare token');
  });

  it('preserves the STRICT modifier word when re-marking a malformed label', () => {
    expect(applySubjectMark('[TLP:AMBER STRICT] report', 'TLP:RED')).toBe('[TLP:RED] report');
    expect(applySubjectMark('[TLP:AMBER-STRICT] report', 'TLP:AMBER+STRICT')).toBe('[TLP:AMBER+STRICT] report');
    expect(stripSubjectMarks('TLP:AMBER STRICT report')).toBe('report');
  });

  it('does not delete a classification mentioned in prose', () => {
    expect(applySubjectMark('Re: How we handle TLP:RED data', 'TLP:AMBER')).toBe(
      '[TLP:AMBER] Re: How we handle TLP:RED data',
    );
    const once = applySubjectMark('How we handle TLP:RED data', 'TLP:GREEN');
    expect(applySubjectMark(once, 'TLP:GREEN')).toBe(once);
  });

  it('strips leading and trailing bare tokens', () => {
    expect(applySubjectMark('Re: TLP:GREEN digest', 'TLP:RED')).toBe('[TLP:RED] Re: digest');
    expect(applySubjectMark('digest TLP:GREEN', 'TLP:RED')).toBe('[TLP:RED] digest');
  });

  it('removes markings', () => {
    expect(removeSubjectMark('[TLP:AMBER] Hello')).toBe('Hello');
    expect(removeSubjectMark('Hello')).toBe('Hello');
  });

  it('does not alter unrelated subject content', () => {
    const subject = 'Re: Fwd: [EXTERNAL] Quarterly report Q1';
    const marked = applySubjectMark(subject, 'TLP:AMBER');
    expect(removeSubjectMark(marked)).toBe(subject);
  });
});

describe('plain body marking', () => {
  it('adds the marker followed by a blank line', () => {
    expect(applyPlainBodyMark('Dear colleagues', 'TLP:AMBER')).toBe('TLP:AMBER\n\nDear colleagues');
  });

  it('is idempotent', () => {
    const once = applyPlainBodyMark('Body text', 'TLP:GREEN');
    expect(applyPlainBodyMark(once, 'TLP:GREEN')).toBe(once);
  });

  it('replaces rather than duplicates', () => {
    const body = 'TLP:GREEN\n\nBody text';
    expect(applyPlainBodyMark(body, 'TLP:RED')).toBe('TLP:RED\n\nBody text');
  });

  it('handles an empty body', () => {
    expect(applyPlainBodyMark('', 'TLP:RED')).toBe('TLP:RED');
    expect(removePlainBodyMark('TLP:RED')).toBe('');
  });

  it('preserves quoted content and signatures verbatim', () => {
    const original = 'Dear colleagues,\n\nPlease review.\n\n-- \nJane Doe\n\n> quoted TLP:GREEN line';
    const marked = applyPlainBodyMark(original, 'TLP:AMBER');
    expect(removePlainBodyMark(marked)).toBe(original);
    expect(marked).toContain('> quoted TLP:GREEN line');
    expect(marked).toContain('-- \nJane Doe');
  });

  it('preserves unusual Unicode and RTL content', () => {
    const original = 'مرحبا بالعالم\nשלום עולם\nEmoji: 🔐🟡';
    const marked = applyPlainBodyMark(original, 'TLP:AMBER');
    expect(removePlainBodyMark(marked)).toBe(original);
  });

  it('reports presence', () => {
    expect(hasPlainBodyMark('TLP:CLEAR\n\ntext', 'TLP:CLEAR')).toBe(true);
    expect(hasPlainBodyMark('TLP:CLEAR\n\ntext', 'TLP:RED')).toBe(false);
    expect(hasPlainBodyMark('text', 'TLP:RED')).toBe(false);
  });
});
