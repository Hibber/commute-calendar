import { describe, expect, it } from 'vitest';
import { personInList, rowBelongsTo, type PersonRef } from './identity';

const austin: PersonRef = { userId: 'user_austin', displayName: 'Austin' };
const karey: PersonRef = { userId: 'user_karey', displayName: 'Karey' };

describe('rowBelongsTo', () => {
  it('matches on the id when the row has one', () => {
    expect(rowBelongsTo({ ownerId: 'user_austin', ownerName: 'Austin' }, austin)).toBe(true);
  });

  it('falls back to the name for rows written before the migration', () => {
    expect(rowBelongsTo({ ownerId: null, ownerName: 'Austin' }, austin)).toBe(true);
  });

  it('still matches after a rename, because the id is what is stored', () => {
    const renamed = { ...austin, displayName: 'Augustine' };
    expect(rowBelongsTo({ ownerId: 'user_austin', ownerName: 'Austin' }, renamed)).toBe(true);
  });

  it('ignores the name once the row has an id', () => {
    // Someone new taking the name "Austin" must not inherit the real Austin's
    // claims -- this is the whole point of keying on the id.
    const impostor: PersonRef = { userId: 'user_new', displayName: 'Austin' };
    expect(rowBelongsTo({ ownerId: 'user_austin', ownerName: 'Austin' }, impostor)).toBe(false);
  });

  it('does not match a different person', () => {
    expect(rowBelongsTo({ ownerId: 'user_austin', ownerName: 'Austin' }, karey)).toBe(false);
  });

  it('treats an unowned row as belonging to nobody', () => {
    expect(rowBelongsTo({ ownerId: null, ownerName: null }, austin)).toBe(false);
  });
});

describe('personInList', () => {
  it('finds a person by id', () => {
    expect(personInList(['user_austin'], [], austin)).toBe(true);
  });

  it('finds a legacy entry by name', () => {
    expect(personInList([], ['Austin'], austin)).toBe(true);
  });

  it('finds a renamed person via their id, not their old name', () => {
    const renamed = { ...austin, displayName: 'Augustine' };
    expect(personInList(['user_austin'], ['Austin'], renamed)).toBe(true);
  });

  it('is false when neither key appears', () => {
    expect(personInList(['user_karey'], ['Karey'], austin)).toBe(false);
  });

  it('tolerates null lists', () => {
    expect(personInList(null, null, austin)).toBe(false);
    expect(personInList(undefined, ['Austin'], austin)).toBe(true);
  });
});
