import { useEffect, useCallback, useState, useRef } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import Autoplay from 'embla-carousel-autoplay';

import featureTimeline from '@/assets/feature-timeline.mp4';
import featurePriority from '@/assets/feature-priority.mp4';
import featureRecurrence from '@/assets/feature-recurrence.mp4';
import featureFocus from '@/assets/feature-focus.mp4';
import featureAnalytics from '@/assets/feature-analytics.mp4';
import featureLibrary from '@/assets/feature-library.mp4';

const slides = [
  { key: 'TIMELINE VIEW', src: featureTimeline },
  { key: 'PRIORITY ESCALATION', src: featurePriority },
  { key: 'LINKED RECURRENCE', src: featureRecurrence },
  { key: 'FOCUS MODE', src: featureFocus },
  { key: 'ANALYTICS', src: featureAnalytics },
  { key: 'LIBRARY', src: featureLibrary },
];

interface FeatureCarouselProps {
  activeIndex?: number | null;
  onSlideChange?: (index: number) => void;
}

export function FeatureCarousel({ activeIndex = null, onSlideChange }: FeatureCarouselProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel(
    { loop: true, align: 'center' },
    [Autoplay({ delay: 5000, stopOnInteraction: true, stopOnMouseEnter: true })]
  );
  const [selectedIndex, setSelectedIndex] = useState(0);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);

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

  // Play only the active video; pause the rest
  useEffect(() => {
    videoRefs.current.forEach((v, i) => {
      if (!v) return;
      if (i === selectedIndex) {
        v.currentTime = 0;
        v.play().catch(() => {});
      } else {
        v.pause();
      }
    });
  }, [selectedIndex]);

  useEffect(() => {
    if (activeIndex !== null && activeIndex !== undefined && emblaApi) {
      emblaApi.scrollTo(activeIndex);
    }
  }, [activeIndex, emblaApi]);

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div ref={emblaRef} className="overflow-hidden rounded-md border border-border/40">
        <div className="flex">
          {slides.map((slide, i) => (
            <div key={slide.key} className="min-w-0 shrink-0 grow-0 basis-full">
              <video
                ref={(el) => { videoRefs.current[i] = el; }}
                src={slide.src}
                muted
                loop
                playsInline
                preload="metadata"
                aria-label={slide.key}
                style={slide.key === 'LIBRARY' ? { objectPosition: 'center top' } : undefined}
                className="w-full h-auto object-cover aspect-video bg-muted"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-center gap-2 mt-4">
        {slides.map((slide, i) => (
          <button
            key={slide.key}
            onClick={() => emblaApi?.scrollTo(i)}
            className={`h-1.5 rounded-full transition-all ${
              i === selectedIndex
                ? 'bg-foreground w-4'
                : 'w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50'
            }`}
            aria-label={`Go to ${slide.key}`}
          />
        ))}
      </div>
    </div>
  );
}
