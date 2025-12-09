import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

interface ScenarioEditorGuidelinesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface GuidelineStep {
  id: string;
  number: number;
  title: string;
  description: string;
}

const GUIDELINE_STEPS: GuidelineStep[] = [
  {
    id: 'infrastructure',
    number: 1,
    title: 'Select Target Infrastructure',
    description:
      'Choose where the scenario will be deployed from the infrastructure dropdown at the top of the editor.',
  },
  {
    id: 'services',
    number: 2,
    title: 'Add Services to Canvas',
    description:
      'Drag services from the palette onto the topology canvas to build your scenario configuration.',
  },
  {
    id: 'connections',
    number: 3,
    title: 'Connect Services with Edges',
    description:
      'Draw edges between services to represent data flows and establish communication paths.',
  },
  {
    id: 'validate',
    number: 4,
    title: 'Validate Configuration',
    description:
      'Click the Validate button to ensure your topology meets all deployment requirements.',
  },
  {
    id: 'deploy',
    number: 5,
    title: 'Deploy to Target',
    description: 'Click the Deploy button to start your scenario on the selected infrastructure.',
  },
];

export function ScenarioEditorGuidelinesModal({
  open,
  onOpenChange,
}: ScenarioEditorGuidelinesModalProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set(['infrastructure']));
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const toggleStep = (stepId: string) => {
    const newExpanded = new Set(expandedSteps);
    if (newExpanded.has(stepId)) {
      newExpanded.delete(stepId);
    } else {
      newExpanded.add(stepId);
    }
    setExpandedSteps(newExpanded);
  };

  const handleClose = () => {
    if (dontShowAgain) {
      // Store preference in sessionStorage (session-scoped)
      sessionStorage.setItem('hideScenarioGuidelinesModal', 'true');
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>How to Build and Deploy Scenarios</DialogTitle>
          <DialogDescription>
            Follow these steps to successfully create and deploy a scenario configuration
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {GUIDELINE_STEPS.map((step) => (
            <div key={step.id} className="border rounded-lg overflow-hidden">
              <button
                onClick={() => toggleStep(step.id)}
                className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-4 text-left">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-semibold text-sm">
                    {step.number}
                  </div>
                  <div>
                    <h3 className="font-semibold">{step.title}</h3>
                    {!expandedSteps.has(step.id) && (
                      <p className="text-sm text-muted-foreground">{step.description}</p>
                    )}
                  </div>
                </div>
                {expandedSteps.has(step.id) ? (
                  <ChevronUp className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                )}
              </button>

              {expandedSteps.has(step.id) && (
                <div className="px-4 pb-4 border-t bg-muted/30">
                  <p className="text-sm text-foreground">{step.description}</p>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="border-t pt-4 space-y-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="dont-show-again"
              checked={dontShowAgain}
              onCheckedChange={(checked) => setDontShowAgain(checked as boolean)}
            />
            <label
              htmlFor="dont-show-again"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
            >
              Don&apos;t show again this session
            </label>
          </div>

          <Button onClick={handleClose} className="w-full">
            Got it
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
