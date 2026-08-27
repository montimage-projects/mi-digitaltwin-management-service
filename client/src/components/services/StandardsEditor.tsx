import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { X, Plus, Search, ChevronsUpDown } from 'lucide-react';

// Comprehensive list of compliance standards
const COMPLIANCE_STANDARDS = [
  // ISO/IEC Standards
  {
    value: 'ISO/IEC 27001',
    label: 'ISO/IEC 27001',
    category: 'ISO/IEC Standards',
    description: 'Information Security Management',
  },
  {
    value: 'ISO/IEC 27002',
    label: 'ISO/IEC 27002',
    category: 'ISO/IEC Standards',
    description: 'Security Controls',
  },
  {
    value: 'ISO/IEC 27017',
    label: 'ISO/IEC 27017',
    category: 'ISO/IEC Standards',
    description: 'Cloud Security',
  },
  {
    value: 'ISO/IEC 27018',
    label: 'ISO/IEC 27018',
    category: 'ISO/IEC Standards',
    description: 'Cloud Privacy',
  },
  {
    value: 'ISO/IEC 27701',
    label: 'ISO/IEC 27701',
    category: 'ISO/IEC Standards',
    description: 'Privacy Information Management',
  },
  {
    value: 'ISO/IEC 22301',
    label: 'ISO/IEC 22301',
    category: 'ISO/IEC Standards',
    description: 'Business Continuity',
  },
  {
    value: 'ISO/IEC 20000',
    label: 'ISO/IEC 20000',
    category: 'ISO/IEC Standards',
    description: 'IT Service Management',
  },
  {
    value: 'ISO 9001',
    label: 'ISO 9001',
    category: 'ISO/IEC Standards',
    description: 'Quality Management',
  },
  // NIST Frameworks
  {
    value: 'NIST CSF',
    label: 'NIST CSF',
    category: 'NIST Frameworks',
    description: 'Cybersecurity Framework',
  },
  {
    value: 'NIST SP 800-53',
    label: 'NIST SP 800-53',
    category: 'NIST Frameworks',
    description: 'Security and Privacy Controls',
  },
  {
    value: 'NIST SP 800-171',
    label: 'NIST SP 800-171',
    category: 'NIST Frameworks',
    description: 'Protecting CUI',
  },
  {
    value: 'NIST SP 800-82',
    label: 'NIST SP 800-82',
    category: 'NIST Frameworks',
    description: 'ICS Security',
  },
  // EU Regulations
  {
    value: 'GDPR',
    label: 'GDPR',
    category: 'EU Regulations',
    description: 'General Data Protection Regulation',
  },
  {
    value: 'NIS2',
    label: 'NIS2',
    category: 'EU Regulations',
    description: 'Network and Information Security Directive',
  },
  {
    value: 'DORA',
    label: 'DORA',
    category: 'EU Regulations',
    description: 'Digital Operational Resilience Act',
  },
  {
    value: 'EU AI Act',
    label: 'EU AI Act',
    category: 'EU Regulations',
    description: 'Artificial Intelligence Regulation',
  },
  {
    value: 'eIDAS',
    label: 'eIDAS',
    category: 'EU Regulations',
    description: 'Electronic Identification',
  },
  // Industry Standards
  {
    value: 'PCI DSS',
    label: 'PCI DSS',
    category: 'Industry Standards',
    description: 'Payment Card Industry Data Security',
  },
  {
    value: 'SOC 2',
    label: 'SOC 2',
    category: 'Industry Standards',
    description: 'Service Organization Control',
  },
  {
    value: 'SOC 1',
    label: 'SOC 1',
    category: 'Industry Standards',
    description: 'Financial Reporting Controls',
  },
  {
    value: 'HIPAA',
    label: 'HIPAA',
    category: 'Industry Standards',
    description: 'Health Insurance Portability',
  },
  {
    value: 'HITRUST',
    label: 'HITRUST',
    category: 'Industry Standards',
    description: 'Health Information Trust',
  },
  // Industrial/OT Standards
  {
    value: 'IEC 62443',
    label: 'IEC 62443',
    category: 'Industrial Standards',
    description: 'Industrial Automation Security',
  },
  {
    value: 'NERC CIP',
    label: 'NERC CIP',
    category: 'Industrial Standards',
    description: 'Critical Infrastructure Protection',
  },
  {
    value: 'IEC 61850',
    label: 'IEC 61850',
    category: 'Industrial Standards',
    description: 'Power Utility Automation',
  },
  {
    value: 'IEC 62351',
    label: 'IEC 62351',
    category: 'Industrial Standards',
    description: 'Power Systems Security',
  },
  // Other Frameworks
  {
    value: 'CIS Controls',
    label: 'CIS Controls',
    category: 'Other Frameworks',
    description: 'Center for Internet Security',
  },
  {
    value: 'COBIT',
    label: 'COBIT',
    category: 'Other Frameworks',
    description: 'IT Governance Framework',
  },
  {
    value: 'CSA STAR',
    label: 'CSA STAR',
    category: 'Other Frameworks',
    description: 'Cloud Security Alliance',
  },
  {
    value: 'FedRAMP',
    label: 'FedRAMP',
    category: 'Other Frameworks',
    description: 'Federal Risk Authorization',
  },
  {
    value: 'CMMC',
    label: 'CMMC',
    category: 'Other Frameworks',
    description: 'Cybersecurity Maturity Model',
  },
  {
    value: 'TISAX',
    label: 'TISAX',
    category: 'Other Frameworks',
    description: 'Automotive Information Security',
  },
];

export interface StandardsEditorProps {
  value: string[];
  onChange: (standards: string[]) => void;
}

export function StandardsEditor({ value, onChange }: StandardsEditorProps) {
  const [search, setSearch] = useState('');
  const [customInput, setCustomInput] = useState('');

  const filteredStandards = useMemo(
    () =>
      COMPLIANCE_STANDARDS.filter(
        (s) =>
          s.label.toLowerCase().includes(search.toLowerCase()) ||
          s.description.toLowerCase().includes(search.toLowerCase())
      ),
    [search]
  );

  const categories = useMemo(
    () => [...new Set(filteredStandards.map((s) => s.category))],
    [filteredStandards]
  );

  const toggleStandard = (standardValue: string) => {
    if (value.includes(standardValue)) {
      onChange(value.filter((s) => s !== standardValue));
    } else {
      onChange([...value, standardValue]);
    }
  };

  const addCustomStandard = () => {
    const trimmed = customInput.trim();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
    }
    setCustomInput('');
  };

  const clearAll = () => onChange([]);

  return (
    <div className="space-y-2">
      <div>
        <Label>Standards</Label>
        <p className="text-xs text-muted-foreground mt-0.5">
          Compliance standards this service adheres to
        </p>
      </div>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
            {value.length === 0
              ? 'Select standards...'
              : `${value.length} standard${value.length > 1 ? 's' : ''} selected`}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0" align="start">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search standards..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
          </div>
          <ScrollArea className="h-72">
            <div className="p-2">
              {filteredStandards.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  No standards found
                </div>
              ) : (
                categories.map((category) => (
                  <div key={category} className="mb-3">
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {category}
                    </div>
                    {filteredStandards
                      .filter((s) => s.category === category)
                      .map((standard) => {
                        const isSelected = value.includes(standard.value);
                        return (
                          <div
                            key={standard.value}
                            className="flex items-center gap-2 px-2 py-2 rounded-md hover:bg-accent cursor-pointer"
                            onClick={() => toggleStandard(standard.value)}
                          >
                            <Checkbox checked={isSelected} />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium">{standard.label}</div>
                              <div className="text-xs text-muted-foreground">
                                {standard.description}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
          {/* Add custom standard */}
          <div className="border-t p-2">
            <p className="text-xs text-muted-foreground mb-2">
              Can&apos;t find your standard? Add a custom one:
            </p>
            <div className="flex gap-2">
              <Input
                placeholder="Enter custom standard name..."
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                className="h-8 text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCustomStandard();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-2"
                onClick={addCustomStandard}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {value.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-muted-foreground mt-2"
                onClick={clearAll}
              >
                Clear all
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((standard, i) => (
            <Badge key={i} variant="secondary" className="gap-1">
              {standard}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => onChange(value.filter((_, idx) => idx !== i))}
              />
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
