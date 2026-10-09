/**
 * Pre-send validation.
 *
 * Best-effort, browser-side checks. This is NOT enforcement: a user can disable
 * the extension, use another client, or use developer tools. It exists to catch
 * the common, accidental mistakes before a message leaves the composer.
 */

import { analyzeBody, analyzeSubject, quotedLevels } from './parser.js';
import { type ComposerIntent } from './policy.js';
import type { Settings } from './settings.js';
import { type TlpLevel, compareRestrictiveness, getDefinition, isDowngrade } from './tlp.js';

export type IssueCode =
  | 'LEVEL_NOT_ALLOWED'
  | 'NO_CLASSIFICATION'
  | 'SUBJECT_NOT_MARKED'
  | 'SUBJECT_MISMATCH'
  | 'SUBJECT_CONFLICT'
  | 'SUBJECT_DUPLICATE'
  | 'BODY_NOT_MARKED'
  | 'BODY_MISMATCH'
  | 'BODY_AMBIGUOUS'
  | 'DOWNGRADE'
  | 'QUOTED_HIGHER'
  | 'LEGACY_WHITE';

export type IssueSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  code: IssueCode;
  severity: IssueSeverity;
  /** English fallback text (presentation layers localise via `code` + `params`). */
  message: string;
  /** Values for the localised message template. */
  params?: Record<string, string>;
}

export interface ValidationInput {
  selectedLevel: TlpLevel | null;
  subject: string;
  bodyText: string;
  intent: ComposerIntent;
  originalLevel: TlpLevel | null;
  settings: Pick<Settings, 'missingClassification' | 'warnOnDowngrade' | 'markSubject' | 'markBody'> & Partial<Pick<Settings, 'allowedLevels'>>;
}

export interface ValidationResult {
  /** No blocking errors. */
  ok: boolean;
  /** Warnings exist that require explicit user confirmation. */
  needsConfirmation: boolean;
  issues: ValidationIssue[];
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export function validateBeforeSend(input: ValidationInput): ValidationResult {
  const issues: ValidationIssue[] = [];
  const subject = analyzeSubject(input.subject);
  const body = analyzeBody(input.bodyText);
  const selected = input.selectedLevel;
  // Browser controllers can be rebuilt after a settings change, losing the
  // selection while the draft's existing labels remain. Check those too.
  const disallowed = input.settings.allowedLevels
    ? [selected, subject.level, body.leadingLevel].find(level => level && !input.settings.allowedLevels!.includes(level)) : null;
  if (disallowed) {
    issues.push({ code: 'LEVEL_NOT_ALLOWED', severity: 'error',
      message: `${disallowed} is no longer approved. Choose an approved classification before sending.`, params: { level: disallowed } });
  }

  if (selected == null) {
    const message =
      'This message has no TLP classification. Select one before sending.';
    if (input.settings.missingClassification === 'block') {
      issues.push({ code: 'NO_CLASSIFICATION', severity: 'error', message });
    } else if (input.settings.missingClassification === 'warn') {
      issues.push({ code: 'NO_CLASSIFICATION', severity: 'warning', message });
    } else {
      issues.push({
        code: 'NO_CLASSIFICATION',
        severity: 'info',
        message: 'This message has no TLP classification.',
      });
    }
  } else {
    const name = getDefinition(selected).name;

    if (input.settings.markSubject) {
      if (subject.conflicted) {
        issues.push({
          code: 'SUBJECT_CONFLICT',
          severity: 'error',
          message: 'The subject contains conflicting TLP classifications.',
        });
      } else if (subject.level == null) {
        issues.push({
          code: 'SUBJECT_NOT_MARKED',
          severity: 'error',
          message: `The subject is not marked with ${selected}.`,
          params: { level: selected },
        });
      } else if (subject.level !== selected) {
        issues.push({
          code: 'SUBJECT_MISMATCH',
          severity: 'error',
          message: `The subject is marked ${subject.level} but ${selected} was selected.`,
          params: { actual: subject.level, level: selected },
        });
      }
      if (subject.duplicated) {
        issues.push({
          code: 'SUBJECT_DUPLICATE',
          severity: 'warning',
          message: `The subject contains more than one ${name} marking.`,
          params: { level: selected },
        });
      }
    } else if (subject.conflicted) {
      issues.push({
        code: 'SUBJECT_CONFLICT',
        severity: 'warning',
        message: 'The subject contains conflicting TLP classifications.',
      });
    }

    if (input.settings.markBody) {
      if (body.leadingLevel == null) {
        issues.push({
          code: 'BODY_NOT_MARKED',
          severity: 'error',
          message: `The message body has no ${selected} marking.`,
          params: { level: selected },
        });
      } else if (body.leadingLevel !== selected) {
        issues.push({
          code: 'BODY_MISMATCH',
          severity: 'error',
          message: `The message body leads with ${body.leadingLevel} but ${selected} was selected.`,
          params: { actual: body.leadingLevel, level: selected },
        });
      }
      if (body.leadingLevel == null && body.levels.length > 1) {
        issues.push({
          code: 'BODY_AMBIGUOUS',
          severity: 'error',
          message: 'The message body contains conflicting TLP classifications without a clear leading mark.',
        });
      }
    }
  }

  if (
    selected != null &&
    input.originalLevel != null &&
    input.settings.warnOnDowngrade &&
    isDowngrade(input.originalLevel, selected)
  ) {
    issues.push({
      code: 'DOWNGRADE',
      severity: 'warning',
      message:
        `You are lowering the classification from ${getDefinition(input.originalLevel).name} to ` +
        `${getDefinition(selected).name}. TLP does not permit wider sharing without the source's ` +
        'explicit permission. Only continue if you are authorised to do so.',
      params: { from: input.originalLevel, to: selected },
    });
  }

  // The quoted thread may carry a more restrictive label than the one chosen
  // (e.g. a reply to a GREEN message that quotes an earlier RED one). The
  // subject takes precedence for detection, so this is checked separately.
  if (selected != null && input.settings.warnOnDowngrade) {
    let strictest: TlpLevel | null = null;
    for (const level of quotedLevels(input.bodyText)) {
      if (strictest == null || compareRestrictiveness(level, strictest) > 0) {
        strictest = level;
      }
    }
    const alreadyReported = strictest != null && strictest === input.originalLevel && issues.some((i) => i.code === 'DOWNGRADE');
    if (strictest != null && isDowngrade(strictest, selected) && !alreadyReported) {
      issues.push({
        code: 'QUOTED_HIGHER',
        severity: 'warning',
        message:
          `The quoted text contains ${strictest}, which is more restrictive than the selected ${selected}. ` +
          'Quoting it here may share that information more widely than its source allows.',
        params: { quoted: strictest, level: selected },
      });
    }
  }

  const hasLegacy = subject.tokens.some((t) => t.legacy) || body.tokens.some((t) => t.legacy);
  if (hasLegacy) {
    issues.push({
      code: 'LEGACY_WHITE',
      severity: 'warning',
      message: 'This conversation contains the obsolete TLP:WHITE designation. It should be TLP:CLEAR.',
    });
  }

  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  return {
    ok: errors.length === 0,
    needsConfirmation: warnings.length > 0,
    issues,
    errors,
    warnings,
  };
}
