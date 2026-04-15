import { Bot, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ChatFabProps {
  open: boolean;
  onClick: () => void;
  attention?: boolean;
}

export function ChatFab({ open, onClick, attention }: ChatFabProps) {
  return (
    <Button
      type="button"
      onClick={onClick}
      size="icon"
      className={`fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-xl ${
        attention ? 'animate-pulse' : ''
      }`}
      title={open ? 'Close AI chat' : 'Open AI chat'}
    >
      {open ? <MessageCircle className="h-6 w-6" /> : <Bot className="h-6 w-6" />}
    </Button>
  );
}
