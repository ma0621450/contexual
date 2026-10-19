import {
  generateUniqueOrganizationSlug,
  getSlugProblem,
  slugifyOrganizationName,
} from './onboarding.utils';
import {
  generateInviteEmailProof,
  verifyInviteEmailProof,
} from './invite-proof';

describe('workspace slugs', () => {
  it('slugifies names into URL-safe identifiers', () => {
    expect(slugifyOrganizationName('  Meher Design Co. ')).toBe(
      'meher-design-co',
    );
    expect(slugifyOrganizationName('a'.repeat(60))).toHaveLength(48);
  });

  it('validates format and reserved words', () => {
    expect(getSlugProblem('meher-design')).toBeNull();
    expect(getSlugProblem('dashboard')).toBe('reserved');
    expect(getSlugProblem('-meher')).toBe('invalid');
    expect(getSlugProblem('Meher')).toBe('invalid');
    expect(getSlugProblem('me')).toBe('invalid');
  });

  it('never suggests a reserved, invalid, or taken slug', async () => {
    const taken = new Set(['acme']);
    const fromTaken = await generateUniqueOrganizationSlug('Acme', (slug) =>
      Promise.resolve(taken.has(slug)),
    );
    expect(fromTaken).toMatch(/^acme-[0-9a-f]{6}$/);

    const fromReserved = await generateUniqueOrganizationSlug('Admin', () =>
      Promise.resolve(false),
    );
    expect(getSlugProblem(fromReserved)).toBeNull();

    const fromShort = await generateUniqueOrganizationSlug('X', () =>
      Promise.resolve(false),
    );
    expect(getSlugProblem(fromShort)).toBeNull();
  });
});

describe('invite email proof', () => {
  it('verifies only the exact emailed secret', () => {
    const { proof, hash } = generateInviteEmailProof();
    expect(proof.length).toBeGreaterThanOrEqual(43);
    expect(verifyInviteEmailProof(proof, hash)).toBe(true);
    expect(verifyInviteEmailProof(`${proof}x`, hash)).toBe(false);
    expect(verifyInviteEmailProof(undefined, hash)).toBe(false);
    expect(verifyInviteEmailProof(proof, null)).toBe(false);
  });
});
