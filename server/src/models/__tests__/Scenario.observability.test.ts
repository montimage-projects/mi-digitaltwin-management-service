import { describe, expect, test } from 'vitest';
import { Types } from 'mongoose';
import { Scenario } from '../Scenario.js';

describe('Scenario.observability', () => {
  const base = { projectId: new Types.ObjectId(), title: 'T' };

  test('defaults to on for a new scenario', () => {
    expect(new Scenario(base).observability).toBe(true);
  });

  test('keeps an explicit opt-out', () => {
    expect(new Scenario({ ...base, observability: false }).observability).toBe(false);
  });
});
