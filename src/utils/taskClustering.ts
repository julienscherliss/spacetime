/**
 * Task clustering utilities for density-based rendering.
 * Detects when tasks are too dense to render individually and groups them.
 */

import { timeToMinutes } from '@/hooks/useCurrentTime';

export interface ClusterableTask {
  id: string;
  time?: string;
  duration?: number;
  title: string;
  [key: string]: any;
}

export interface TaskCluster {
  type: 'single' | 'condensed';
  tasks: ClusterableTask[];
  startMin: number;
  endMin: number;
}

const MIN_READABLE_PX = 28; // minimum height for a task to be readable
const CLUSTER_PROXIMITY_PX = 4; // if gap between tasks is less than this in px, cluster them

/**
 * Given a list of timed tasks and the current hourHeight,
 * produce an array of clusters — either single tasks or condensed groups.
 */
export function clusterTasks(
  tasks: ClusterableTask[],
  hourHeight: number
): TaskCluster[] {
  // Filter to only timed tasks and sort by start time
  const timed = tasks
    .filter(t => t.time)
    .map(t => ({
      task: t,
      startMin: timeToMinutes(t.time!),
      endMin: timeToMinutes(t.time!) + (t.duration || 30),
      heightPx: ((t.duration || 30) / 60) * hourHeight,
    }))
    .sort((a, b) => a.startMin - b.startMin);

  if (timed.length === 0) return [];

  const clusters: TaskCluster[] = [];
  let currentGroup: typeof timed = [timed[0]];

  for (let i = 1; i < timed.length; i++) {
    const prev = currentGroup[currentGroup.length - 1];
    const curr = timed[i];

    // Check if this task should join the current group:
    // 1. Tasks overlap in time
    // 2. Gap between them is too small to render separately
    // 3. Either task is below minimum readable height
    const gapMin = curr.startMin - prev.endMin;
    const gapPx = (gapMin / 60) * hourHeight;
    const overlap = curr.startMin < prev.endMin;
    const tooClose = gapPx < CLUSTER_PROXIMITY_PX && gapPx >= 0;
    const prevTooSmall = prev.heightPx < MIN_READABLE_PX;
    const currTooSmall = curr.heightPx < MIN_READABLE_PX;

    if (overlap || tooClose || (prevTooSmall && currTooSmall)) {
      currentGroup.push(curr);
    } else {
      clusters.push(buildCluster(currentGroup));
      currentGroup = [curr];
    }
  }
  clusters.push(buildCluster(currentGroup));

  return clusters;
}

function buildCluster(group: Array<{ task: ClusterableTask; startMin: number; endMin: number; heightPx: number }>): TaskCluster {
  if (group.length === 1 && group[0].heightPx >= MIN_READABLE_PX) {
    return {
      type: 'single',
      tasks: [group[0].task],
      startMin: group[0].startMin,
      endMin: group[0].endMin,
    };
  }

  // Multiple tasks or single too-small task
  const startMin = Math.min(...group.map(g => g.startMin));
  const endMin = Math.max(...group.map(g => g.endMin));

  return {
    type: group.length > 1 ? 'condensed' : 'single',
    tasks: group.map(g => g.task),
    startMin,
    endMin,
  };
}

/**
 * Calculate the ideal zoom level to make all tasks in a cluster readable.
 * Returns the hourHeight needed.
 */
export function getZoomForCluster(
  cluster: TaskCluster,
  viewportHeight: number,
  minTaskHeight: number = 40
): number {
  const totalMinutes = cluster.endMin - cluster.startMin;
  if (totalMinutes <= 0) return 120;

  // We want each task to have at least minTaskHeight pixels
  // And the cluster should fit within ~80% of the viewport
  const targetHeight = viewportHeight * 0.75;
  const hourHeightFromViewport = (targetHeight / totalMinutes) * 60;

  // Also ensure minimum task height
  const shortestDuration = Math.min(...cluster.tasks.map(t => t.duration || 30));
  const hourHeightFromMinTask = (minTaskHeight / shortestDuration) * 60;

  return Math.min(
    Math.max(hourHeightFromViewport, hourHeightFromMinTask),
    120 // SCALE_MAX
  );
}
