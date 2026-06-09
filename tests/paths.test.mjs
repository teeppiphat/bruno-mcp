import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { resolveWithin } from '../dist/bruno/paths.js';

test('resolveWithin allows a normal sub-path', () => {
  const out = resolveWithin('/base/coll', 'auth', 'login.bru');
  assert.equal(out, join('/base/coll', 'auth', 'login.bru'));
});

test('resolveWithin allows nested sub-folders', () => {
  const out = resolveWithin('/base/coll', 'a/b/c', 'x.bru');
  assert.equal(out, join('/base/coll', 'a/b/c', 'x.bru'));
});

test('resolveWithin allows the base itself', () => {
  assert.equal(resolveWithin('/base/coll'), join('/base/coll'));
});

test('resolveWithin REJECTS a ".." traversal escape', () => {
  assert.throws(
    () => resolveWithin('/base/coll', '../../etc', 'evil.bru'),
    /escapes its parent directory/
  );
});

test('resolveWithin REJECTS a bare ".." segment', () => {
  assert.throws(() => resolveWithin('/base/coll', '..'), /escapes its parent/);
});

test('resolveWithin REJECTS an absolute-path segment', () => {
  assert.throws(
    () => resolveWithin('/base/coll', '/etc/passwd'),
    /escapes its parent directory/
  );
});

test('resolveWithin REJECTS escape hidden after a valid prefix', () => {
  assert.throws(
    () => resolveWithin('/base/coll', 'ok/../../../../tmp/evil'),
    /escapes its parent directory/
  );
});
