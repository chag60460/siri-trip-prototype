import { useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Icon } from './Icons';

export function Modal({ title, children, onClose, className = '', showClose = true }: {
  title: string; children: ReactNode; onClose: () => void; className?: string; showClose?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useLayoutEffect(() => {
    const panel = ref.current;
    const background = panel?.closest('.swipe-page')?.querySelector<HTMLElement>('.screen-content');
    if (!panel || !background) throw new Error('A dialog must be inside the phone conversation.');
    const previousFocus = document.activeElement;
    background.inert = true;
    panel.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close.current();
      }
      if (event.key === 'Tab') {
        const targets = Array.from(panel.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled):not([type="hidden"]), a[href], select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
        ));
        const first = targets[0];
        const last = targets.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
      background.inert = false;
      const target = previousFocus instanceof HTMLElement && previousFocus !== document.body && previousFocus.isConnected
        ? previousFocus : background.querySelector<HTMLElement>('.conversation-scroll');
      target?.focus({ preventScroll: true });
    };
  }, []);
  return <div className="modal-layer">
    <div className={`modal-panel ${className}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
      <header className="modal-heading">
        <h2>{title}</h2>
        {showClose && <button className="round-button close-button" type="button" aria-label={`Close ${title}`} onClick={onClose}>
          <Icon name="close" />
        </button>}
      </header>
      {children}
    </div>
  </div>;
}
