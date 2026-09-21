import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Home } from 'lucide-react';

export function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <h1 className="mb-2 text-6xl font-bold text-muted-foreground">404</h1>
      <h2 className="mb-2 text-xl font-semibold">Page not found</h2>
      <p className="mb-6 max-w-md text-sm text-muted-foreground">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <div className="flex gap-3">
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Go back
        </Button>
        <Button onClick={() => navigate('/')}>
          <Home className="mr-2 h-4 w-4" />
          Go to Dashboard
        </Button>
      </div>
    </div>
  );
}
