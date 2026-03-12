/// <reference types="node" />
// @vitest-environment node

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

describe('tailwind shared ui sources', () => {
  it('includes the shared ui package in Tailwind source scanning', () => {
    const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8');

    expect(css).toContain('@source "../../../../packages/ui/src";');
  });
});
