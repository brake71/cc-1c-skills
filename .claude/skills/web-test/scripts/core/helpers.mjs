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

/**
 * Find a form field's input element id by name. Tries `form{N}_{name}` first,
 * then `form{N}_{name}_i0` (reference fields use the _i0 suffix). Returns the
 * element id or null. Used in selectValue's clear/composite-type/F4 fallback
 * branches.
 *
 * @param {number} formNum
 * @param {string} fieldName
 * @returns {Promise<string|null>}
 */
export async function findFieldInputId(formNum, fieldName) {
  return await page.evaluate(`(() => {
    const p = 'form${formNum}_';
    const name = ${JSON.stringify(fieldName)};
    const el = document.querySelector('[id="' + p + name + '"], [id="' + p + name + '_i0"]');
    return el ? el.id : null;
  })()`);
}
