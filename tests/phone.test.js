const assert = require('assert');
const phone = require('../js/phone.js');

const isos = phone.countries.map((c) => c.iso);
assert.strictEqual(new Set(isos).size, isos.length, 'country codes must be unique');
assert.ok(phone.countries.length >= 230, 'expected a full country list, got ' + phone.countries.length);
['US', 'CA', 'GB', 'BR', 'IN', 'CN', 'JP', 'ZA', 'NG', 'DE', 'FR', 'MX', 'AU', 'KR', 'ID'].forEach((iso) => {
  assert.ok(phone.byIso[iso], 'missing ' + iso);
});

assert.deepStrictEqual(phone.toE164('US', '(202) 555-0143'), { e164: '+12025550143' });
assert.deepStrictEqual(phone.toE164('US', '+1 202 555 0143'), { e164: '+12025550143' });
assert.deepStrictEqual(phone.toE164('GB', '07911 123456'), { e164: '+447911123456' });
assert.deepStrictEqual(phone.toE164('BR', '+55 11 91234-5678'), { e164: '+5511912345678' });
assert.ok(phone.toE164('US', '123').error);
assert.ok(phone.toE164('US', '+44 7911 123456').error);
assert.ok(phone.toE164('ZZ', '2025550143').error);

console.log('phone tests passed', phone.countries.length, 'countries');
