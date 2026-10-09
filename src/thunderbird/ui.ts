import { t } from '../utils/i18n.js';
import type { ValidationIssue } from '../core/validation.js';
export function showIssues(target: HTMLElement, issues: ValidationIssue[]) {
  target.replaceChildren();
  for (const issue of issues) {
    const item = document.createElement('li');
    item.textContent = t(`issue_${issue.code}`, issue.params) || issue.message;
    target.appendChild(item);
  }
}
export function status(text: string) { document.getElementById('status')!.textContent = text; }
