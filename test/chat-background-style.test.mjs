import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../src/pages/ChatPage.css', import.meta.url), 'utf8');

test('chat background keeps PixelBlast above the page overlay', () => {
  assert.match(css, /\.chat-page\s*>\s*\.pixel-blast[\s\S]*?z-index:\s*0/);
});

test('chat surfaces are transparent and do not use shadows', () => {
  assert.match(css, /\.chat-page__container\s*\{[\s\S]*?background:\s*transparent/);
  assert.match(css, /\.chat-page__message-text\s*\{[\s\S]*?background:\s*transparent/);
  assert.doesNotMatch(css, /box-shadow\s*:/);
});
