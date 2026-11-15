import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Check, CornerDownLeft, MapPin, Search } from 'lucide-react';
import type { SiteSummary } from '../data/contract';
import { OverlayDialog } from './OverlayDialog';

export function SiteCommand({ open, onClose, sites, selectedSiteId, onChoose }: {
  open: boolean; onClose(): void; sites: SiteSummary[]; selectedSiteId: string | null; onChoose(site: SiteSummary): void;
}) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const options = useMemo(() => sites.filter((site) => (site.name + ' ' + site.category + ' ' + site.lonDegE.toFixed(2)).toLowerCase().includes(query.toLowerCase().trim())), [sites, query]);
  useEffect(() => {
    if (!open) return;
    setQuery(''); setActive(0);
    // React autoFocus runs while this kept-mounted dialog is closed. Focus only
    // after showModal has made its content interactive, including on later opens.
    const frame = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);
  function choose(site: SiteSummary) { onChoose(site); onClose(); }
  return <OverlayDialog open={open} onClose={onClose} title="Find a lunar site" description="Choosing a site analyses it right away with the current window and observer height." className="command-dialog">
    <div className="command-search"><Search size={20} aria-hidden="true" /><input ref={searchRef} role="combobox" aria-label="Search lunar sites" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" aria-activedescendant={options[active] ? listId + '-' + active : undefined} placeholder="Search sites or east longitude…" value={query}
      onChange={(event) => { setQuery(event.target.value); setActive(0); }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown') { event.preventDefault(); setActive((index) => Math.min(index + 1, Math.max(0, options.length - 1))); }
        if (event.key === 'ArrowUp') { event.preventDefault(); setActive((index) => Math.max(0, index - 1)); }
        if (event.key === 'Enter' && options[active]) { event.preventDefault(); choose(options[active]); }
      }} /></div>
    <div id={listId} role="listbox" aria-label="Matching lunar sites" className="command-options">
      {options.map((site, index) => <div key={site.id} id={listId + '-' + index} role="option" aria-selected={index === active} className="command-option" onPointerMove={() => setActive(index)} onClick={() => choose(site)}>
        <MapPin size={18} aria-hidden="true" /><div><strong>{site.name}</strong><span>{site.latDeg.toFixed(3)}° · {site.lonDegE.toFixed(3)}° E{site.category === 'mock' ? ' · mock' : ''}</span></div>{site.id === selectedSiteId && <Check size={18} aria-label="Current site" />}
      </div>)}
      {options.length === 0 && <p className="command-empty" role="status">No matching sites. Custom coordinates are available in Mission.</p>}
    </div>
    <footer className="command-help"><span><ArrowUp size={14} /><ArrowDown size={14} /> Navigate</span><span><CornerDownLeft size={14} /> Select</span><span><kbd>Esc</kbd> Close</span></footer>
  </OverlayDialog>;
}
