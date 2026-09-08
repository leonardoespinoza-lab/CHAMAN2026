import { mapAttributionControls, ESRI_IMAGERY_ATTRIBUTION, ESRI_PLACES_ATTRIBUTION } from './map-attribution';
describe('Map provider attribution', () => {
  it('creates independent, always visible attribution controls', () => {
    const a = mapAttributionControls()[0];
    const b = mapAttributionControls()[0];
    expect(a).not.toBe(b);
    expect(a.getCollapsible()).toBeFalse();
    expect(a.getCollapsed()).toBeFalse();
  });
  it('credits imagery separately from the open-source map library', () => {
    expect(ESRI_IMAGERY_ATTRIBUTION).toContain('Vantor');
    expect(ESRI_IMAGERY_ATTRIBUTION).toContain('Earthstar Geographics');
    expect(ESRI_PLACES_ATTRIBUTION).toContain('OpenStreetMap contributors');
  });
});
