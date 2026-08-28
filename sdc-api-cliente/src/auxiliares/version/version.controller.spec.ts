import { buildReleaseMetadata } from 'modelos/src';

describe('release metadata contract', () => {
  it('exposes only normalized release fields', () => {
    expect(
      buildReleaseMetadata('sdc-api-cliente', {
        CHAMAN_RELEASE_SHA: '4BF3AF39643406F91CD74D902A3F71770C7C01FC',
        CHAMAN_RELEASE_VERSION: '2026.08.28-rc.1',
        CHAMAN_RELEASE_BUILT_AT: '2026-08-28T13:30:00-03:00',
        MONGO_URI: 'mongodb://secret-that-must-never-be-returned',
      }),
    ).toEqual({
      schemaVersion: 1,
      service: 'sdc-api-cliente',
      sha: '4bf3af39643406f91cd74d902a3f71770c7c01fc',
      version: '2026.08.28-rc.1',
      builtAt: '2026-08-28T16:30:00.000Z',
    });
  });

  it('fails closed without echoing invalid environment values', () => {
    expect(
      buildReleaseMetadata('sdc-api-cliente', {
        CHAMAN_RELEASE_SHA: 'not-a-sha;MONGO_URI=mongodb://secret',
        CHAMAN_RELEASE_VERSION: '<script>alert(1)</script>',
        CHAMAN_RELEASE_BUILT_AT: 'not-a-date',
      }),
    ).toEqual({
      schemaVersion: 1,
      service: 'sdc-api-cliente',
      sha: 'unknown',
      version: 'unknown',
      builtAt: 'unknown',
    });
  });

  it('uses a reproducible SOURCE_DATE_EPOCH fallback when builtAt is not explicit', () => {
    const epoch = '1787934600';
    expect(
      buildReleaseMetadata('sdc-api-cliente', {
        CHAMAN_RELEASE_SHA: '4bf3af39643406f91cd74d902a3f71770c7c01fc',
        CHAMAN_RELEASE_VERSION: '2026.08.28-rc.1',
        SOURCE_DATE_EPOCH: epoch,
      }).builtAt,
    ).toBe(new Date(Number(epoch) * 1000).toISOString());
  });
});
