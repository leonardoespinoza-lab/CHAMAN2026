import Attribution from 'ol/control/Attribution';

// Credits from the providers' public MapServer metadata, checked 2026-09-07.
// OpenLayers' BSD license does not replace the imagery/data providers' terms.
// Keep provider names visible; the information button reveals the full credits.
// https://developers.arcgis.com/documentation/esri-and-data-attribution/interactive-maps/
export const ESRI_IMAGERY_ATTRIBUTION =
  '<span class="map-credit-short"><a href="https://www.esri.com/" target="_blank" rel="noopener noreferrer">Esri</a></span>' +
  '<span class="map-credit-detail">Powered by <a href="https://www.esri.com/" target="_blank" rel="noopener noreferrer">Esri</a>. Source: <a href="https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer" target="_blank" rel="noopener noreferrer">Esri</a>, Vantor, Earthstar Geographics, and the GIS User Community</span>';
export const ESRI_PLACES_ATTRIBUTION =
  '<span class="map-credit-short">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a></span>' +
  '<span class="map-credit-detail">Esri, HERE, Garmin, © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>, and the GIS user community</span>';

class CompactMapAttribution extends Attribution {
  constructor() {
    super({
      className: 'ol-attribution chaman-map-attribution',
      collapsible: true,
      collapsed: true,
      label: 'ⓘ',
      collapseLabel: '×',
      tipLabel: 'Créditos y licencias del mapa',
    });
    this.element.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !this.getCollapsed()) {
        this.setCollapsed(true);
        this.element.querySelector('button')?.focus();
        event.stopPropagation();
      }
    });
  }

  getElement(): HTMLElement {
    return this.element;
  }
}

// A control must belong to just one map; never share an instance.
export function mapAttributionControls(): CompactMapAttribution[] {
  return [new CompactMapAttribution()];
}
