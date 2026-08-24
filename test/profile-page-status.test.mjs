import test from 'node:test';
import assert from 'node:assert/strict';
import { getInitialProfileApiStatus } from '../src/utils/profileStatus.js';

test('initial profile load failure falls back silently to local cache', () => {
  assert.equal(getInitialProfileApiStatus(false), null);
});

test('successful initial profile load reports the connected service', () => {
  assert.equal(getInitialProfileApiStatus(true), '已连接画像服务');
});
