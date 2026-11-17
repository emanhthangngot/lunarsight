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
  /**
   * The user started the illustrative landing showcase. The App may move the time cursor
   * (the new `sun` / `earth` arrive as props) and explain it in `landingNote`.
   */
  onPlayLanding?(): void;
  /** Increment to start the landing view from outside the viewer (ignored until it can run). */
  landingRequest?: number;
  /** What the App did to the time cursor for the showcase, in plain words. */
  landingNote?: string | null;
  /** Already-computed site metrics shown after touchdown; null = no applied result. */
  landingSummary?: LandingSummary | null;
}

/** Preformatted by the App so the viewer never formats or derives scientific values. */
export interface LandingSummary {
  /** Site name. */
  title: string;
  meta: string;
  rows: { label: string; value: string }[];
}

export interface SkyHorizonViewProps {
  /** null → "horizon mask unavailable (outside coverage)". */
  mask: HorizonMask | null;
  ephemeris: EphemerisSeries | null;
  cursorIndex: number | null;
  observerHeightM: number;
}
