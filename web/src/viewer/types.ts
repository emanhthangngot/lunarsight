import type { EphemerisSeries, HorizonMask, SiteSummary, TerrainSource } from '../data/contract';

export type CameraMode = 'orbital' | 'surface';

export interface BodyDirection {
  azDeg: number;
  elDeg: number;
  /** Body centre above the terrain horizon mask; null = unknown (e.g. no mask). */
  visible: boolean | null;
}

export interface LunarViewerProps {
  terrain: TerrainSource | null;
  sites: SiteSummary[];
  selectedSiteId: string | null;
  observerHeightM: number;
  cameraMode: CameraMode;
  /** At the current time cursor, for the selected site. */
  sun: BodyDirection | null;
  earth: BodyDirection | null;
  onSelectSite?(siteId: string): void;
}

export interface SkyHorizonViewProps {
  /** null → "horizon mask unavailable (outside coverage)". */
  mask: HorizonMask | null;
  ephemeris: EphemerisSeries | null;
  cursorIndex: number | null;
  observerHeightM: number;
}
