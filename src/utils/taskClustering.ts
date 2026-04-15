/**
 * Task clustering utilities for density-based rendering.
 * Detects when tasks are too dense to render individually and groups them.
 */
import { getEffectiveMax } from '@/hooks/useTimeScale';

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
  displayHeightPx?: number;
  titleFits?: boolean;
}

export interface ClusterTaskOptions {
  comfortMode?: boolean;
  columnWidthPx?: number;
}

export const TASK_TEXT_FIT_PX = 23; // title line + vertical padding in TimelineTaskBlock
export const TASK_TEXT_FIT_PX_COMFORT = 32; // comfort mode needs a larger readable footprint for comfortable typography
const CLUSTER_ADJACENCY_EPSILON_PX = 1;

const NARROW_COLUMN_PX = 190;
const NARROW_COLUMN_PX_COMFORT = 280;
const NARROW_COLUMN_EXTRA_FIT_PX = 6;
const NARROW_COLUMN_EXTRA_FIT_PX_COMFORT = 10;
const TITLE_CHAR_WIDTH_PX = 6.2;
const TITLE_CHAR_WIDTH_PX_COMFORT = 8.1;
const TITLE_HORIZONTAL_CHROME_PX = 18;
const TITLE_HORIZONTAL_CHROME_PX_COMFORT = 24;

function getReadableFitPx(comfortMode: boolean, columnWidthPx?: number) {
  const baseFitPx = comfortMode ? TASK_TEXT_FIT_PX_COMFORT : TASK_TEXT_FIT_PX;
  if (!columnWidthPx) return baseFitPx;

  const narrowThreshold = comfortMode ? NARROW_COLUMN_PX_COMFORT : NARROW_COLUMN_PX;
  if (columnWidthPx >= narrowThreshold) return baseFitPx;

  return baseFitPx + (comfortMode ? NARROW_COLUMN_EXTRA_FIT_PX_COMFORT : NARROW_COLUMN_EXTRA_FIT_PX);
}

function titleFitsWidth(title: string, comfortMode: boolean, columnWidthPx?: number) {
  if (!columnWidthPx) return true;

  const chromePx = comfortMode ? TITLE_HORIZONTAL_CHROME_PX_COMFORT : TITLE_HORIZONTAL_CHROME_PX;
  const availableWidthPx = Math.max(columnWidthPx - chromePx, 0);
  const charWidthPx = comfortMode ? TITLE_CHAR_WIDTH_PX_COMFORT : TITLE_CHAR_WIDTH_PX;

  return (title.length * charWidthPx) <= availableWidthPx;
}

/**
 * Given a list of timed tasks and the current hourHeight,
 * produce an array of clusters — either single tasks or condensed groups.
 *
 * Clustering is purely visual: tasks cluster only when their rendered boxes
 * are too short to fit the title text and those unreadable boxes would touch
 * or overlap on screen.
 */
export function clusterTasks(
  tasks: ClusterableTask[],
  hourHeight: number,
  excludeIds?: Set<string>,
  options: ClusterTaskOptions = {},
): TaskCluster[] {
  const { comfortMode = false, columnWidthPx } = options;
  const fitPx = getReadableFitPx(comfortMode, columnWidthPx);
  const timed = tasks
    .filter(t => t.time && !(excludeIds?.has(t.id)))
    .map(t => {
      const startMin = timeToMinutes(t.time!);
      const duration = t.duration || 30;
      const endMin = startMin + duration;
      const naturalHeightPx = (duration / 60) * hourHeight;
      const startPx = (startMin / 60) * hourHeight;
      const heightFits = naturalHeightPx >= fitPx;
      const widthFits = titleFitsWidth(t.title, comfortMode, columnWidthPx);
      const titleFits = heightFits && widthFits;
      const readableHeightPx = Math.max(naturalHeightPx, fitPx);

      return {
        task: t,
        startMin,
        endMin,
        startPx,
        naturalHeightPx,
        naturalBottomPx: startPx + naturalHeightPx,
        readableHeightPx,
        readableBottomPx: startPx + readableHeightPx,
        titleFits,
      };
    })
    .sort((a, b) => a.startMin - b.startMin);

  // Also produce single-task clusters for excluded (conflict) tasks
  const excludedTasks = excludeIds
    ? tasks.filter(t => t.time && excludeIds.has(t.id)).map(t => {
        const naturalHeightPx = ((t.duration || 30) / 60) * hourHeight;
        return {
          task: t,
          startMin: timeToMinutes(t.time!),
          endMin: timeToMinutes(t.time!) + (t.duration || 30),
          naturalHeightPx,
          titleFits: naturalHeightPx >= fitPx && titleFitsWidth(t.title, comfortMode, columnWidthPx),
        };
      })
    : [];

  if (timed.length === 0 && excludedTasks.length === 0) return [];

  const clusters: TaskCluster[] = [];

  // Add excluded tasks as individual single clusters
  for (const ex of excludedTasks) {
    clusters.push({
      type: 'single',
      tasks: [ex.task],
      startMin: ex.startMin,
      endMin: ex.endMin,
      displayHeightPx: ex.naturalHeightPx,
      titleFits: ex.titleFits,
    });
  }

  if (timed.length === 0) return clusters;
  let currentGroup: typeof timed = [timed[0]];

  for (let i = 1; i < timed.length; i++) {
    const curr = timed[i];

    const currentGroupUnreadable = currentGroup.every(item => !item.titleFits);
    const currentGroupNaturalBottomPx = Math.max(...currentGroup.map(item => item.naturalBottomPx));
    const currentGroupReadableBottomPx = Math.max(...currentGroup.map(item => item.readableBottomPx));
    const naturalGapPx = curr.startPx - currentGroupNaturalBottomPx;
    const readableGapPx = curr.startPx - currentGroupReadableBottomPx;

    const shouldCluster =
      currentGroupUnreadable &&
      !curr.titleFits &&
      naturalGapPx <= CLUSTER_ADJACENCY_EPSILON_PX &&
      readableGapPx <= 0;

    if (shouldCluster) {
      currentGroup.push(curr);
    } else {
      clusters.push(buildCluster(currentGroup));
      currentGroup = [curr];
    }
  }
  clusters.push(buildCluster(currentGroup));

  return clusters;
}

function buildCluster(group: Array<{
  task: ClusterableTask;
  startMin: number;
  endMin: number;
  startPx: number;
  naturalHeightPx: number;
  naturalBottomPx: number;
  readableHeightPx: number;
  readableBottomPx: number;
  titleFits: boolean;
}>): TaskCluster {
  // Single task always renders as single
  if (group.length === 1) {
    return {
      type: 'single',
      tasks: [group[0].task],
      startMin: group[0].startMin,
      endMin: group[0].endMin,
      displayHeightPx: group[0].naturalHeightPx,
      titleFits: group[0].titleFits,
    };
  }

  // Multiple tasks
  const startMin = Math.min(...group.map(g => g.startMin));
  const endMin = Math.max(...group.map(g => g.endMin));
  const startPx = Math.min(...group.map(g => g.startPx));
  const endPx = Math.max(...group.map(g => g.startPx + g.naturalHeightPx));

  return {
    type: 'condensed',
    tasks: group.map(g => g.task),
    startMin,
    endMin,
    displayHeightPx: endPx - startPx,
    titleFits: false,
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

  // Ensure each task has at least minTaskHeight pixels
  const shortestDuration = Math.min(...cluster.tasks.map(t => t.duration || 30));
  const hourHeightFromMinTask = (minTaskHeight / shortestDuration) * 60;

  // Also ensure cluster fits in viewport
  const targetHeight = viewportHeight * 0.75;
  const hourHeightFromViewport = (targetHeight / totalMinutes) * 60;

  const { getEffectiveMax } = await import('@/hooks/useTimeScale');
  return Math.min(
    Math.max(hourHeightFromViewport, hourHeightFromMinTask),
    getEffectiveMax()
  );
}
