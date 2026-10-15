'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

/**
 * Norwegian (no) across the manifest: every string a user can see, English
 * as the fallback, and nothing else in the manifest touched.
 */

const root = path.join(__dirname, '..');
const LANGS = new Set(['en', 'nl', 'de', 'no', 'fr', 'it', 'sv', 'da', 'es', 'pl', 'ru', 'ko', 'ar']);
// Language-neutral symbols fall back to English; there is nothing to translate.
// "Use Material Design Icons for the trip figures" - the commit just before
// "Translate the manifest into Norwegian".
const BEFORE_TRANSLATION = '363bb0d';
const SYMBOLS = new Set(['km/h', 'km', 'min', 'kWh/100 km', '%', '°C', 'kW', '°', 'bar']);

function manifestFiles() {
  const list = (dir) => fs.readdirSync(path.join(root, dir)).filter((f) => f.endsWith('.json')).map((f) => path.join(dir, f));
  return [
    ...list('.homeycompose/capabilities'),
    ...['actions', 'conditions', 'triggers'].flatMap((kind) => list(`.homeycompose/flow/${kind}`)),
    'drivers/mercedes-vehicle/driver.compose.json',
    'widgets/car-status/widget.compose.json',
    '.homeycompose/app.json',
  ];
}

function i18nObjects(node, found = []) {
  if (Array.isArray(node)) node.forEach((n) => i18nObjects(n, found));
  else if (node && typeof node === 'object') {
    if (typeof node.en === 'string' && Object.keys(node).every((k) => LANGS.has(k))) found.push(node);
    else Object.values(node).forEach((n) => i18nObjects(n, found));
  }
  return found;
}

test('every translatable manifest string has Norwegian', () => {
  const missing = [];
  for (const file of manifestFiles()) {
    const json = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
    for (const o of i18nObjects(json)) {
      if (!SYMBOLS.has(o.en) && !o.no) missing.push(`${file}: ${o.en}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('English, Dutch and German are exactly as they were', () => {
  let before;
  try {
    // The last commit before the Norwegian translation: what translating may
    // not have changed. English written since (new cards, renamed tags) is
    // new text, not a translation side effect, so it is not held to this.
    before = (file) => JSON.parse(execFileSync('git', ['show', `${BEFORE_TRANSLATION}:${file}`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
    before('.homeycompose/app.json');
  } catch (e) {
    return; // not a git checkout: nothing to compare against
  }

  // Every translation object, by where it sits in the file. Only the texts
  // are held still: other fields (an icon, say) and new objects may change,
  // but an en/nl/de text that existed before the translation may not.
  const byPath = (node, at = '', found = {}) => {
    if (Array.isArray(node)) node.forEach((n, i) => byPath(n, `${at}[${(n && (n.id || n.name)) || i}]`, found));
    else if (node && typeof node === 'object') {
      if (typeof node.en === 'string' && Object.keys(node).every((k) => LANGS.has(k))) {
        found[at] = { en: node.en, nl: node.nl, de: node.de };
      } else {
        for (const [k, v] of Object.entries(node)) byPath(v, `${at}.${k}`, found);
      }
    }
    return found;
  };

  for (const file of manifestFiles()) {
    let old;
    try { old = byPath(before(file)); } catch (e) { continue; } // new since then
    const now = byPath(JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')));
    for (const [at, text] of Object.entries(old)) {
      assert.deepEqual(now[at], text, `${file} ${at}: only "no" may change`);
    }
  }
});

test('the agreed vocabulary: words ruled out do not appear in Norwegian', () => {
  // No dashes as punctuation in Norwegian either: "tilbakestilt, nyttig", "Nivå (0-4)".
  // And plain quotation marks, not angle quotes: "fra start", not «fra start».
  const ruledOut = [/aktivert/i, /\binaktiv/i, /kjøretøy/i, /forkondisjonering/i, /klimatisering/i, /bagasjelokk/i, /siden tilbakestilling/i, /[–—]/, /[«»]/];
  const offenders = [];
  for (const file of manifestFiles()) {
    const json = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
    for (const o of i18nObjects(json)) {
      if (o.no && ruledOut.some((re) => re.test(o.no))) offenders.push(`${file}: ${o.no}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('Homey\'s own capabilities are left to Homey\'s own Norwegian', () => {
  const ours = new Set(fs.readdirSync(path.join(root, '.homeycompose/capabilities')).map((f) => f.replace(/\.json$/, '')));
  const driver = JSON.parse(fs.readFileSync(path.join(root, 'drivers/mercedes-vehicle/driver.compose.json'), 'utf8'));
  assert.equal(driver.capabilitiesOptions, undefined, 'no title overrides on system capabilities');
  for (const id of ['locked', 'measure_battery', 'alarm_generic']) assert.ok(!ours.has(id), id);
});
