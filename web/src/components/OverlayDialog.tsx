import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

/** Native dialog provides focus containment, inert background and focus restoration. */
export function OverlayDialog({ open, onClose, title, description, className = '', children }: {
  open: boolean; onClose(): void; title: string; description?: string; className?: string; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (open && dialog && !dialog.open) dialog.showModal();
    if (!open && dialog?.open) dialog.close();
  }, [open]);
  return <dialog ref={ref} className={'overlay-dialog ' + className} aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined}
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="dialog-surface">
      <header className="dialog-heading"><div><h2 id={titleId}>{title}</h2>{description && <p id={descriptionId}>{description}</p>}</div><button className="icon-button" type="button" aria-label={'Close ' + title} title="Close (Esc)" onClick={onClose}><X size={18} aria-hidden="true" /></button></header>
      {children}
    </div>
  </dialog>;
}
