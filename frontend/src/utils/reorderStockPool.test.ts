import { describe, expect, it } from 'vitest';
import { reorderArray } from './reorderStockPool';

describe('reorderArray', () => {
  it('moves item from one index to another', () => {
    expect(reorderArray(['A', 'B', 'C'], 0, 2)).toEqual(['B', 'C', 'A']);
  });
});
