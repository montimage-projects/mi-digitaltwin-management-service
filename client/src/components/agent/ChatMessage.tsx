import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Button } from '@/components/ui/button';
import { Copy } from 'lucide-react';
import { ServiceCard } from './ServiceCard';

interface ChatMessageProps {
  role: 'user' | 'assistant' | 'system';
  content: string;
  isStreaming?: boolean;
  sources?: Array<{
    serviceId: string;
    shortName: string;
    title: string;
    score: number;
  }>;
}

/**
 * Strip Qwen3-style <think>…</think> reasoning blocks from model output.
 * These tags are not valid Markdown/HTML and crash ReactMarkdown.
 * We also strip any incomplete opening <think> tag that may appear during
 * streaming (the closing tag hasn't arrived yet).
 */
function stripThinkingBlocks(text: string): string {
  // Remove complete <think>…</think> blocks (including multiline)
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  // Remove an incomplete opening <think> tag at the end (still streaming)
  cleaned = cleaned.replace(/<think>[\s\S]*$/gi, '');
  return cleaned.trim();
}

export function ChatMessage({ role, content, isStreaming, sources = [] }: ChatMessageProps) {
  const isUser = role === 'user';

  // Memoize cleaned content so we don't re-run regex on every render
  const displayContent = useMemo(() => stripThinkingBlocks(content), [content]);

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[90%] rounded-lg px-3 py-2 text-sm ${
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
        }`}
      >
        {role === 'assistant' ? (
          <div className="prose prose-sm dark:prose-invert max-w-none break-words">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              /* Disallow raw HTML in markdown to prevent unknown tags from
                 crashing the React tree (e.g. <think>, <artifact>, etc.) */
              skipHtml
              components={{
                code(props) {
                  const { className, children, ...rest } = props;
                  const match = /language-(\w+)/.exec(className || '');
                  const text = String(children).replace(/\n$/, '');

                  if (!match) {
                    return (
                      <code className="rounded bg-black/10 px-1 py-0.5" {...rest}>
                        {children}
                      </code>
                    );
                  }

                  return (
                    <div className="relative my-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="absolute right-2 top-2 h-7 px-2"
                        onClick={() => navigator.clipboard.writeText(text)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                      <SyntaxHighlighter
                        style={oneDark}
                        language={match[1]}
                        PreTag="div"
                        customStyle={{ borderRadius: 8, margin: 0, paddingTop: 36 }}
                      >
                        {text}
                      </SyntaxHighlighter>
                    </div>
                  );
                },
              }}
            >
              {displayContent || (isStreaming ? '...' : '')}
            </ReactMarkdown>
          </div>
        ) : (
          <p className="whitespace-pre-wrap">{content}</p>
        )}

        {sources.length > 0 && (
          <div className="mt-2 space-y-2 border-t border-border/60 pt-2">
            {sources.map((source) => (
              <ServiceCard
                key={`${source.serviceId}-${source.shortName}`}
                serviceId={source.serviceId}
                shortName={source.shortName}
                title={source.title}
                score={source.score}
              />
            ))}
          </div>
        )}

        {isStreaming && (
          <p className="mt-1 text-xs text-muted-foreground animate-pulse">Typing...</p>
        )}
      </div>
    </div>
  );
}
