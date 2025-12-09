import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { categoriesApi, type Service, type CreateServiceData } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { X, Plus } from 'lucide-react';
import { useState } from 'react';

const serviceFormSchema = z.object({
  shortName: z.string().min(1, 'Short name is required').max(50),
  title: z.string().min(1, 'Title is required').max(200),
  categoryId: z.string().min(1, 'Category is required'),
  provider: z.string().min(1, 'Provider is required').max(100),
  description: z.string().max(2000).optional(),
  type: z.enum(['Software', 'Hardware', 'Software/Hardware']),
  trlCurrent: z.number().min(1).max(9).optional(),
  trlExpected: z.number().min(1).max(9).optional(),
  license: z.string().max(100).optional(),
  repositoryTable: z.enum(['INTACT_TOOLBOX', 'OTHER_SERVICES']),
  currentVersion: z.string().max(50).optional(),
});

type ServiceFormValues = z.infer<typeof serviceFormSchema>;

interface ServiceFormProps {
  service?: Service;
  onSubmit: (data: CreateServiceData) => Promise<void>;
  isSubmitting?: boolean;
  defaultTable?: 'INTACT_TOOLBOX' | 'OTHER_SERVICES';
}

export function ServiceForm({ service, onSubmit, isSubmitting, defaultTable }: ServiceFormProps) {
  const [standards, setStandards] = useState<string[]>(service?.standards || []);
  const [standardInput, setStandardInput] = useState('');
  const [interactsWith, setInteractsWith] = useState<string[]>(service?.interactsWith || []);
  const [interactsInput, setInteractsInput] = useState('');
  const [useCases, setUseCases] = useState<string[]>(service?.potentialUseCases || []);
  const [useCaseInput, setUseCaseInput] = useState('');
  const [inputs, setInputs] = useState<{ name: string; description?: string }[]>(service?.inputs || []);
  const [outputs, setOutputs] = useState<{ name: string; description?: string }[]>(service?.outputs || []);

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: categoriesApi.list,
  });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ServiceFormValues>({
    resolver: zodResolver(serviceFormSchema),
    defaultValues: {
      shortName: service?.shortName || '',
      title: service?.title || '',
      categoryId: service?.categoryId?._id || '',
      provider: service?.provider || '',
      description: service?.description || '',
      type: service?.type || 'Software',
      trlCurrent: service?.trl?.current || 5,
      trlExpected: service?.trl?.expected || 7,
      license: service?.license || '',
      repositoryTable: service?.repositoryTable || defaultTable || 'INTACT_TOOLBOX',
      currentVersion: service?.currentVersion || '',
    },
  });

  const trlCurrent = watch('trlCurrent');
  const trlExpected = watch('trlExpected');

  const handleFormSubmit = (data: ServiceFormValues) => {
    const serviceData: CreateServiceData = {
      shortName: data.shortName,
      title: data.title,
      categoryId: data.categoryId,
      provider: data.provider,
      description: data.description,
      type: data.type,
      trl: {
        current: data.trlCurrent,
        expected: data.trlExpected,
      },
      license: data.license,
      repositoryTable: data.repositoryTable,
      currentVersion: data.currentVersion,
      standards,
      inputs,
      outputs,
      interactsWith,
      potentialUseCases: useCases,
    };
    onSubmit(serviceData);
  };

  const addTag = (
    value: string,
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    inputSetter: React.Dispatch<React.SetStateAction<string>>
  ) => {
    if (value.trim()) {
      setter((prev) => [...prev, value.trim()]);
      inputSetter('');
    }
  };

  const removeTag = (index: number, setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    setter((prev) => prev.filter((_, i) => i !== index));
  };

  const addInputOutput = (
    type: 'input' | 'output',
    name: string,
    description: string
  ) => {
    if (name.trim()) {
      const item = { name: name.trim(), description: description.trim() || undefined };
      if (type === 'input') {
        setInputs((prev) => [...prev, item]);
      } else {
        setOutputs((prev) => [...prev, item]);
      }
    }
  };

  const removeInputOutput = (type: 'input' | 'output', index: number) => {
    if (type === 'input') {
      setInputs((prev) => prev.filter((_, i) => i !== index));
    } else {
      setOutputs((prev) => prev.filter((_, i) => i !== index));
    }
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="shortName">Short Name *</Label>
          <Input
            id="shortName"
            {...register('shortName')}
            placeholder="e.g., MMT"
            className="uppercase"
          />
          {errors.shortName && (
            <p className="text-sm text-destructive">{errors.shortName.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="provider">Provider *</Label>
          <Input
            id="provider"
            {...register('provider')}
            placeholder="e.g., MONT"
          />
          {errors.provider && (
            <p className="text-sm text-destructive">{errors.provider.message}</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="title">Title *</Label>
        <Input
          id="title"
          {...register('title')}
          placeholder="e.g., Montimage Monitoring Tool"
        />
        {errors.title && (
          <p className="text-sm text-destructive">{errors.title.message}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="categoryId">Category *</Label>
          <Select
            value={watch('categoryId')}
            onValueChange={(value) => setValue('categoryId', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((category) => (
                <SelectItem key={category._id} value={category._id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.categoryId && (
            <p className="text-sm text-destructive">{errors.categoryId.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="type">Type</Label>
          <Select
            value={watch('type')}
            onValueChange={(value) => setValue('type', value as ServiceFormValues['type'])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Software">Software</SelectItem>
              <SelectItem value="Hardware">Hardware</SelectItem>
              <SelectItem value="Software/Hardware">Software/Hardware</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          {...register('description')}
          placeholder="Describe the service..."
          rows={3}
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="license">License</Label>
          <Input
            id="license"
            {...register('license')}
            placeholder="e.g., Apache 2.0"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="currentVersion">Version</Label>
          <Input
            id="currentVersion"
            {...register('currentVersion')}
            placeholder="e.g., 1.0.0"
          />
        </div>

        <div className="space-y-2">
          <Label>Repository Table</Label>
          <Select
            value={watch('repositoryTable')}
            onValueChange={(value) => setValue('repositoryTable', value as ServiceFormValues['repositoryTable'])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="INTACT_TOOLBOX">INTACT Toolbox</SelectItem>
              <SelectItem value="OTHER_SERVICES">Other Services</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>TRL Current: {trlCurrent}</Label>
          <Slider
            value={[trlCurrent || 5]}
            onValueChange={([value]) => setValue('trlCurrent', value)}
            min={1}
            max={9}
            step={1}
          />
        </div>
        <div className="space-y-2">
          <Label>TRL Expected: {trlExpected}</Label>
          <Slider
            value={[trlExpected || 7]}
            onValueChange={([value]) => setValue('trlExpected', value)}
            min={1}
            max={9}
            step={1}
          />
        </div>
      </div>

      {/* Standards */}
      <div className="space-y-2">
        <Label>Standards</Label>
        <div className="flex gap-2">
          <Input
            value={standardInput}
            onChange={(e) => setStandardInput(e.target.value)}
            placeholder="e.g., ISO 27001"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTag(standardInput, setStandards, setStandardInput);
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => addTag(standardInput, setStandards, setStandardInput)}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-1">
          {standards.map((standard, i) => (
            <Badge key={i} variant="secondary" className="gap-1">
              {standard}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => removeTag(i, setStandards)}
              />
            </Badge>
          ))}
        </div>
      </div>

      {/* Interacts With */}
      <div className="space-y-2">
        <Label>Interacts With</Label>
        <div className="flex gap-2">
          <Input
            value={interactsInput}
            onChange={(e) => setInteractsInput(e.target.value)}
            placeholder="e.g., MAESTRO"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTag(interactsInput, setInteractsWith, setInteractsInput);
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => addTag(interactsInput, setInteractsWith, setInteractsInput)}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-1">
          {interactsWith.map((item, i) => (
            <Badge key={i} variant="outline" className="gap-1">
              {item}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => removeTag(i, setInteractsWith)}
              />
            </Badge>
          ))}
        </div>
      </div>

      {/* Use Cases */}
      <div className="space-y-2">
        <Label>Potential Use Cases</Label>
        <div className="flex gap-2">
          <Input
            value={useCaseInput}
            onChange={(e) => setUseCaseInput(e.target.value)}
            placeholder="Describe a use case..."
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTag(useCaseInput, setUseCases, setUseCaseInput);
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => addTag(useCaseInput, setUseCases, setUseCaseInput)}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-1">
          {useCases.map((item, i) => (
            <Badge key={i} variant="secondary" className="gap-1">
              {item}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => removeTag(i, setUseCases)}
              />
            </Badge>
          ))}
        </div>
      </div>

      {/* Inputs */}
      <div className="space-y-2">
        <Label>Inputs</Label>
        <div className="flex gap-2">
          <Input
            id="inputName"
            placeholder="Name"
            className="flex-1"
          />
          <Input
            id="inputDesc"
            placeholder="Description (optional)"
            className="flex-1"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => {
              const nameEl = document.getElementById('inputName') as HTMLInputElement;
              const descEl = document.getElementById('inputDesc') as HTMLInputElement;
              addInputOutput('input', nameEl.value, descEl.value);
              nameEl.value = '';
              descEl.value = '';
            }}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-1">
          {inputs.map((input, i) => (
            <div key={i} className="flex items-center gap-2 rounded-md bg-muted p-2 text-sm">
              <span className="font-medium">{input.name}</span>
              {input.description && (
                <span className="text-muted-foreground">- {input.description}</span>
              )}
              <X
                className="ml-auto h-4 w-4 cursor-pointer"
                onClick={() => removeInputOutput('input', i)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Outputs */}
      <div className="space-y-2">
        <Label>Outputs</Label>
        <div className="flex gap-2">
          <Input
            id="outputName"
            placeholder="Name"
            className="flex-1"
          />
          <Input
            id="outputDesc"
            placeholder="Description (optional)"
            className="flex-1"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => {
              const nameEl = document.getElementById('outputName') as HTMLInputElement;
              const descEl = document.getElementById('outputDesc') as HTMLInputElement;
              addInputOutput('output', nameEl.value, descEl.value);
              nameEl.value = '';
              descEl.value = '';
            }}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-1">
          {outputs.map((output, i) => (
            <div key={i} className="flex items-center gap-2 rounded-md bg-muted p-2 text-sm">
              <span className="font-medium">{output.name}</span>
              {output.description && (
                <span className="text-muted-foreground">- {output.description}</span>
              )}
              <X
                className="ml-auto h-4 w-4 cursor-pointer"
                onClick={() => removeInputOutput('output', i)}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : service ? 'Update Service' : 'Create Service'}
        </Button>
      </div>
    </form>
  );
}
