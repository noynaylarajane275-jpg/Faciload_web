/**
 * Module — chunk duration math (the sidebar duration picker's pure core).
 * Covers the 0.5h stepping, the "never exceed remaining hours" clamp, the
 * "0/negative = invalid (drag disabled)" marker, and label formatting.
 */
import { describe, expect, it } from 'vitest';
import {
  CHUNK_STEP_HOURS,
  MAX_LAB_BLOCK_HOURS,
  MAX_LECTURE_BLOCK_HOURS,
  MIN_CHUNK_HOURS,
  blockCapFor,
  clampChunkHours,
  defaultChunkHours,
  formatHours,
  isChunkDurationValid,
  stepChunkHours,
} from './schedule-duration';
import {
  DAY_END_HOUR,
  DAY_START_HOUR,
  GRID_HEIGHT,
  HALF_HOUR_HEIGHT,
  halfHourRows,
  rangeLabel,
} from './schedule-time';

describe('schedule-time — halfHourRows / rangeLabel (time gutter)', () => {
  it('produces one row per half hour across the whole grid', () => {
    const rows = halfHourRows();
    expect(rows).toHaveLength((DAY_END_HOUR - DAY_START_HOUR) * 2);
  });

  it('labels each row with its full start - end span in 12-hour time', () => {
    const rows = halfHourRows();
    expect(rangeLabel(rows[0])).toBe('7:00 - 7:30 AM');
    expect(rangeLabel(rows[1])).toBe('7:30 - 8:00 AM');
    const last = rows[rows.length - 1];
    expect(rangeLabel(last)).toBe('7:30 - 8:00 PM');
  });

  it('marks both ends when a range crosses noon, so it cannot be misread', () => {
    // "11:30 - 12:00 AM" would read as a morning slot; the marker on each end
    // is what keeps it unambiguous.
    const rows = halfHourRows();
    const noon = rows.find((row) => row.startShort === '11:30' && row.period === 'AM');
    expect(noon).toBeDefined();
    expect(rangeLabel(noon!)).toBe('11:30 AM - 12:00 PM');
  });

  it('never uses 24-hour time in the gutter', () => {
    for (const row of halfHourRows()) {
      expect(row.startShort).toMatch(/^\d{1,2}:\d{2}$/);
      expect(row.endShort).toMatch(/^\d{1,2}:\d{2}$/);
      // 13:00, 07:00 etc. must not reach the label.
      expect(Number(row.startShort.split(':')[0])).toBeLessThanOrEqual(12);
      expect(Number(row.endShort.split(':')[0])).toBeLessThanOrEqual(12);
    }
  });

  it('chains end-to-start with no gaps across an hour boundary', () => {
    const rows = halfHourRows();
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i].startShort).toBe(rows[i - 1].endShort);
    }
  });

  it('keeps every label short enough to render on one line', () => {
    // Guards the regression where the range wrapped to two lines and the labels
    // drifted out of alignment with their rows.
    for (const row of halfHourRows()) {
      expect(rangeLabel(row).length).toBeLessThanOrEqual(24);
    }
  });

  it('spans the grid height exactly, so the gutter stays aligned to the cells', () => {
    expect(halfHourRows().length * HALF_HOUR_HEIGHT).toBe(GRID_HEIGHT);
  });
});

describe('schedule-duration — clampChunkHours', () => {
  it('keeps a legal duration untouched', () => {
    expect(clampChunkHours(1.5, 3)).toBe(1.5);
    expect(clampChunkHours(3, 3)).toBe(3);
  });

  it('clamps an over-remaining entry down to the remaining hours', () => {
    expect(clampChunkHours(5, 1.5)).toBe(1.5);
    expect(clampChunkHours(2.5, 2)).toBe(2);
  });

  it('bumps a below-minimum entry up to the 0.5h floor (when remaining allows)', () => {
    expect(clampChunkHours(0.25, 3)).toBe(MIN_CHUNK_HOURS);
  });

  it('caps to a remaining tail smaller than the floor instead of overshooting it', () => {
    expect(clampChunkHours(2, 0.25)).toBe(0.25);
    expect(clampChunkHours(0.5, 0.25)).toBe(0.25);
  });

  it('maps non-numeric, zero and negative entries to the invalid 0 marker', () => {
    expect(clampChunkHours(Number.NaN, 3)).toBe(0);
    expect(clampChunkHours(0, 3)).toBe(0);
    expect(clampChunkHours(-1, 3)).toBe(0);
    expect(clampChunkHours(3, 0)).toBe(0);
  });
});

describe('schedule-duration — stepChunkHours (0.5h stepper)', () => {
  it('steps up and down by half an hour', () => {
    expect(CHUNK_STEP_HOURS).toBe(0.5);
    expect(stepChunkHours(2, 1, 3)).toBe(2.5);
    expect(stepChunkHours(2.5, -1, 3)).toBe(2);
  });

  it('never steps past the remaining hours (clamped, not wrapped)', () => {
    expect(stepChunkHours(2.5, 1, 3)).toBe(3);
    expect(stepChunkHours(3, 1, 3)).toBe(3);
  });

  it('never steps below the 0.5h minimum', () => {
    expect(stepChunkHours(0.5, -1, 3)).toBe(0.5);
  });

  it('recovers from the invalid 0 marker back to a legal duration', () => {
    expect(stepChunkHours(0, 1, 3)).toBe(0.5);
    expect(stepChunkHours(0, -1, 3)).toBe(0);
  });

  it('steps without float dust (3 - 0.5 stays 2.5, not 2.4999…)', () => {
    expect(stepChunkHours(3, -1, 3)).toBe(2.5);
    expect(stepChunkHours(0.5, 1, 3)).toBe(1);
  });
});

describe('schedule-duration — validity + labels', () => {
  it('marks 0 (or anything invalid) as undraggable and clamped values as valid', () => {
    expect(isChunkDurationValid(1.5, 3)).toBe(true);
    expect(isChunkDurationValid(3, 3)).toBe(true);
    expect(isChunkDurationValid(0, 3)).toBe(false);
    expect(isChunkDurationValid(-1, 3)).toBe(false);
    expect(isChunkDurationValid(Number.NaN, 3)).toBe(false);
  });

  it('formats whole hours without a trailing .0 and halves with one decimal', () => {
    expect(formatHours(3)).toBe('3');
    expect(formatHours(1.5)).toBe('1.5');
    expect(formatHours(0.5)).toBe('0.5');
    expect(formatHours(0)).toBe('0');
    // Float-dust tolerance: 1.5 + 1.5 - 3 style artifacts stay clean.
    expect(formatHours(0.1 + 0.2)).toBe('0.3');
  });
});

describe('schedule-duration — single-meeting block caps (LEC ≤ 2h, LAB ≤ 3h)', () => {
  it('maps each session type to its one-block cap', () => {
    expect(MAX_LECTURE_BLOCK_HOURS).toBe(2);
    expect(MAX_LAB_BLOCK_HOURS).toBe(3);
    expect(blockCapFor('LECTURE')).toBe(2);
    expect(blockCapFor('LAB')).toBe(3);
  });

  it('clamps a requested duration to the cap even when more hours remain', () => {
    expect(clampChunkHours(3, 4, 2)).toBe(2); // LECTURE cap binds first
    expect(clampChunkHours(4, 4, 3)).toBe(3); // LAB cap binds first
    expect(clampChunkHours(1.5, 4, 2)).toBe(1.5); // under the cap: untouched
  });

  it('defaults the picker to one meeting’s worth, not the whole weekly remainder', () => {
    expect(defaultChunkHours(4, 'LECTURE')).toBe(2);
    expect(defaultChunkHours(4, 'LAB')).toBe(3);
    expect(defaultChunkHours(1, 'LECTURE')).toBe(1); // smaller remaining wins
    expect(defaultChunkHours(0, 'LAB')).toBe(0); // nothing left → invalid marker
  });

  it('never steps past the cap', () => {
    expect(stepChunkHours(1.5, 1, 4, 2)).toBe(2);
    expect(stepChunkHours(2, 1, 4, 2)).toBe(2); // clamped, not wrapped
    expect(stepChunkHours(2.5, 1, 4, 3)).toBe(3);
  });

  it('treats capped values as valid — an over-cap entry clamps instead of erroring', () => {
    expect(isChunkDurationValid(2, 4, 2)).toBe(true);
    expect(isChunkDurationValid(3, 4, 2)).toBe(true); // clamps to 2, still placeable
    expect(isChunkDurationValid(0, 4, 2)).toBe(false); // 0 marker keeps dragging off
  });
});
