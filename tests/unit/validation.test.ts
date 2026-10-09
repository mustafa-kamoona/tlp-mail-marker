import { describe, expect, it } from 'vitest';
import { validateBeforeSend, type ValidationInput } from '../../src/core/validation.js';
import type { Settings } from '../../src/core/settings.js';

const baseSettings: Pick<Settings, 'missingClassification' | 'warnOnDowngrade' | 'markSubject' | 'markBody'> = {
  missingClassification: 'warn',
  warnOnDowngrade: true,
  markSubject: true,
  markBody: true,
};

function input(partial: Partial<ValidationInput>): ValidationInput {
  return {
    selectedLevel: 'TLP:AMBER',
    subject: '[TLP:AMBER] Incident',
    bodyText: 'TLP:AMBER\n\nDetails',
    intent: 'new',
    originalLevel: null,
    settings: baseSettings,
    ...partial,
  };
}

function codes(result: ReturnType<typeof validateBeforeSend>): string[] {
  return result.issues.map((issue) => issue.code);
}

describe('validateBeforeSend', () => {
  it('passes a correctly marked message', () => {
    const result = validateBeforeSend(input({}));
    expect(result.ok).toBe(true);
    expect(result.needsConfirmation).toBe(false);
    expect(result.errors).toHaveLength(0);
  });

  it('warns on a missing classification when configured to warn', () => {
    const result = validateBeforeSend(input({ selectedLevel: null, subject: 'Incident', bodyText: 'Details' }));
    expect(result.ok).toBe(true);
    expect(result.needsConfirmation).toBe(true);
    expect(codes(result)).toContain('NO_CLASSIFICATION');
  });

  it('blocks on a missing classification when configured to block', () => {
    const result = validateBeforeSend(
      input({
        selectedLevel: null,
        subject: 'Incident',
        bodyText: 'Details',
        settings: { ...baseSettings, missingClassification: 'block' },
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.errors[0]?.code).toBe('NO_CLASSIFICATION');
  });

  it('does not warn about a missing classification when configured off', () => {
    const result = validateBeforeSend(
      input({
        selectedLevel: null,
        subject: 'Incident',
        bodyText: 'Details',
        settings: { ...baseSettings, missingClassification: 'off' },
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.needsConfirmation).toBe(false);
    expect(codes(result)).toContain('NO_CLASSIFICATION');
  });

  it('flags a subject that is not marked', () => {
    const result = validateBeforeSend(input({ subject: 'Incident' }));
    expect(result.ok).toBe(false);
    expect(codes(result)).toContain('SUBJECT_NOT_MARKED');
  });

  it('flags a subject/body mismatch', () => {
    const result = validateBeforeSend(input({ subject: '[TLP:RED] Incident' }));
    expect(result.ok).toBe(false);
    expect(codes(result)).toContain('SUBJECT_MISMATCH');
  });

  it('flags conflicting and duplicate subject markings', () => {
    const conflict = validateBeforeSend(input({ subject: '[TLP:AMBER] [TLP:RED] Incident' }));
    expect(codes(conflict)).toContain('SUBJECT_CONFLICT');
    const duplicate = validateBeforeSend(input({ subject: '[TLP:AMBER] x [TLP:AMBER]' }));
    expect(codes(duplicate)).toContain('SUBJECT_DUPLICATE');
  });

  it('flags a body without a leading marking', () => {
    const result = validateBeforeSend(input({ bodyText: 'Details' }));
    expect(result.ok).toBe(false);
    expect(codes(result)).toContain('BODY_NOT_MARKED');
  });

  it('flags a body marking that disagrees with the subject', () => {
    const result = validateBeforeSend(input({ bodyText: 'TLP:RED\n\nDetails' }));
    expect(result.ok).toBe(false);
    expect(codes(result)).toContain('BODY_MISMATCH');
  });

  it('warns about downgrades for replies/forwards', () => {
    const result = validateBeforeSend(
      input({ selectedLevel: 'TLP:GREEN', subject: '[TLP:GREEN] Re: Incident', bodyText: 'TLP:GREEN\n\nRe', originalLevel: 'TLP:RED', intent: 'reply' }),
    );
    expect(result.ok).toBe(true);
    expect(result.needsConfirmation).toBe(true);
    expect(codes(result)).toContain('DOWNGRADE');
  });

  it('does not warn about downgrades when disabled', () => {
    const result = validateBeforeSend(
      input({
        selectedLevel: 'TLP:GREEN',
        subject: '[TLP:GREEN] Re: Incident',
        bodyText: 'TLP:GREEN\n\nRe',
        originalLevel: 'TLP:RED',
        settings: { ...baseSettings, warnOnDowngrade: false },
      }),
    );
    expect(result.needsConfirmation).toBe(false);
  });

  it('warns about the obsolete WHITE label', () => {
    const result = validateBeforeSend(input({ bodyText: 'TLP:AMBER\n\nquoted TLP:WHITE' }));
    expect(codes(result)).toContain('LEGACY_WHITE');
  });

  it('ignores deep quoted classifications when the leading mark is correct', () => {
    const result = validateBeforeSend(
      input({ bodyText: 'TLP:AMBER\n\nreply\n\n> original TLP:RED' }),
    );
    expect(result.ok).toBe(true);
    expect(codes(result)).not.toContain('BODY_MISMATCH');
  });

  it('can be configured not to require a subject or body marking', () => {
    const result = validateBeforeSend(
      input({
        selectedLevel: 'TLP:AMBER',
        subject: 'Incident',
        bodyText: 'Details',
        settings: { ...baseSettings, markSubject: false, markBody: false },
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.needsConfirmation).toBe(false);
  });

  describe('quoted text more restrictive than the selection', () => {
    const quotedRed = 'TLP:GREEN\n\nSee below\n\n> TLP:RED\n> secret detail';

    it('warns even when the original level was not detected', () => {
      const result = validateBeforeSend(
        input({ selectedLevel: 'TLP:GREEN', subject: '[TLP:GREEN] Re: x', bodyText: quotedRed }),
      );
      expect(codes(result)).toContain('QUOTED_HIGHER');
      expect(result.ok).toBe(true);
      expect(result.needsConfirmation).toBe(true);
      expect(result.warnings.find((w) => w.code === 'QUOTED_HIGHER')?.params).toEqual({
        quoted: 'TLP:RED',
        level: 'TLP:GREEN',
      });
    });

    it('uses the strictest quoted level', () => {
      const body = 'TLP:CLEAR\n\n> TLP:GREEN\n> TLP:AMBER+STRICT';
      const result = validateBeforeSend(input({ selectedLevel: 'TLP:CLEAR', subject: '[TLP:CLEAR] x', bodyText: body }));
      expect(result.warnings.find((w) => w.code === 'QUOTED_HIGHER')?.params?.quoted).toBe('TLP:AMBER+STRICT');
    });

    it('does not warn when the selection is equal or stricter', () => {
      expect(codes(validateBeforeSend(input({ selectedLevel: 'TLP:RED', subject: '[TLP:RED] x', bodyText: 'TLP:RED\n\n> TLP:RED' })))).not.toContain('QUOTED_HIGHER');
      expect(codes(validateBeforeSend(input({ selectedLevel: 'TLP:RED', subject: '[TLP:RED] x', bodyText: 'TLP:RED\n\n> TLP:GREEN' })))).not.toContain('QUOTED_HIGHER');
    });

    it('ignores unquoted mentions in the new text', () => {
      const body = 'TLP:GREEN\n\nWe never share TLP:RED data here.';
      expect(codes(validateBeforeSend(input({ selectedLevel: 'TLP:GREEN', subject: '[TLP:GREEN] x', bodyText: body })))).not.toContain('QUOTED_HIGHER');
    });

    it('is not reported twice when the standard downgrade warning already covers it', () => {
      const result = validateBeforeSend(
        input({
          selectedLevel: 'TLP:GREEN',
          subject: '[TLP:GREEN] x',
          bodyText: quotedRed,
          intent: 'reply',
          originalLevel: 'TLP:RED',
        }),
      );
      expect(codes(result)).toContain('DOWNGRADE');
      expect(codes(result)).not.toContain('QUOTED_HIGHER');
    });

    it('respects the warnOnDowngrade setting', () => {
      const result = validateBeforeSend(
        input({
          selectedLevel: 'TLP:GREEN',
          subject: '[TLP:GREEN] x',
          bodyText: quotedRed,
          settings: { ...baseSettings, warnOnDowngrade: false },
        }),
      );
      expect(codes(result)).not.toContain('QUOTED_HIGHER');
    });
  });
});
