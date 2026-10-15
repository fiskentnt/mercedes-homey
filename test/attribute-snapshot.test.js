'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ProtoParser = require('../lib/proto/parser');
const MercedesWebSocket = require('../lib/websocket');
const { AttributeSnapshot } = require('../lib/attribute-snapshot');

/**
 * GET /fields: the last value of every attribute a car has sent - a read-only
 * diagnostic, with no VIN and no position in it.
 */

const VIN = 'W1K2938891F012345';

async function frameFor(parser, attributes) {
  return parser.PushMessage.encode({
    vepUpdates: { sequenceNumber: 1, updates: { [VIN]: { vin: VIN, attributes } } },
  }).finish();
}

test('a push is recorded attribute by attribute: value, display value, unit, status', async () => {
  const parser = new ProtoParser({ app: { log() {}, error() {} } });
  await parser.initialize();
  const homey = { app: { log() {}, error() {} } };
  const snapshot = new AttributeSnapshot();
  const ws = new MercedesWebSocket(homey, {}, 'Europe', parser, null, { attributes: snapshot });
  ws._sendMessage = async () => {};
  ws.messageHandler = async () => {};

  await ws._processMessage(await frameFor(parser, {
    distanceReset: { status: 0, doubleValue: 1430.7, displayValue: '1430.7', distanceUnit: 1, timestampInMs: 1760489000000 },
    electricconsumptionreset: { status: 0, doubleValue: 21.49, displayValue: '21.5', electricityConsumptionUnit: 1 },
    ecoElectricBatteryTemperature: { status: 4, nilValue: true },
    doorlockstatusvehicle: { status: 0, intValue: 2 },
    positionLat: { status: 0, doubleValue: 59.913868 },
    positionLong: { status: 0, doubleValue: 10.752245 },
    vin: { status: 0, stringValue: VIN },
  }));

  const [car] = snapshot.cars();
  assert.deepEqual(car.distanceReset, {
    value: 1430.7, display: '1430.7', unit: 'KILOMETERS', status: 0, statusMeaning: 'valid',
    reported: new Date(1760489000000).toISOString(), source: 'push',
  });
  assert.equal(car.electricconsumptionreset.unit, 'KWH_PER_100KM');
  assert.equal(car.ecoElectricBatteryTemperature.value, null, 'sent, but with no value');
  assert.equal(car.ecoElectricBatteryTemperature.statusMeaning, 'not received');
  assert.equal(car.doorlockstatusvehicle.value, 2);
});

test('no VIN and no position, by key or by value', () => {
  const snapshot = new AttributeSnapshot();
  snapshot.record(VIN, {
    vin: { status: 0, stringValue: VIN },
    positionLat: { status: 0, doubleValue: 59.913868 },
    positionLong: { status: 0, doubleValue: 10.752245 },
    somethingElse: { status: 0, stringValue: `car ${VIN}`, displayValue: VIN },
    soc: { status: 0, intValue: 80 },
  }, 'push');

  const text = JSON.stringify(snapshot.cars());
  for (const secret of [VIN, '59.91', '10.75']) {
    assert.equal(text.includes(secret), false, `"${secret}" must not be in it`);
  }
  assert.ok(!('vin' in snapshot.cars()[0]));
  assert.ok(!('positionLat' in snapshot.cars()[0]));
  assert.equal(snapshot.cars()[0].somethingElse.value, '[hidden]');
  assert.equal(snapshot.cars()[0].soc.value, 80);
});

test('later values replace earlier ones; cars stay apart and are numbered, not named', () => {
  const snapshot = new AttributeSnapshot();
  snapshot.record(VIN, { soc: { status: 0, intValue: 80 } }, 'poll');
  snapshot.record(VIN, { soc: { status: 0, intValue: 81 } }, 'push');
  snapshot.record('W1K0000000A000000', { soc: { status: 0, intValue: 40 } }, 'push');

  const cars = snapshot.cars();
  assert.equal(cars.length, 2);
  assert.deepEqual([cars[0].soc.value, cars[0].soc.source], [81, 'push']);
  assert.equal(cars[1].soc.value, 40);
});

test('GET /fields is served from api.js and is not public', async () => {
  const homeyPath = require.resolve('homey');
  require.cache[homeyPath] = {
    id: homeyPath, filename: homeyPath, loaded: true, exports: { App: class {} },
  };
  const MercedesMeApp = require('../app');
  const app = Object.create(MercedesMeApp.prototype);
  const snapshot = new AttributeSnapshot();
  snapshot.record(VIN, { soc: { status: 0, intValue: 80 }, vin: { stringValue: VIN } }, 'push');
  app._accountSessions = { apis: () => [{ attributeSnapshot: snapshot }] };

  const body = await require('../api').getFields({ homey: { app } });
  assert.equal(body.cars.length, 1);
  assert.equal(body.cars[0].count, 1);
  assert.equal(body.cars[0].fields.soc.value, 80);
  assert.equal(JSON.stringify(body).includes(VIN), false);

  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.homeycompose', 'app.json'), 'utf8'));
  assert.deepEqual(manifest.api.getFields, { method: 'GET', path: '/fields', public: false });
});
