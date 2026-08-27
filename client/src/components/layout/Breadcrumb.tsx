import { useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Route segment descriptor used by the breadcrumb generator.
 */
interface RouteSegment {
  /** The label to display for this segment. */
  label: string;
  /** The route path (empty string for the root /). */
  path: string;
  /** Whether this segment is the current page (non-link). */
  current?: boolean;
}

/**
 * Map of path-prefix labels used for breadcrumb generation.
 * Keys are prefix patterns; values are the display labels.
 */
const SEGMENT_LABELS: Record<string, string> = {
  '/': 'Dashboard',
  '/services': 'Services',
  '/projects': 'Projects',
  '/projects/add': 'Add Project',
  '/infrastructure': 'Infrastructure',
  '/analytics': 'Analytics',
  '/settings': 'Settings',
  '/scenarios': 'Scenarios',
};

/**
 * Resolve a dynamic route segment (e.g. `:id`) to a human-readable label.
 */
function resolveDynamicLabel(prefix: string, segment: string): string {
  if (segment.startsWith(':')) {
    const id = segment.replace(/^:\w+/, '');
    return id || prefix;
  }
  return segment;
}

interface BreadcrumbProps {
  /** Override the default label map. */
  labels?: Record<string, string>;
  /** Custom separator element (default: ChevronRight). */
  separator?: React.ReactNode;
  /** Maximum depth to render (default: 5). */
  maxDepth?: number;
  /** Additional CSS class on the root container. */
  className?: string;
}

/**
 * Build a breadcrumb trail from the current location pathname.
 *
 * Strategy:
 *   1. Walk through known route prefixes in longest-first order.
 *   2. For each matching prefix, emit a segment.
 *   3. The remainder (if any) is treated as a dynamic segment.
 */
function buildSegments(pathname: string): RouteSegment[] {
  const segments: RouteSegment[] = [];
  let accumulated = '';

  // Check known prefixes in longest-first order
  const sortedPrefixes = Object.keys(SEGMENT_LABELS).sort((a, b) => b.length - a.length);

  for (const prefix of sortedPrefixes) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) {
      accumulated = prefix;
      break;
    }
  }

  if (!accumulated) {
    // No known prefix matched — show nothing for unknown routes
    return [];
  }

  // Build segments from the matched prefix
  const prefixParts = accumulated.split('/').filter(Boolean);
  let pathSoFar = '';

  for (const part of prefixParts) {
    pathSoFar += '/' + part;
    const label = SEGMENT_LABELS[pathSoFar] || resolveDynamicLabel(pathSoFar, part);
    // Mark the last prefix segment as current if it matches the pathname exactly
    const isCurrent = pathSoFar === pathname;
    segments.push({ label, path: pathSoFar, current: isCurrent });
  }

  // Check if there's a remainder (dynamic segment)
  if (accumulated !== pathname) {
    const remainder = pathname.slice(accumulated.length + 1);
    if (remainder) {
      // The remainder is a dynamic segment (e.g. :id, edit, add)
      const label =
        SEGMENT_LABELS[accumulated + '/' + remainder] || resolveDynamicLabel(remainder, remainder);
      segments.push({ label, path: pathname, current: true });
    }
  }

  return segments;
}

export function Breadcrumb({
  labels,
  separator = <ChevronRight className="h-4 w-4 text-muted-foreground" />,
  maxDepth = 5,
  className,
}: BreadcrumbProps) {
  const location = useLocation();

  const segments = useMemo(() => {
    if (labels) {
      // Custom labels override
      const customSegments: RouteSegment[] = [];
      const parts = location.pathname.split('/').filter(Boolean);
      let pathSoFar = '';
      for (const part of parts) {
        pathSoFar += '/' + part;
        const label = labels[pathSoFar] || resolveDynamicLabel(pathSoFar, part);
        const isCurrent = pathSoFar === location.pathname;
        customSegments.push({ label, path: pathSoFar, current: isCurrent });
      }
      return customSegments;
    }
    return buildSegments(location.pathname);
  }, [location.pathname, labels]);

  if (segments.length <= 1) {
    return null;
  }

  return (
    <nav
      aria-label="Breadcrumb"
      className={cn('mb-4 flex items-center gap-1.5 text-sm', className)}
    >
      {segments.slice(0, maxDepth).map((seg, idx) => (
        <div key={seg.path} className="flex items-center gap-1.5">
          {idx > 0 && <span className="text-muted-foreground">{separator}</span>}
          {seg.current ? (
            <span className="font-medium text-foreground" aria-current="page">
              {seg.label}
            </span>
          ) : (
            <Link
              to={seg.path}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {seg.label}
            </Link>
          )}
        </div>
      ))}
    </nav>
  );
}
