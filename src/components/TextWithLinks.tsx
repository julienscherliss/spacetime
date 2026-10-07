import { splitInlineLinks, inlineLinkLabel } from '@/lib/inlineLinks';

export function TextWithLinks({ text }: { text: string }) {
  return <>{splitInlineLinks(text).map((part, index) => part.href ? (
    <a key={index} href={part.href} target="_blank" rel="noopener noreferrer"
      title={part.href} onClick={event => event.stopPropagation()}
      onDragStart={event => event.stopPropagation()}
      className="text-primary underline underline-offset-2 decoration-primary/40 hover:decoration-primary [overflow-wrap:anywhere]">
      {inlineLinkLabel(part.href)}
    </a>
  ) : <span key={index}>{part.text}</span>)}</>;
}
