import { describe, expect, it } from 'vitest';
import { isUncovered } from './coverage';
import type { PersonRef } from './identity';

const austin: PersonRef = { userId: 'user_austin', displayName: 'Austin' };
const karey: PersonRef = { userId: 'user_karey', displayName: 'Karey' };
const sam: PersonRef = { userId: 'user_sam', displayName: 'Sam' };

describe('isUncovered', () => {
  it('is false for a claimed shift, whatever the declines say', () => {
    const event = { status: 'claimed', declined_by_ids: ['user_austin', 'user_karey'] };
    expect(isUncovered(event, [austin, karey])).toBe(false);
  });

  it('is false while somebody has not answered', () => {
    const event = { status: 'open', declined_by_ids: ['user_austin'] };
    expect(isUncovered(event, [austin, karey])).toBe(false);
  });

  it('is true once every driver has declined', () => {
    const event = { status: 'open', declined_by_ids: ['user_austin', 'user_karey'] };
    expect(isUncovered(event, [austin, karey])).toBe(true);
  });

  it('counts declines recorded before the migration, by name', () => {
    const event = { status: 'open', declined_by: ['Austin', 'Karey'], declined_by_ids: [] };
    expect(isUncovered(event, [austin, karey])).toBe(true);
  });

  it('counts a mix of legacy and migrated declines', () => {
    const event = { status: 'open', declined_by: ['Karey'], declined_by_ids: ['user_austin'] };
    expect(isUncovered(event, [austin, karey])).toBe(true);
  });

  it('still counts the decline of someone who has since renamed themselves', () => {
    const event = { status: 'open', declined_by: ['Austin'], declined_by_ids: ['user_karey'] };
    const renamedKarey = { ...karey, displayName: 'Kay' };
    expect(isUncovered(event, [austin, renamedKarey])).toBe(true);
  });

  it('does not let a departed driver stand in for a current one', () => {
    // Sam is new and has not answered; the old decline must not cover for them.
    const event = { status: 'open', declined_by_ids: ['user_austin', 'user_gone'] };
    expect(isUncovered(event, [austin, sam])).toBe(false);
  });

  it('is false when there are no drivers at all', () => {
    // Otherwise `every` on an empty list would report every shift uncovered.
    expect(isUncovered({ status: 'open', declined_by_ids: [] }, [])).toBe(false);
  });

  it('handles missing decline columns', () => {
    expect(isUncovered({ status: 'open' }, [austin])).toBe(false);
    expect(isUncovered({ status: 'open', declined_by: null, declined_by_ids: null }, [austin])).toBe(
      false,
    );
  });
});
