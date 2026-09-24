import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { navigation } from '@/components/layout/Sidebar';
import { useTourStore } from '@/store/tour-store';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { buildTourSteps, type TourStep } from './tour-steps';

const DEFAULT_STEPS = buildTourSteps(navigation);

/** Ring drawn around the element the current step points at. */
const HIGHLIGHT_CLASSES = ['ring-2', 'ring-primary', 'ring-offset-2', 'ring-offset-background'];

/**
 * First element carrying `data-tour={id}` that is actually laid out. The
 * sidebar can be mounted twice (desktop + mobile drawer) and the hidden copy
 * has an empty box, so visibility — not document order — decides.
 */
function findVisibleTarget(id: string): HTMLElement | null {
  const candidates = document.querySelectorAll<HTMLElement>(`[data-tour="${id}"]`);
  for (const el of candidates) {
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 || rect.height > 0) return el;
  }
  return null;
}

/**
 * Radix returns focus to the previously focused element when a step's
 * popover/dialog unmounts. While the tour is still running the next step has
 * already taken focus, so only let focus return once the tour has closed.
 */
function keepFocusWhileActive(event: Event) {
  if (useTourStore.getState().status === 'active') event.preventDefault();
}

interface GuidedTourProps {
  /** Steps to walk through; defaults to the platform tour. */
  steps?: TourStep[];
}

/**
 * Guided walkthrough of the main menus and core workflow. Renders nothing
 * until started from the header help button or the Dashboard, and never
 * blocks the page once skipped, dismissed or completed.
 */
export function GuidedTour({ steps = DEFAULT_STEPS }: GuidedTourProps) {
  const status = useTourStore((state) => state.status);
  if (status !== 'active' || steps.length === 0) return null;
  return <ActiveTour steps={steps} />;
}

function ActiveTour({ steps }: { steps: TourStep[] }) {
  const storedIndex = useTourStore((state) => state.stepIndex);
  const next = useTourStore((state) => state.next);
  const prev = useTourStore((state) => state.prev);
  const dismiss = useTourStore((state) => state.dismiss);
  const complete = useTourStore((state) => state.complete);

  const index = Math.min(storedIndex, steps.length - 1);
  const step = steps[index];
  const isFirst = index === 0;
  const isLast = index === steps.length - 1;

  const titleId = useId();
  const descriptionId = useId();
  const anchorRef = useRef<HTMLElement | null>(null);
  const [layoutVersion, setLayoutVersion] = useState(0);
  const [resolved, setResolved] = useState<{ stepId: string; target: HTMLElement | null } | null>(
    null
  );

  useEffect(() => {
    const onResize = () => setLayoutVersion((version) => version + 1);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Resolve (and highlight) the current step's target before paint.
  useLayoutEffect(() => {
    const target = step.target ? findVisibleTarget(step.target) : null;
    anchorRef.current = target;
    setResolved({ stepId: step.id, target });
    if (!target) return;
    target.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    target.classList.add(...HIGHLIGHT_CLASSES);
    return () => target.classList.remove(...HIGHLIGHT_CLASSES);
  }, [step, layoutVersion]);

  if (!resolved || resolved.stepId !== step.id) return null;

  const progress = (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground" aria-live="polite">
        Step {index + 1} of {steps.length}
      </p>
      <Progress
        value={((index + 1) / steps.length) * 100}
        aria-label="Tour progress"
        className="h-1.5"
      />
    </div>
  );

  const controls = (
    <div className="flex items-center justify-between gap-2">
      <Button variant="ghost" size="sm" onClick={dismiss}>
        Skip tour
      </Button>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={prev} disabled={isFirst}>
          Back
        </Button>
        <Button size="sm" onClick={isLast ? complete : () => next(steps.length)}>
          {isLast ? 'Finish' : 'Next'}
        </Button>
      </div>
    </div>
  );

  if (resolved.target) {
    return (
      <Popover
        key={step.id}
        open
        onOpenChange={(open) => {
          if (!open) dismiss();
        }}
      >
        <PopoverAnchor virtualRef={anchorRef} />
        <PopoverContent
          side={step.side ?? 'bottom'}
          sideOffset={10}
          collisionPadding={16}
          className="w-80 space-y-4"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          data-tour-placement="anchored"
          // Tabbing back into the page should not end the tour; Esc, an outside
          // click or Skip still do.
          onFocusOutside={(event) => event.preventDefault()}
          onCloseAutoFocus={keepFocusWhileActive}
        >
          <div className="space-y-1.5">
            <h2 id={titleId} className="font-semibold leading-none tracking-tight">
              {step.title}
            </h2>
            <p id={descriptionId} className="text-sm text-muted-foreground">
              {step.description}
            </p>
          </div>
          {progress}
          {controls}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Dialog
      key={step.id}
      open
      onOpenChange={(open) => {
        if (!open) dismiss();
      }}
    >
      <DialogContent
        className="max-w-md"
        data-tour-placement="centered"
        onCloseAutoFocus={keepFocusWhileActive}
      >
        <DialogHeader>
          <DialogTitle>{step.title}</DialogTitle>
          <DialogDescription>{step.description}</DialogDescription>
        </DialogHeader>
        {progress}
        <DialogFooter className="sm:justify-stretch sm:space-x-0">
          <div className="w-full">{controls}</div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
