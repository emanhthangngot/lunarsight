import { ArrowLeftRight, Clock3, Eye, Info, MapPin, Rocket, ScanLine, Activity, type LucideIcon } from 'lucide-react';

export type FeatureId = 'sites' | 'ground' | 'timeline' | 'summary' | 'compare' | 'landing' | 'horizon' | 'provenance';

const FEATURES: { id: FeatureId; icon: LucideIcon; title: string; text: string }[] = [
  { id: 'sites', icon: MapPin, title: 'Pick a landing site', text: '15 south-polar candidates on 3D terrain.' },
  { id: 'landing', icon: Rocket, title: 'Play landing', text: 'Watch a lander touch down, with Sun ray and Earth link.' },
  { id: 'ground', icon: Eye, title: 'Ground view', text: 'Stand on the site and look around.' },
  { id: 'timeline', icon: Clock3, title: 'Play the timeline', text: 'See Sun and Earth rise and set over the window.' },
  { id: 'summary', icon: Activity, title: 'Site summary', text: 'Sunlit hours, longest darkness, Earth-visible hours.' },
  { id: 'compare', icon: ArrowLeftRight, title: 'Compare two sites', text: 'Same window, side by side.' },
  { id: 'horizon', icon: ScanLine, title: 'Sky & horizon chart', text: 'Terrain skyline with Sun and Earth paths.' },
  { id: 'provenance', icon: Info, title: 'Data provenance', text: 'Sources, conventions and limits.' },
];

/** One-tap tour: each entry closes the guide and opens that feature. */
export function FeatureGuide({ onOpen }: { onOpen(feature: FeatureId): void }) {
  return <ul className="feature-guide">
    {FEATURES.map(({ id, icon: Icon, title, text }) => <li key={id}>
      <button type="button" onClick={() => onOpen(id)}><Icon size={20} aria-hidden="true" /><span><strong>{title}</strong><small>{text}</small></span></button>
    </li>)}
  </ul>;
}
