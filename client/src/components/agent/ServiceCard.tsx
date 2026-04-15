import { Badge } from '@/components/ui/badge';

interface ServiceCardProps {
  serviceId: string;
  shortName: string;
  title: string;
  score: number;
}

export function ServiceCard({ serviceId, shortName, title, score }: ServiceCardProps) {
  return (
    <a
      href={`/services/${serviceId}`}
      className="block rounded-md border p-2 hover:bg-muted/50 transition-colors"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{shortName}</p>
        <Badge variant="outline">{score.toFixed(2)}</Badge>
      </div>
      <p className="text-xs text-muted-foreground line-clamp-2">{title}</p>
    </a>
  );
}
