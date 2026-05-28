import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { useEffect, useState } from 'react';
import { resolveAttachmentUrl } from '@/lib/attachmentUrl';

interface Attachment {
  name: string;
  url?: string;
  type: string;
  path?: string;
}

interface AttachmentLightboxProps {
  attachments: Attachment[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

export function AttachmentLightbox({ attachments, currentIndex, onClose, onNavigate }: AttachmentLightboxProps) {
  const att = attachments[currentIndex];
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setResolvedUrl(null);
    if (att) {
      resolveAttachmentUrl(att).then((u) => { if (active) setResolvedUrl(u); });
    }
    return () => { active = false; };
  }, [att?.path, att?.url]);

  if (!att) return null;

  const isImage = att.type.startsWith('image/');
  const isPdf = att.type === 'application/pdf';
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < attachments.length - 1;
  const displayUrl = resolvedUrl || '';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-[80] flex items-center justify-center bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      >
        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 z-10">
          <span className="text-[11px] font-mono text-foreground/50 truncate max-w-[60%]">
            {att.name}
          </span>
          <div className="flex items-center gap-2">
            <a
              href={att.url}
              download={att.name}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="p-2 rounded-md text-foreground/40 hover:text-foreground transition-colors"
            >
              <Download size={14} />
            </a>
            <button
              onClick={onClose}
              className="p-2 rounded-md text-foreground/40 hover:text-foreground transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Navigation arrows */}
        {hasPrev && (
          <button
            onClick={(e) => { e.stopPropagation(); onNavigate(currentIndex - 1); }}
            className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-card/80 border border-border/30 text-foreground/50 hover:text-foreground transition-colors z-10"
          >
            <ChevronLeft size={16} />
          </button>
        )}
        {hasNext && (
          <button
            onClick={(e) => { e.stopPropagation(); onNavigate(currentIndex + 1); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-card/80 border border-border/30 text-foreground/50 hover:text-foreground transition-colors z-10"
          >
            <ChevronRight size={16} />
          </button>
        )}

        {/* Content */}
        <motion.div
          key={currentIndex}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.15 }}
          className="max-w-[90vw] max-h-[85vh] flex items-center justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          {isImage ? (
            <img
              src={att.url}
              alt={att.name}
              className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
            />
          ) : isPdf ? (
            <iframe
              src={att.url}
              title={att.name}
              className="w-[80vw] h-[85vh] rounded-lg border border-border/30"
            />
          ) : (
            <div className="flex flex-col items-center gap-4 p-8 bg-card rounded-lg border border-border/30">
              <span className="text-[13px] font-mono text-foreground/60">{att.name}</span>
              <a
                href={att.url}
                download={att.name}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 rounded-md bg-primary/10 text-primary text-[11px] font-mono hover:bg-primary/20 transition-colors"
              >
                Download file
              </a>
            </div>
          )}
        </motion.div>

        {/* Counter */}
        {attachments.length > 1 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[10px] font-mono text-foreground/30">
            {currentIndex + 1} / {attachments.length}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
