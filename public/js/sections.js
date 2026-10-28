// ─── Section orchestrator ───

import { fetchJSON, showFallback } from './dom.js';
import { initGreeting, initWaveEmoji } from './greeting.js';
import { initFooter, initFooterMeta } from './footer.js';
import { initHangout } from './hangout.js';
import { initScrollReveal, initBackToTop, initShortcutHint } from './ui.js';
import { renderCurrently, renderDock, renderRaces, renderBucketList, fetchWriting } from './render-data.js';

export function initSections() {
  initGreeting();
  initWaveEmoji();
  initFooter();
  initFooterMeta();
  initScrollReveal();
  initBackToTop();
  initShortcutHint();
  initHangout();

  fetchJSON('data/currently.json')
    .then(renderCurrently)
    .catch(() => showFallback('currently-list', 'could not load data.'));

  fetchJSON('data/uses.json')
    .then(renderDock)
    .catch(() => showFallback('dock', 'could not load data.'));

  fetchJSON('data/races.json')
    .then(renderRaces)
    .catch(() => showFallback('races-list', 'could not load race data.'));

  fetchJSON('data/bucketlist.json')
    .then(renderBucketList)
    .catch(() => showFallback('bucket-list', 'could not load bucket list.'));

  fetchWriting();
}
