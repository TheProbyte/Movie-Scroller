import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

/** Bottom sheet with drag-to-dismiss. Wrap in <AnimatePresence>. */
export function Sheet({ onClose, children, className = '' }: { onClose: () => void; children: ReactNode; className?: string }) {
  return (
    <>
      <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.div
        className={`sheet glass ${className}`}
        role="dialog"
        aria-modal="true"
        initial={{ y: '100%', x: '-50%' }}
        animate={{ y: 0, x: '-50%' }}
        exit={{ y: '100%', x: '-50%' }}
        transition={{ type: 'spring', stiffness: 380, damping: 38 }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.6 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 120 || info.velocity.y > 700) onClose();
        }}
      >
        <div className="sheet-handle" />
        {children}
      </motion.div>
    </>
  );
}
