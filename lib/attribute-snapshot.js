'use strict';

/**
 * The last value of every attribute a car has sent, behind GET /fields.
 *
 * A diagnostic, read-only: it shows what already arrives over the push
 * connection and in the widget poll - the "FULL data keys" line in the log,
 * with values - for deciding what is worth a capability. It costs no request
 * to Mercedes and changes nothing the device does.
 *
 * Kept in memory only. The VIN and the position never get in: the `vin` key
 * and the latitude/longitude attributes are skipped, and any text that looks
 * like a VIN is blanked.
 */

const HIDDEN_KEYS = [/^vin$/i, /^position(lat|long)/i, /latitude|longitude/i];
const VIN_RE = /\b[A-HJ-NPR-Z0-9]{17}\b/;
const SCALARS = ['intValue', 'doubleValue', 'boolValue', 'stringValue'];
const MAX_COMPLEX = 300;

/** What status means, as mbapi2020 reads it. */
const STATUS = { 0: 'valid', 3: 'no value', 4: 'not received' };

function hidden(key) {
  return HIDDEN_KEYS.some((re) => re.test(key));
}

function blankVin(value) {
  return typeof value === 'string' && VIN_RE.test(value) ? '[hidden]' : value;
}

/** The attribute's value, whichever field of the oneof carries it. */
function readValue(attribute) {
  for (const field of SCALARS) {
    if (attribute[field] !== undefined && attribute[field] !== null) return attribute[field];
  }
  if (attribute.nilValue) return null;

  const complex = Object.keys(attribute).find(
    (k) => k.endsWith('Value') && k !== 'displayValue' && attribute[k] && typeof attribute[k] === 'object',
  );
  if (!complex) return undefined;

  const json = JSON.stringify(attribute[complex]);
  return json.length > MAX_COMPLEX ? `${json.slice(0, MAX_COMPLEX)}…` : json;
}

class AttributeSnapshot {
  constructor() {
    this._cars = new Map(); // VIN -> Map(attribute -> entry)
  }

  /**
   * @param {String} vin - only to keep cars apart; never output
   * @param {Object} attributes - VEPUpdate.attributes as decoded
   * @param {'push'|'poll'} source
   */
  record(vin, attributes, source) {
    if (!attributes || typeof attributes !== 'object') return;

    let car = this._cars.get(vin);
    if (!car) {
      car = new Map();
      this._cars.set(vin, car);
    }

    for (const [key, attribute] of Object.entries(attributes)) {
      if (hidden(key) || !attribute || typeof attribute !== 'object') continue;

      const unitField = attribute.displayUnit;
      const ms = Number(attribute.timestampInMs) || Number(attribute.timestamp) * 1000 || 0;

      car.set(key, {
        value: blankVin(readValue(attribute)),
        display: blankVin(attribute.displayValue) || undefined,
        unit: unitField ? attribute[unitField] : undefined,
        status: attribute.status,
        statusMeaning: STATUS[attribute.status],
        reported: ms ? new Date(ms).toISOString() : undefined,
        source,
      });
    }
  }

  /** Every car, numbered rather than named, fields in alphabetical order. */
  cars() {
    return [...this._cars.values()].map((car) => Object.fromEntries(
      [...car.entries()].sort(([a], [b]) => a.localeCompare(b)),
    ));
  }
}

module.exports = { AttributeSnapshot };
