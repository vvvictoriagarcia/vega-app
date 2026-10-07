import { describe, expect, it } from 'vitest';

import {
  inviteRedirectUrl,
  isPlatformAdmin,
  parseAdminEmails,
  validateNewClient,
} from './platform-admin';

describe('parseAdminEmails', () => {
  it('splits on commas, spaces and semicolons, lowercases, drops junk', () => {
    expect([...parseAdminEmails(' Vic@Example.com, ana@x.com;bob@y.com  nope ')]).toEqual([
      'vic@example.com',
      'ana@x.com',
      'bob@y.com',
    ]);
  });
  it('is empty for missing config', () => {
    expect(parseAdminEmails(undefined).size).toBe(0);
    expect(parseAdminEmails('').size).toBe(0);
  });
});

describe('isPlatformAdmin', () => {
  const list = 'vic@example.com, ana@x.com';
  it('matches case-insensitively', () => {
    expect(isPlatformAdmin('VIC@example.com', list)).toBe(true);
  });
  it('rejects others, empty email and empty config', () => {
    expect(isPlatformAdmin('mallory@x.com', list)).toBe(false);
    expect(isPlatformAdmin(null, list)).toBe(false);
    expect(isPlatformAdmin('vic@example.com', '')).toBe(false);
  });
  it('does not match a partial address', () => {
    expect(isPlatformAdmin('ic@example.com', list)).toBe(false);
  });
});

describe('validateNewClient', () => {
  it('normalizes a valid form', () => {
    expect(validateNewClient({ businessName: '  Inmobiliaria   del Centro ', ownerEmail: ' Duenio@Negocio.com ' })).toEqual({
      ok: true,
      value: { businessName: 'Inmobiliaria del Centro', ownerEmail: 'duenio@negocio.com' },
    });
  });
  it.each([
    [{ businessName: 'A', ownerEmail: 'a@b.co' }, 'business_name'],
    [{ businessName: 'x'.repeat(121), ownerEmail: 'a@b.co' }, 'business_name'],
    [{ businessName: 'Bar', ownerEmail: 'not-an-email' }, 'owner_email'],
    [{ businessName: 'Bar' }, 'owner_email'],
    [null, 'business_name'],
  ])('rejects %j with %s', (body, error) => {
    expect(validateNewClient(body)).toEqual({ ok: false, error });
  });
});

describe('inviteRedirectUrl', () => {
  it('lands on the callback and then the set-password page', () => {
    expect(inviteRedirectUrl('https://app.vega.com/')).toBe(
      'https://app.vega.com/auth/callback?next=%2Freset-password',
    );
  });
});
