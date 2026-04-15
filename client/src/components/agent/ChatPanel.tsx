import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Bot, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AgentStatusBadge } from './AgentStatusBadge';
import { ConversationSidebar } from './ConversationSidebar';
import { ChatInput } from './ChatInput';
import { ChatMessage } from './ChatMessage';
import { useAgentStore } from '@/store/agent-store';

export function ChatPanel() {
  const {
    isOpen,
    conversations,
    activeConversationId,
    messages,
    isStreaming,
    agentHealth,
    loadingConversations,
    setOpen,
    loadConversations,
    loadConversation,
    newConversation,
    sendMessage,
    deleteConversation,
    refreshHealth,
  } = useAgentStore();

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    void loadConversations();
    void refreshHealth();
  }, [isOpen, loadConversations, refreshHealth]);

  const status = useMemo(() => agentHealth?.status || 'offline', [agentHealth]);

  const [sidebarWidth, setSidebarWidth] = useState(256);
  const isDragging = useRef(false);

  const onMouseDown = useCallback(() => {
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      // The panel is anchored to the right edge, so sidebar width = mouse X
      // offset from the right edge of the viewport minus the panel offset.
      const panelEl = document.getElementById('chat-panel');
      if (!panelEl) return;
      const panelLeft = panelEl.getBoundingClientRect().left;
      const newWidth = Math.min(Math.max(e.clientX - panelLeft, 160), 480);
      setSidebarWidth(newWidth);
    };

    const onMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  return (
    <>
      {isOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/30"
          onClick={() => setOpen(false)}
          aria-label="Close chat panel backdrop"
        />
      )}

      <aside
        id="chat-panel"
        className={`fixed right-0 top-0 z-50 h-screen w-[96vw] max-w-5xl border-l bg-background shadow-2xl transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex h-full">
          <ConversationSidebar
            conversations={conversations}
            activeConversationId={activeConversationId}
            loading={loadingConversations}
            width={sidebarWidth}
            onSelect={(conversationId) => void loadConversation(conversationId)}
            onNewChat={newConversation}
            onDelete={(conversationId) => void deleteConversation(conversationId)}
          />

          {/* Drag handle */}
          <div
            className="w-1 cursor-col-resize bg-border hover:bg-primary/40 active:bg-primary/60 flex-shrink-0 transition-colors"
            onMouseDown={onMouseDown}
            title="Drag to resize"
          />

          <div className="flex min-w-0 flex-1 flex-col">
            <header className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-semibold">Boss Agent</p>
                  <p className="text-xs text-muted-foreground">Repository assistant</p>
                </div>
                <AgentStatusBadge status={status} />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => void refreshHealth()}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" onClick={() => setOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </header>

            <ScrollArea className="flex-1">
              <ErrorBoundary
                fallback={
                  <div className="p-4 text-sm text-destructive">
                    A rendering error occurred in the chat. Please start a new conversation.
                  </div>
                }
              >
                <div className="space-y-3 p-4">
                  {messages.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                      Ask about services, providers, standards, and use-cases from the catalog.
                    </div>
                  ) : (
                    messages.map((message, index) => (
                      <ChatMessage
                        key={message.id}
                        role={message.role}
                        content={message.content}
                        sources={message.sources}
                        isStreaming={
                          isStreaming &&
                          index === messages.length - 1 &&
                          message.role === 'assistant'
                        }
                      />
                    ))
                  )}
                </div>
              </ErrorBoundary>
            </ScrollArea>

            <ChatInput onSend={sendMessage} disabled={isStreaming || status === 'offline'} />
          </div>
        </div>
      </aside>
    </>
  );
}
