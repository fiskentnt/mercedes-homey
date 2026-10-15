'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/**
 * Capability icons: every one a capability names exists, and the trip
 * figures share Material Design Icons (Apache 2.0) "from start" and "from
 * reset" alike, with the licence shipped beside them.
 */

const root = path.join(__dirname, '..');
const capDir = path.join(root, '.homeycompose', 'capabilities');
const read = (id) => JSON.parse(fs.readFileSync(path.join(capDir, `${id}.json`), 'utf8'));

test('every capability icon exists', () => {
  for (const file of fs.readdirSync(capDir)) {
    const { icon } = JSON.parse(fs.readFileSync(path.join(capDir, file), 'utf8'));
    if (!icon) continue;
    assert.ok(fs.existsSync(path.join(root, icon)), `${file}: ${icon} is missing`);
  }
});

test('the trip figures use the agreed MDI icons, the same from start and from reset', () => {
  const expected = {
    distance_start: 'map-marker-distance',
    distance_reset: 'map-marker-distance',
    driven_time_start: 'clock-check-outline',
    average_speed: 'speedometer',
    electric_consumption_start: 'chart-line',
    electric_consumption_reset: 'chart-line',
  };
  const licence = fs.readFileSync(path.join(root, 'assets', 'icons', 'LICENSE-mdi.txt'), 'utf8');

  for (const [capability, icon] of Object.entries(expected)) {
    assert.equal(read(capability).icon, `/assets/icons/${icon}.svg`, capability);
    const svg = fs.readFileSync(path.join(root, 'assets', 'icons', `${icon}.svg`), 'utf8');
    assert.match(svg, /viewBox="0 0 24 24" fill="currentColor"/, `${icon}: monochrome, 24x24`);
    assert.match(svg, new RegExp(`Material Design Icons "${icon}"`), `${icon}: names its source`);
    assert.ok(licence.includes(`${icon}.svg`), `${icon}: listed in LICENSE-mdi.txt`);
  }
  assert.match(licence, /Apache License\s+Version 2\.0/);
});
