import { FormEvent, useState } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface ChatInputProps {
  onSend: (message: string) => Promise<void>;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [message, setMessage] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed || disabled) {
      return;
    }

    setMessage('');
    await onSend(trimmed);
  };

  return (
    <form onSubmit={submit} className="space-y-2 border-t bg-background p-3">
      <Textarea
        value={message}
        disabled={disabled}
        onChange={(event) => setMessage(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            void submit(event);
          }
        }}
        placeholder="Ask about services, providers, or use-cases..."
        className="min-h-[80px] resize-none"
      />
      <div className="flex justify-end">
        <Button type="submit" disabled={disabled || !message.trim()} className="gap-2">
          <Send className="h-4 w-4" />
          Send
        </Button>
      </div>
    </form>
  );
}
