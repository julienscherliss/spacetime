import { useEffect, useCallback, useState } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import Autoplay from 'embla-carousel-autoplay';
import { motion } from 'framer-motion';

import featureTimeline from '@/assets/feature-timeline.jpg';
import featurePriority from '@/assets/feature-priority.jpg';
import featureRecurrence from '@/assets/feature-recurrence.jpg';
import featureFocus from '@/assets/feature-focus.jpg';
import featureAnalytics from '@/assets/feature-analytics.jpg';
import featureLibrary from '@/assets/feature-library.jpg';

const slides = [
  { key: 'TIMELINE VIEW', src: featureTimeline, alt: 'Timeline view showing your day mapped across a scrollable timeline' },
  { key: 'PRIORITY ESCALATION', src: featurePriority, alt: 'Priority escalation from FLEX to LOCK' },
  { key: 'LINKED RECURRENCE', src: featureRecurrence, alt: 'Linked recurring tasks across the week' },
  { key: 'FOCUS MODE', src: featureFocus, alt: 'Focus mode with single task and timer' },
  { key: 'ANALYTICS', src: featureAnalytics, alt: 'Analytics dashboard with completion rates and heatmaps' },
  { key: 'LIBRARY', src: featureLibrary, alt: 'Library staging area for unscheduled tasks' },
];

interface FeatureCarouselProps {
  activeIndex: number | null;
  onSlideChange?: (index: number) => void;
}

export function FeatureCarousel({ activeIndex, onSlideChange }: FeatureCarouselProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel(
    { loop: true, align: 'center' },
    [Autoplay({ delay: 4000, stopOnInteraction: true, stopOnMouseEnter: true })]
  );
  const [selectedIndex, setSelectedIndex] = useState(0);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    const idx = emblaApi.selectedScrollSnap();
    setSelectedIndex(idx);
    onSlideChange?.(idx);
  }, [emblaApi, onSlideChange]);

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.on('select', onSelect);
    onSelect();
    return () => { emblaApi.off('select', onSelect); };
  }, [emblaApi, onSelect]);

  // Scroll to slide when a feature card is clicked
  useEffect(() => {
    if (activeIndex !== null && emblaApi) {
      emblaApi.scrollTo(activeIndex);
    }
  }, [activeIndex, emblaApi]);

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div ref={emblaRef} className="overflow-hidden rounded-md border border-border/40">
        <div className="flex">
          {slides.map((slide, i) => (
            <div key={slide.key} className="min-w-0 shrink-0 grow-0 basis-full">
              <img
                src={slide.src}
                alt={slide.alt}
                loading="lazy"
                width={1280}
                height={720}
                className="w-full h-auto object-cover aspect-video"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Dot indicators */}
      <div className="flex justify-center gap-2 mt-4">
        {slides.map((slide, i) => (
          <button
            key={slide.key}
            onClick={() => emblaApi?.scrollTo(i)}
            className={`w-1.5 h-1.5 rounded-full transition-all ${
              i === selectedIndex
                ? 'bg-foreground w-4'
                : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
            }`}
            aria-label={`Go to ${slide.key}`}
          />
        ))}
      </div>
    </div>
  );
}
