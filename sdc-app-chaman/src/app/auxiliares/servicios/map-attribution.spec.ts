import { mapAttributionControls, ESRI_IMAGERY_ATTRIBUTION, ESRI_PLACES_ATTRIBUTION } from './map-attribution';
describe('Map provider attribution', () => {
  it('creates independent compact attribution controls', () => {
    const a = mapAttributionControls()[0];
    const b = mapAttributionControls()[0];
    expect(a).not.toBe(b);
    expect(a.getCollapsible()).toBeTrue();
    expect(a.getCollapsed()).toBeTrue();
    expect(a.getElement().classList).toContain('chaman-map-attribution');
    expect(a.getElement().querySelector('button')?.title).toBe('Créditos y licencias del mapa');
  });
  it('does not give either icon the attribution container class', () => {
    const control = mapAttributionControls()[0];
    const button = control.getElement().querySelector('button')!;
    expect(button.firstElementChild?.className).toBe('chaman-map-credit-expand');
    button.click();
    expect(button.firstElementChild?.className).toBe('chaman-map-credit-collapse');
  });
  it('credits imagery separately from the open-source map library', () => {
    expect(ESRI_IMAGERY_ATTRIBUTION).toContain('Vantor');
    expect(ESRI_IMAGERY_ATTRIBUTION).toContain('Earthstar Geographics');
    expect(ESRI_PLACES_ATTRIBUTION).toContain('OpenStreetMap contributors');
  });
  it('keeps linked names in the compact view and every credit in the detail', () => {
    const credits = document.createElement('div');
    credits.innerHTML = ESRI_IMAGERY_ATTRIBUTION + ESRI_PLACES_ATTRIBUTION;
    const names = Array.from(credits.querySelectorAll('.map-credit-short')).map((e) => e.textContent);
    expect(names).toEqual(['Esri', '© OpenStreetMap']);
    expect(credits.querySelector('.map-credit-short a[href="https://www.openstreetmap.org/copyright"]')).not.toBeNull();
    const detail = Array.from(credits.querySelectorAll('.map-credit-detail'))
      .map((e) => e.textContent)
      .join(' ');
    for (const name of [
      'Powered by Esri',
      'Vantor',
      'Earthstar Geographics',
      'HERE',
      'Garmin',
      'OpenStreetMap contributors',
      'GIS User Community',
    ]) {
      expect(detail).toContain(name);
    }
  });
  it('expands with the button and closes with Escape independently of other maps', () => {
    const a = mapAttributionControls()[0];
    const b = mapAttributionControls()[0];
    const button = a.getElement().querySelector('button')!;
    button.click();
    expect(a.getCollapsed()).toBeFalse();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(b.getCollapsed()).toBeTrue();
    a.getElement().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(a.getCollapsed()).toBeTrue();
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });
  for (const width of [320, 390, 1024]) {
    it(`keeps credits legible and clear of the menu at ${width}px`, () => {
      const host = document.createElement('div');
      host.style.cssText = `position:relative;width:${width}px;height:250px`;
      const control = mapAttributionControls()[0];
      const element = control.getElement();
      element.querySelector('ul')!.innerHTML =
        `<li>${ESRI_IMAGERY_ATTRIBUTION}</li><li>${ESRI_PLACES_ATTRIBUTION}</li>`;
      host.appendChild(element);
      document.body.appendChild(host);
      try {
        const rect = element.getBoundingClientRect();
        const mapRect = host.getBoundingClientRect();
        expect(rect.height).toBeLessThanOrEqual(28);
        expect(rect.width).toBeLessThan(240);
        expect(rect.left - mapRect.left).toBe(6);
        expect(mapRect.right - rect.right).toBeGreaterThanOrEqual(78);
        expect(getComputedStyle(element.querySelector('ul')!).display).not.toBe('none');
        expect(getComputedStyle(element.querySelector('ul')!).fontSize).toBe('12px');
        expect(getComputedStyle(element.querySelector('.map-credit-detail')!).display).toBe('none');
        const button = element.querySelector('button')!;
        const icon = button.firstElementChild!;
        expect(getComputedStyle(icon).display).toBe('inline');
        expect(icon.getBoundingClientRect().width).toBeGreaterThan(8);
        expect(icon.getBoundingClientRect().right).toBeLessThanOrEqual(button.getBoundingClientRect().right);
        control.setCollapsed(false);
        expect(getComputedStyle(element.querySelector('.map-credit-detail')!).display).not.toBe('none');
        expect(element.scrollWidth).toBeLessThanOrEqual(element.clientWidth);
      } finally {
        host.remove();
        control.dispose();
      }
    });
  }
});
