import { ElementRef } from '@angular/core';
import { Map as OlMap } from 'ol';
import Attribution from 'ol/control/Attribution';
import Rotate from 'ol/control/Rotate';
import Zoom from 'ol/control/Zoom';
import { OpenLayersService } from '../../../auxiliares/servicios/openLayers.service';
import { DashboardDistribuidorComponent } from './dashboard.component';

describe('Advisor dashboard map attribution', () => {
  let host: HTMLDivElement;
  let component: DashboardDistribuidorComponent;
  let map: OlMap;

  beforeEach(() => {
    host = document.createElement('div');
    host.style.cssText = 'position:relative;width:390px;height:300px';
    document.body.appendChild(host);

    // Keep the real sources and their attribution metadata, without requesting tiles.
    const satellite = OpenLayersService.mapTileSatelite(17);
    const places = OpenLayersService.mapReferenciasPoliticas();
    satellite.getSource()!.setTileUrlFunction(() => undefined);
    places.getSource()!.setTileUrlFunction(() => undefined);
    spyOn(OpenLayersService, 'mapTileSatelite').and.returnValue(satellite);
    spyOn(OpenLayersService, 'mapReferenciasPoliticas').and.returnValue(places);

    component = new DashboardDistribuidorComponent(
      {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
    );
    (component as any).networkMap = new ElementRef(host);
    (component as any).inicializarMapa();
    map = (component as any).map;
  });

  afterEach(() => {
    component.ngOnDestroy();
    map.dispose();
    host.remove();
  });

  async function renderMap(): Promise<void> {
    // Wait for the dashboard's deferred size update and OpenLayers' async credits.
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    map.updateSize();
    map.renderSync();
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }

  it('preserves zoom, rotation, layers and the existing view without duplicate credits', async () => {
    await renderMap();
    const controls = map.getControls().getArray();
    expect(controls.filter(control => control instanceof Attribution).length).toBe(1);
    expect(controls.filter(control => control instanceof Zoom).length).toBe(1);
    expect(controls.filter(control => control instanceof Rotate).length).toBe(1);
    expect(map.getLayers().getLength()).toBe(4);
    expect(map.getView().getZoom()).toBe(5);
    expect(map.getView().getMinZoom()).toBe(3);
    expect(map.getView().getMaxZoom()).toBe(18);
    expect(OpenLayersService.mapTileSatelite).toHaveBeenCalledOnceWith(17);
    (component as any).inicializarMapa();
    expect((component as any).map).toBe(map);
    expect(host.querySelectorAll('.ol-attribution').length).toBe(1);
  });

  for (const width of [320, 390, 1024]) {
    it(`renders compact linked names and accessible full credits at ${width}px`, async () => {
      host.style.width = `${width}px`;
      await renderMap();
      const attribution = map.getControls().getArray()
        .find(control => control instanceof Attribution) as Attribution;
      // The OSM-based satellite source declares non-collapsible credits; our explicit
      // control must still stay compact after rendering and retain the full text.
      expect(OpenLayersService.mapTileSatelite(17).getSource()!.getAttributionsCollapsible()).toBeFalse();
      expect(attribution.getCollapsible()).toBeTrue();
      expect(attribution.getCollapsed()).toBeTrue();
      const element = host.querySelector<HTMLElement>('.chaman-map-attribution')!;
      expect(element).not.toBeNull();
      expect(Array.from(element.querySelectorAll('.map-credit-short')).map(el => el.textContent))
        .toEqual(['Esri', '© OpenStreetMap']);
      expect(element.querySelector('a[href="https://www.openstreetmap.org/copyright"]')).not.toBeNull();
      const detail = element.querySelector<HTMLElement>('.map-credit-detail')!;
      expect(getComputedStyle(detail).display).toBe('none');
      const rect = element.getBoundingClientRect();
      expect(rect.height).toBeLessThanOrEqual(28);
      expect(rect.width).toBeLessThan(240);
      expect(rect.left - host.getBoundingClientRect().left).toBe(6);

      const button = element.querySelector<HTMLButtonElement>('button')!;
      button.click();
      expect(attribution.getCollapsed()).toBeFalse();
      expect(button.getAttribute('aria-expanded')).toBe('true');
      expect(getComputedStyle(detail).display).not.toBe('none');
      for (const provider of ['Vantor', 'Earthstar Geographics', 'HERE', 'Garmin', 'OpenStreetMap contributors']) {
        expect(element.textContent).toContain(provider);
      }
      expect(element.scrollWidth).toBeLessThanOrEqual(element.clientWidth);
      button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(attribution.getCollapsed()).toBeTrue();
      expect(button.getAttribute('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(button);
    });
  }
});
