// web-test core/helpers v1.16 — private, cross-cutting helpers used by the
// public action functions (clickElement/fillFields/selectValue/etc).
// Source: https://github.com/Nikolay-Shirokov/cc-1c-skills

import { page } from './state.mjs';
import { dismissPendingErrors } from './errors.mjs';

/**
 * page.click with the standard "intercepts pointer events" retry ladder:
 *   normal → force → Escape (+ optional dismissPendingErrors) → normal.
 * Mirrors the three hand-written copies in fillReferenceField, clickElement
 * and the DLB branch of selectValue.
 *
 * @param {string} selector
 * @param {object} [opts]
 * @param {number} [opts.timeout] — passed through to page.click
 * @param {boolean} [opts.dismissErrors=false] — call dismissPendingErrors()
 *   before pressing Escape on the second retry (used in fillReferenceField).
 */
export async function safeClick(selector, { timeout, dismissErrors = false } = {}) {
  const baseOpts = timeout != null ? { timeout } : {};
  try {
    await page.click(selector, baseOpts);
  } catch (e) {
    if (!e.message.includes('intercepts pointer events')) throw e;
    try {
      await page.click(selector, { ...baseOpts, force: true });
    } catch (e2) {
      if (!e2.message.includes('intercepts pointer events')) throw e2;
      if (dismissErrors) await dismissPendingErrors();
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      await page.click(selector, baseOpts);
    }
  }
}
