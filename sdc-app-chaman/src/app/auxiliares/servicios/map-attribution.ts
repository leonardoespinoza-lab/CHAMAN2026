import Attribution from 'ol/control/Attribution';

// Credits from the providers' public MapServer metadata, checked 2026-09-07.
// OpenLayers' BSD license does not replace the imagery/data providers' terms.
export const ESRI_IMAGERY_ATTRIBUTION =
  'Source: <a href="https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer" target="_blank" rel="noopener noreferrer">Esri</a>, Vantor, Earthstar Geographics, and the GIS User Community';
export const ESRI_PLACES_ATTRIBUTION =
  'Esri, HERE, Garmin, © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>, and the GIS user community';

// A control must belong to just one map; never share an instance.
export function mapAttributionControls(): Attribution[] {
  return [new Attribution({ collapsible: false })];
}
