import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { HelpCircle } from 'lucide-react';

export interface TrlLevel {
  level: number;
  name: string;
  description: string;
}

export interface TrlSectionProps {
  label: string;
  value: number;
  description: string;
  levels: TrlLevel[];
  onChange: (value: number) => void;
}

export function TrlSection({ label, value, description, levels, onChange }: TrlSectionProps) {
  const currentLevel = levels.find((l) => l.level === value);

  return (
    <div className="space-y-2">
      <div>
        <div className="flex items-center gap-1.5">
          <Label>
            {label}: {value}
          </Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-5 w-5 text-muted-foreground hover:text-foreground"
              >
                <HelpCircle className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[400px] p-0" align="start">
              <div className="p-3 border-b">
                <h4 className="font-semibold text-sm">Technology Readiness Levels (TRL)</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  A measurement system to assess the maturity of a technology
                </p>
              </div>
              <ScrollArea className="h-72">
                <div className="p-2 space-y-1">
                  {levels.map((trl) => (
                    <div
                      key={trl.level}
                      className={`flex gap-3 p-2 rounded-md ${
                        trl.level === value
                          ? 'bg-primary/10 border border-primary/20'
                          : 'hover:bg-accent'
                      }`}
                    >
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-sm font-bold text-primary">{trl.level}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{trl.name}</div>
                        <div className="text-xs text-muted-foreground">{trl.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </PopoverContent>
          </Popover>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <Slider value={[value]} onValueChange={([v]) => onChange(v)} min={1} max={9} step={1} />
      {currentLevel && (
        <div className="mt-2 p-2 rounded-md bg-muted/50">
          <p className="text-xs font-medium text-foreground">{currentLevel.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{currentLevel.description}</p>
        </div>
      )}
    </div>
  );
}
