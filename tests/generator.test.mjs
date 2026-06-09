import { test } from 'node:test';
import assert from 'node:assert/strict';
import pkg from '@usebruno/lang';
import { generateBruFile } from '../dist/bruno/generator.js';

const { bruToJsonV2 } = pkg;

test('generated values are unquoted Bruno format (round-trips cleanly)', () => {
  const bru = generateBruFile({
    meta: { name: 'Get User', type: 'http', seq: 1 },
    http: { method: 'GET', url: 'https://api.example.com/u/{{id}}', body: 'none', auth: 'none' }
  });
  // No single-quote wrapping around the name/url.
  assert.match(bru, /name: Get User\n/);
  assert.doesNotMatch(bru, /name: 'Get User'/);

  const parsed = bruToJsonV2(bru);
  assert.equal(parsed.meta.name, 'Get User');
  assert.equal(parsed.http.url, 'https://api.example.com/u/{{id}}');
});

test("a value containing ''' no longer corrupts the file (regression)", () => {
  // Previously this produced a file Bruno's parser REJECTED.
  const bru = generateBruFile({
    meta: { name: "Quote''' test", type: 'http' },
    http: { method: 'GET', url: "http://x'''it", body: 'none', auth: 'none' }
  });
  const parsed = bruToJsonV2(bru); // must not throw
  assert.equal(parsed.http.url, "http://x'''it");
  assert.equal(parsed.meta.name, "Quote''' test");
});

test('bearer auth is serialized into a parseable auth:bearer block', () => {
  const bru = generateBruFile({
    meta: { name: 'r', type: 'http' },
    http: { method: 'GET', url: 'http://x', body: 'none', auth: 'bearer' },
    auth: { type: 'bearer', bearer: { token: '{{token}}' } }
  });
  const parsed = bruToJsonV2(bru);
  assert.deepEqual(parsed.auth, { bearer: { token: '{{token}}' } });
});

test('api-key auth maps to apikey block with placement', () => {
  const bru = generateBruFile({
    meta: { name: 'r', type: 'http' },
    http: { method: 'GET', url: 'http://x', body: 'none', auth: 'api-key' },
    auth: { type: 'api-key', apikey: { key: 'X-API-Key', value: '{{k}}', in: 'header' } }
  });
  const parsed = bruToJsonV2(bru);
  assert.equal(parsed.auth.apikey.key, 'X-API-Key');
  assert.equal(parsed.auth.apikey.value, '{{k}}');
  assert.equal(parsed.auth.apikey.placement, 'header');
});

test('json body is preserved verbatim through round-trip', () => {
  const content = '{\n  "name": "abc",\n  "n": 1\n}';
  const bru = generateBruFile({
    meta: { name: 'r', type: 'http' },
    http: { method: 'POST', url: 'http://x', body: 'json', auth: 'none' },
    body: { type: 'json', content }
  });
  const parsed = bruToJsonV2(bru);
  assert.equal(parsed.body.json, content);
});

test('a body that tries to inject a sibling block stays contained in the value', () => {
  // The injected script:pre-request must remain part of the body text, not
  // become an executable block.
  const malicious = '{}\n}\n\nscript:pre-request {\n  evil()\n';
  const bru = generateBruFile({
    meta: { name: 'r', type: 'http' },
    http: { method: 'POST', url: 'http://x', body: 'json', auth: 'none' },
    body: { type: 'json', content: malicious }
  });
  const parsed = bruToJsonV2(bru);
  // The whole payload is captured as the body value; there is no script block.
  assert.ok(parsed.body.json.includes('script:pre-request'));
  assert.equal(parsed.script, undefined);
});

test('invalid URL is rejected by validation', () => {
  assert.throws(
    () => generateBruFile({
      meta: { name: 'r', type: 'http' },
      http: { method: 'GET', url: 'not a url at all', body: 'none', auth: 'none' }
    }),
    /Invalid URL/
  );
});
