/* Army.fit — placeholder script.
 *
 * Its only job is to prove JavaScript is served from assets/js/ and runs on
 * the deployed site. The #build line starts red and says "scripts NOT loaded".
 * If this file runs, it turns green. If you ever load the live page and see
 * red, the script path is broken — fix that before debugging anything else.
 */

(function () {
  'use strict';

  var el = document.getElementById('build');
  if (!el) return;

  var stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  el.textContent = 'scripts ok · ' + stamp + ' UTC';
  el.setAttribute('data-ok', 'true');
})();
