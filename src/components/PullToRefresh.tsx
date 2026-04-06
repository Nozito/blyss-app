import { RefreshCw } from "lucide-react";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";

interface Props {
  onRefresh: () => Promise<void> | void;
  children: React.ReactNode;
}

/**
 * PullToRefresh
 *
 * Wrap the scrollable page content with this component to get
 * a native-feeling pull-to-refresh indicator at the top.
 */
export default function PullToRefresh({ onRefresh, children }: Props) {
  const THRESHOLD = 72;
  const { pullDistance, isRefreshing, canRelease } = usePullToRefresh({
    onRefresh,
    threshold: THRESHOLD,
  });

  const showIndicator = pullDistance > 4 || isRefreshing;
  // 0→1 progress ratio for the pull arc
  const progress = Math.min(pullDistance / THRESHOLD, 1);
  // Indicator travels with the pull, capped at 56px below top
  const translateY = isRefreshing ? 16 : Math.min(pullDistance * 0.6, 56);

  return (
    <div className="relative">
      {/* Pull indicator */}
      {showIndicator && (
        <div
          className="fixed left-0 right-0 z-50 flex justify-center pointer-events-none"
          style={{ top: translateY }}
        >
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center shadow-lg border border-border transition-all duration-150 ${
              canRelease || isRefreshing
                ? "bg-primary text-white scale-110"
                : "bg-card text-muted-foreground"
            }`}
          >
            <RefreshCw
              size={18}
              className={`transition-transform duration-150 ${
                isRefreshing
                  ? "animate-spin"
                  : ""
              }`}
              style={
                !isRefreshing
                  ? { transform: `rotate(${progress * 360}deg)` }
                  : undefined
              }
            />
          </div>
        </div>
      )}

      {/* Page content — pushed down while pulling */}
      <div
        style={{
          transform:
            pullDistance > 0 && !isRefreshing
              ? `translateY(${Math.min(pullDistance * 0.4, 28)}px)`
              : undefined,
          transition: pullDistance === 0 ? "transform 0.3s ease" : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
}
