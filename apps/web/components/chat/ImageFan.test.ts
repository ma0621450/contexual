import { describe, expect, it } from 'vitest';
import { fanLayout } from './ImageFan';

describe('fanLayout', () => {
  it('shows a single upright card', () => {
    const [slot] = fanLayout(1);
    expect(slot).toMatchObject({ rotate: 0, x: 0, y: 0 });
  });

  it('overlaps two cards with the second in front', () => {
    const slots = fanLayout(2);
    expect(slots).toHaveLength(2);
    expect(slots[0].rotate).toBeLessThan(0);
    expect(slots[1].z).toBeGreaterThan(slots[0].z);
    expect(slots[1].x).toBeGreaterThan(slots[0].x);
  });

  it('fans three cards around a front center card', () => {
    const slots = fanLayout(3);
    expect(slots.map((slot) => slot.rotate)).toEqual([-12, 0, 12]);
    expect(slots[1].z).toBeGreaterThan(slots[0].z);
    expect(slots[1].z).toBeGreaterThan(slots[2].z);
    expect(slots[0].x).toBeLessThan(slots[1].x);
    expect(slots[2].x).toBeGreaterThan(slots[1].x);
  });

  it('keeps the middle card in front when there are more than three', () => {
    const slots = fanLayout(5);
    const front = slots.reduce((best, slot) => (slot.z > best.z ? slot : best));
    expect(front).toBe(slots[2]);
    expect(slots[0].x).toBeLessThan(slots[2].x);
    expect(slots[4].x).toBeGreaterThan(slots[2].x);
  });
});
