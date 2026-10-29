// ─── Section orchestrator ───

import { fetchJSON, showFallback } from './dom.js';
import { initGreeting, initWaveEmoji } from './greeting.js';
import { initFooter, initFooterMeta } from './footer.js';
import { initHangout } from './hangout.js';
import { initRaceTabs } from './race-tabs.js';
import { initScrollReveal, initBackToTop, initShortcutHint } from './ui.js';
import { renderCurrently, renderDock, renderRaces, renderRail, renderBucketList, renderWriting } from './render-data.js';

export function initSections() {
  initGreeting();
  initWaveEmoji();
  initFooter();
  initFooterMeta();
  initScrollReveal();
  initBackToTop();
  initShortcutHint();
  initHangout();
  initRaceTabs();

  fetchJSON('data/currently.json')
    .then(renderCurrently)
    .catch(() => showFallback('currently-list', 'could not load data.'));

  fetchJSON('data/uses.json')
    .then(renderDock)
    .catch(() => showFallback('dock', 'could not load data.'));

  fetchJSON('data/races.json')
    .then(renderRaces)
    .catch(() => showFallback('races-list', 'could not load race data.'));

  fetchJSON('data/races-2027.json')
    .then((races) => renderRail(races, document.getElementById('race-rail'), document.getElementById('rail-stats')))
    .catch(() => showFallback('race-rail', 'could not load race data.'));

  fetchJSON('data/bucketlist.json')
    .then(renderBucketList)
    .catch(() => showFallback('bucket-list', 'could not load bucket list.'));

  fetchJSON('/api/posts?limit=4')
    .then(renderWriting)
    .catch(() => showFallback('writing-list', 'could not load posts.'));
}
