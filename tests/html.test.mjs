// Inline <script> blocks aren't loaded by any other unit test; a syntax error in one
// silently kills the page (the admin review page shipped like that once).
// Run: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';

const PUBLIC = new URL('../public/', import.meta.url);

function htmlFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return htmlFiles(new URL(`${e.name}/`, dir));
    return e.name.endsWith('.html') ? [new URL(e.name, dir)] : [];
  });
}

for (const file of htmlFiles(PUBLIC)) {
  const name = file.pathname.slice(PUBLIC.pathname.length);
  test(`inline scripts parse: ${name}`, () => {
    const html = readFileSync(file, 'utf8');
    // classic inline scripts only (no src, not modules or JSON-LD)
    const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*type="(?:module|application\/ld\+json)")[^>]*>([\s\S]*?)<\/script>/g)];
    for (const [, code] of scripts) {
      assert.doesNotThrow(() => new vm.Script(code, { filename: name }), name);
    }
  });
}
