import { describe, expect, it } from 'vitest';

import { clusterTasks } from '@/utils/taskClustering';

describe('clusterTasks', () => {
  it('combines adjacent unreadable tasks in comfortable mode', () => {
    const clusters = clusterTasks(
      [
        { id: 'a', title: 'Deep work planning', time: '09:00', duration: 30 },
        { id: 'b', title: 'Review weekly roadmap', time: '09:30', duration: 30 },
      ],
      56,
      undefined,
      { comfortMode: true, columnWidthPx: 120 },
    );

    expect(clusters).toHaveLength(1);
    expect(clusters[0].type).toBe('condensed');
    expect(clusters[0].tasks.map((task) => task.id)).toEqual(['a', 'b']);
  });

  it('does not combine unreadable tasks that have a real gap between them', () => {
    const clusters = clusterTasks(
      [
        { id: 'a', title: 'Deep work planning', time: '09:00', duration: 15 },
        { id: 'b', title: 'Review weekly roadmap', time: '09:30', duration: 15 },
      ],
      56,
      undefined,
      { comfortMode: true, columnWidthPx: 120 },
    );

    expect(clusters).toHaveLength(2);
    expect(clusters.every((cluster) => cluster.type === 'single')).toBe(true);
    expect(clusters.flatMap((cluster) => cluster.tasks.map((task) => task.id))).toEqual(['a', 'b']);
  });
});