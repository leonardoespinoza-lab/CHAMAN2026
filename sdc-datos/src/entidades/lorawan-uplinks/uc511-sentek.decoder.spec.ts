import { decodeUc511SentekPayload } from './uc511-sentek.decoder';

describe('decodeUc511SentekPayload', () => {
  it('decodes analog water table and SDI-12 soil blocks', () => {
    const analog =
      '03 00 00 04 00 00 05 e2 9c 48 9c 48 9c 48 9c 48';
    const sdi12 =
      '08 db 00 30 2b 33 34 2e 34 30 32 31 36 2b 33 39 2e 33 34 30 37 38 2b 33 39 2e 39 39 39 38 30 0d 0a';

    const decoded = decodeUc511SentekPayload(`${analog} ${sdi12}`);

    expect(decoded).not.toBeNull();
    expect(decoded?.analog.rawMa).toBeCloseTo(9.219, 3);
    expect(decoded?.analog.waterTableDepthM).toBeCloseTo(3.26, 2);
    expect(decoded?.soil.moisture['10cm']).toBeCloseTo(34.40216, 5);
    expect(decoded?.soil.moisture['20cm']).toBeCloseTo(39.34078, 5);
    expect(decoded?.soil.moisture['30cm']).toBeCloseTo(39.9998, 5);
  });

  it('accepts compact hex and ignores missing blocks', () => {
    const decoded = decodeUc511SentekPayload(
      '08db08302b31322e352b31332e352b31342e350d0a',
    );

    expect(decoded).not.toBeNull();
    expect(decoded?.soil.temperature['10cm']).toBe(12.5);
    expect(decoded?.soil.temperature['20cm']).toBe(13.5);
    expect(decoded?.soil.temperature['30cm']).toBe(14.5);
    expect(decoded?.soil.moisture['10cm']).toBeUndefined();
  });
});
