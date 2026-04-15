import { MessageSquarePlus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AgentConversationSummary } from '@/lib/agent-api';

interface ConversationSidebarProps {
  conversations: AgentConversationSummary[];
  activeConversationId: string | null;
  onSelect: (conversationId: string) => void;
  onNewChat: () => void;
  onDelete: (conversationId: string) => void;
  loading?: boolean;
  width?: number;
}

export function ConversationSidebar({
  conversations,
  activeConversationId,
  onSelect,
  onNewChat,
  onDelete,
  loading,
  width = 256,
}: ConversationSidebarProps) {
  return (
    <div className="flex h-full flex-col bg-muted/20 flex-shrink-0" style={{ width }}>
      <div className="border-b p-3">
        <Button type="button" onClick={onNewChat} className="w-full gap-2" size="sm">
          <MessageSquarePlus className="h-4 w-4" />
          New Chat
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="space-y-1 p-2">
          {loading && <p className="px-2 py-3 text-xs text-muted-foreground">Loading...</p>}

          {!loading && conversations.length === 0 && (
            <p className="px-2 py-3 text-xs text-muted-foreground">No conversations yet.</p>
          )}

          {conversations.map((conversation) => {
            const isActive = conversation._id === activeConversationId;
            return (
              <button
                key={conversation._id}
                type="button"
                onClick={() => onSelect(conversation._id)}
                className={`w-full overflow-hidden rounded-md px-2 py-2 text-left transition-colors ${
                  isActive ? 'bg-background shadow-sm' : 'hover:bg-muted'
                }`}
              >
                <p className="truncate text-sm font-medium">{conversation.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {conversation.lastMessage || 'No messages yet'}
                </p>
                <div className="mt-1 flex items-center gap-1">
                  <p className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">
                    {new Date(conversation.updatedAt).toLocaleString()}
                  </p>
                  <div
                    role="button"
                    tabIndex={0}
                    className="shrink-0 cursor-pointer rounded p-0.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    title="Delete conversation"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDelete(conversation._id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        event.stopPropagation();
                        onDelete(conversation._id);
                      }
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
