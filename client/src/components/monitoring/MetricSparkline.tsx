interface MetricSparklineProps {
  values: number[];
  /** Accessible description, e.g. "web CPU, latest 250m". */
  label: string;
  width?: number;
  height?: number;
  className?: string;
}

/**
 * Dependency-free inline SVG sparkline of a metric's recent values. A single
 * value renders as a dot; no values render nothing.
 */
export function MetricSparkline({
  values,
  label,
  width = 96,
  height = 24,
  className = 'text-primary',
}: MetricSparklineProps) {
  if (values.length === 0) return null;

  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pad = 2;
  const y = (v: number) => height - pad - ((v - min) / span) * (height - 2 * pad);
  const x = (i: number) => (values.length === 1 ? width / 2 : (i / (values.length - 1)) * width);

  return (
    <svg
      role="img"
      aria-label={label}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
    >
      {values.length === 1 ? (
        <circle cx={x(0)} cy={height / 2} r={2} fill="currentColor" />
      ) : (
        <polyline
          points={values.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
