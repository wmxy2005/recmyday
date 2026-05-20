import { describe, expect, it } from 'vitest';

import { builtInRecordTypeColors, getRecordTypeSoftColor } from '@/utils/recordTypeColor';

describe('recordTypeColor', () => {
  it('uses the theme-aligned built-in record type palette', () => {
    expect(builtInRecordTypeColors).toEqual({
      work: '#4F7CFF',
      study: '#8B5CF6',
      exercise: '#12B8A6',
      rest: '#F2A53A',
      other: '#F05F93',
    });
  });

  it('creates a soft rgba color from a record type color', () => {
    expect(getRecordTypeSoftColor('#635BFF')).toBe('rgba(99,91,255,0.14)');
  });

  it('supports custom alpha values', () => {
    expect(getRecordTypeSoftColor('#14B8A6', 0.2)).toBe('rgba(20,184,166,0.2)');
  });

  it('falls back before creating a soft rgba color', () => {
    expect(getRecordTypeSoftColor('#000000')).toBe('rgba(99,91,255,0.14)');
  });
});
