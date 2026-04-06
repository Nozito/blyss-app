import { useEffect, useRef, useState } from "react";

interface Options {
  onRefresh: () => Promise<void> | void;
  /** Minimum pull distance (px) to trigger refresh. Default: 72 */
  threshold?: number;
  /** Element to attach touch listeners to. Default: document */
  targetRef?: React.RefObject<HTMLElement>;
}

interface PullState {
  /** Current pull distance in px (capped at threshold * 1.5) */
  pullDistance: number;
  /** true while the async refresh is running */
  isRefreshing: boolean;
  /** true once threshold is crossed — shows the "release" state */
  canRelease: boolean;
}

/**
 * usePullToRefresh
 *
 * Detects a downward finger drag from the very top of the scroll container
 * and calls onRefresh() once the user lifts their finger past the threshold.
 *
 * Usage:
 *   const { pullDistance, isRefreshing, canRelease } = usePullToRefresh({ onRefresh: refetch });
 *   // Render a visual indicator when pullDistance > 0 or isRefreshing.
 */
export function usePullToRefresh({
  onRefresh,
  threshold = 72,
  targetRef,
}: Options): PullState {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [canRelease, setCanRelease] = useState(false);

  const startY = useRef<number | null>(null);
  const isDragging = useRef(false);
  const isRefreshingRef = useRef(false);

  useEffect(() => {
    const el = targetRef?.current ?? document;

    const onTouchStart = (e: Event) => {
      const touch = (e as TouchEvent).touches[0];
      // Only trigger when scrolled to the very top
      const scrollTop =
        document.documentElement.scrollTop || document.body.scrollTop;
      if (scrollTop > 0) return;
      startY.current = touch.clientY;
      isDragging.current = true;
    };

    const onTouchMove = (e: Event) => {
      if (!isDragging.current || startY.current === null) return;
      if (isRefreshingRef.current) return;
      const touch = (e as TouchEvent).touches[0];
      const delta = touch.clientY - startY.current;
      if (delta <= 0) {
        setPullDistance(0);
        setCanRelease(false);
        return;
      }
      // Rubber-band: resist after threshold
      const rubberBand = delta < threshold
        ? delta
        : threshold + (delta - threshold) * 0.3;
      const capped = Math.min(rubberBand, threshold * 1.8);
      setPullDistance(capped);
      setCanRelease(delta >= threshold);
    };

    const onTouchEnd = async () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      const wasBeyondThreshold = canRelease;
      startY.current = null;
      setPullDistance(0);
      setCanRelease(false);
      if (!wasBeyondThreshold || isRefreshingRef.current) return;
      isRefreshingRef.current = true;
      setIsRefreshing(true);
      try {
        await onRefresh();
      } finally {
        isRefreshingRef.current = false;
        setIsRefreshing(false);
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("touchend", onTouchEnd);

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threshold, canRelease]);

  return { pullDistance, isRefreshing, canRelease };
}
