import { describe, expect, it } from 'vitest';
import {
  assessChange,
  detectEffectiveClassification,
  intentFromDocument,
  intentFromSearch,
  isReplyOrForward,
} from '../../src/core/policy.js';

describe('detectEffectiveClassification', () => {
  it('prefers an unambiguous subject marking', () => {
    const result = detectEffectiveClassification({
      subject: '[TLP:AMBER] Incident',
      body: 'TLP:GREEN\n\ndetails',
    });
    expect(result.level).toBe('TLP:AMBER');
    expect(result.source).toBe('subject');
  });

  it('falls back to the leading body marking', () => {
    const result = detectEffectiveClassification({ subject: 'Incident', body: 'TLP:RED\n\ndetails' });
    expect(result.level).toBe('TLP:RED');
    expect(result.source).toBe('body-leading');
  });

  it('uses body consensus when there is no leading mark but all agree', () => {
    const result = detectEffectiveClassification({
      subject: 'Incident',
      body: '> forwarded\n> TLP:GREEN',
    });
    expect(result.level).toBe('TLP:GREEN');
    expect(result.source).toBe('body-consensus');
  });

  it('refuses to resolve a subject conflict', () => {
    const result = detectEffectiveClassification({
      subject: '[TLP:AMBER] [TLP:RED] Incident',
      body: '',
    });
    expect(result.level).toBeNull();
    expect(result.conflicts).toEqual(['TLP:AMBER', 'TLP:RED']);
  });

  it('reports legacy WHITE', () => {
    const result = detectEffectiveClassification({ subject: '[TLP:WHITE] Notice', body: '' });
    expect(result.level).toBe('TLP:CLEAR');
    expect(result.legacyWhite).toBe(true);
  });

  it('returns none for a plain message', () => {
    const result = detectEffectiveClassification({ subject: 'Hello', body: 'Just text' });
    expect(result.level).toBeNull();
    expect(result.source).toBe('none');
  });
});

describe('intentFromSearch', () => {
  it('classifies composer intents from URL parameters', () => {
    expect(intentFromSearch('?_task=mail&_action=compose')).toBe('new');
    expect(intentFromSearch('?_task=mail&_action=compose&_reply_uid=1')).toBe('reply');
    expect(intentFromSearch('?_task=mail&_action=compose&_reply_uid=1&_all=all')).toBe('reply-all');
    expect(intentFromSearch('?_task=mail&_action=compose&_forward_uid=1')).toBe('forward');
    expect(intentFromSearch('?_task=mail&_action=compose&_draft_uid=5')).toBe('draft');
  });

  it('treats reply and forward as downgrade-relevant', () => {
    expect(isReplyOrForward('reply')).toBe(true);
    expect(isReplyOrForward('reply-all')).toBe(true);
    expect(isReplyOrForward('forward')).toBe(true);
    expect(isReplyOrForward('new')).toBe(false);
    expect(isReplyOrForward('draft')).toBe(false);
  });
});

describe('intentFromDocument', () => {
  function fakeDocument(attrs: Record<string, string>): Document {
    return {
      documentElement: {
        getAttribute: (name: string) => attrs[name] ?? null,
      },
    } as unknown as Document;
  }

  it('prefers the published MAIN-world compose mode', () => {
    expect(intentFromDocument(fakeDocument({ 'data-tlp-compose-mode': 'reply' }), '?_task=mail&_action=compose')).toBe('reply');
    expect(intentFromDocument(fakeDocument({ 'data-tlp-compose-mode': 'forward' }), '?_task=mail&_action=compose')).toBe('forward');
    expect(intentFromDocument(fakeDocument({ 'data-tlp-compose-mode': 'new' }), '?_task=mail&_action=compose&_reply_uid=1')).toBe('new');
  });

  it('treats a draft id as a draft', () => {
    expect(intentFromDocument(fakeDocument({ 'data-tlp-draft-id': '42' }), '?_task=mail&_action=compose')).toBe('draft');
  });

  it('falls back to URL search when the probe has not run', () => {
    expect(intentFromDocument(fakeDocument({}), '?_task=mail&_action=compose&_reply_uid=3')).toBe('reply');
    expect(intentFromDocument(fakeDocument({}), '?_task=mail&_action=compose')).toBe('new');
  });
});

describe('assessChange', () => {
  it('flags downgrades with advice', () => {
    const assessment = assessChange('TLP:RED', 'TLP:GREEN');
    expect(assessment.kind).toBe('downgrade');
    expect(assessment.isDowngrade).toBe(true);
    expect(assessment.advice).toMatch(/permission/);
  });

  it('recognises upgrades and unchanged', () => {
    expect(assessChange('TLP:GREEN', 'TLP:RED').kind).toBe('upgrade');
    expect(assessChange('TLP:AMBER', 'TLP:AMBER').kind).toBe('unchanged');
    expect(assessChange(null, 'TLP:AMBER').kind).toBe('set');
  });
});
