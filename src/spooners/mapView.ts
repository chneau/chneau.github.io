/**
 * The site's default map viewport.
 *
 * Its own module, not part of `MapPanel`, because `appState.ts` reads it to
 * decide whether a URL describes the default view and the panel renders it as
 * Leaflet's initial `center`/`zoom`. Two callers on two sides of the component
 * boundary make it a shared constant, and a component module that exports a
 * plain value cannot be Fast-Refreshed without losing the map's state.
 */
export const UK_CENTER: [number, number] = [54.4, -3.2];
export const UK_ZOOM = 6;

/** Which markers the map draws: individual pubs, or one marker per area. */
export type MapView = "pubs" | "area";
