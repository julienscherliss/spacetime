import { ClassicTemplate } from './ClassicTemplate';
import { MinimalTemplate } from './MinimalTemplate';
import { BoldTemplate } from './BoldTemplate';
import { CompactTemplate } from './CompactTemplate';
import { EditorialTemplate } from './EditorialTemplate';
import type { TemplateProps } from './types';

export function InvoiceRender(props: TemplateProps) {
  switch (props.style.template) {
    case 'minimal': return <MinimalTemplate {...props} />;
    case 'bold': return <BoldTemplate {...props} />;
    case 'compact': return <CompactTemplate {...props} />;
    case 'editorial': return <EditorialTemplate {...props} />;
    case 'classic':
    default:
      return <ClassicTemplate {...props} />;
  }
}