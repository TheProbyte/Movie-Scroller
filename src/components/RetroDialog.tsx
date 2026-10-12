import { motion } from 'framer-motion';
import { X } from 'lucide-react';

export interface DialogButton {
  label: string;
  value: string;
  variant?: 'primary' | 'danger' | 'plain';
}
export interface DialogOptions {
  title?: string;
  icon?: string;
  message: React.ReactNode;
  buttons: DialogButton[];
}

/** An early-2000s style "system dialog" window. Resolves with the clicked value (or null). */
export function RetroDialog({ opts, onClose }: { opts: DialogOptions; onClose: (value: string | null) => void }) {
  return (
    <>
      <motion.div className="overlay dialog-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => onClose(null)} />
      <motion.div
        className="win dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label={opts.title ?? 'MovieMatch'}
        initial={{ opacity: 0, scale: 0.85, x: '-50%', y: '-46%' }}
        animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
        exit={{ opacity: 0, scale: 0.9, x: '-50%', y: '-50%' }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      >
        <div className="win-bar">
          <span className="win-title">{opts.title ?? 'MovieMatch'}</span>
          <button className="win-close" onClick={() => onClose(null)} aria-label="Close">
            <X size={14} strokeWidth={3} />
          </button>
        </div>
        <div className="dialog-body">
          {opts.icon && <div className="dialog-icon">{opts.icon}</div>}
          <div className="dialog-msg">{opts.message}</div>
        </div>
        <div className="dialog-buttons">
          {opts.buttons.map((b, i) => (
            <button
              key={b.value}
              className={`btn ${b.variant === 'primary' ? 'primary' : b.variant === 'danger' ? 'danger' : ''}`}
              autoFocus={i === 0}
              onClick={() => onClose(b.value)}
            >
              {b.label}
            </button>
          ))}
        </div>
      </motion.div>
    </>
  );
}
