'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { MayorMessage, MayorMessagesResponse, PostAdviceResponse } from '@/lib/agent/types';

type ChatEntry =
  | { type: 'mayor'; message: MayorMessage }
  | { type: 'user'; content: string; at: number };

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function MessageIcon({ messageType }: { messageType: MayorMessage['type'] }) {
  switch (messageType) {
    case 'thinking':
      return <span className="text-yellow-400">🤔</span>;
    case 'action':
      return <span className="text-green-400">🏗️</span>;
    case 'status':
      return <span className="text-blue-400">📊</span>;
    case 'greeting':
      return <span className="text-purple-400">👋</span>;
    case 'response':
      return <span className="text-cyan-400">💬</span>;
    default:
      return <span>🏛️</span>;
  }
}

export function MayorChatPanel() {
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const lastMessageIdRef = useRef<string | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    let isCancelled = false;

    const poll = async () => {
      if (isCancelled) return;

      try {
        const url = lastMessageIdRef.current
          ? `/api/agent/messages?since=${lastMessageIdRef.current}`
          : '/api/agent/messages';

        const res = await fetch(url);
        if (!res.ok) {
          setIsConnected(false);
          return;
        }

        const data = (await res.json()) as MayorMessagesResponse;
        if (!data.ok || !data.messages) {
          setIsConnected(false);
          return;
        }

        setIsConnected(true);

        if (data.messages.length > 0) {
          const newEntries: ChatEntry[] = data.messages.map((m) => ({ type: 'mayor', message: m }));
          setEntries((prev) => [...prev, ...newEntries]);
          lastMessageIdRef.current = data.messages[data.messages.length - 1].id;
          setTimeout(scrollToBottom, 50);
        }
      } catch {
        setIsConnected(false);
      }
    };

    void poll();
    const timer = setInterval(() => {
      void poll();
    }, 1000);

    return () => {
      isCancelled = true;
      clearInterval(timer);
    };
  }, [scrollToBottom]);

  const sendAdvice = useCallback(async () => {
    const content = input.trim();
    if (!content || isSending) return;

    setIsSending(true);
    setInput('');

    setEntries((prev) => [...prev, { type: 'user', content, at: Date.now() }]);
    setTimeout(scrollToBottom, 50);

    try {
      const res = await fetch('/api/agent/advice', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content }),
      });

      const data = (await res.json()) as PostAdviceResponse;
      if (!data.ok) {
        console.error('Failed to send advice:', data.error);
      }
    } catch (err) {
      console.error('Failed to send advice:', err);
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  }, [input, isSending, scrollToBottom]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void sendAdvice();
      }
    },
    [sendAdvice]
  );

  return (
    <div className="flex flex-col h-full bg-slate-900/95 border-l border-slate-700 w-80">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700 bg-slate-800/50">
        <span className="text-lg">🏛️</span>
        <span className="font-semibold text-white">Mayor AI</span>
        <span
          className={cn(
            'ml-auto w-2 h-2 rounded-full',
            isConnected ? 'bg-green-500' : 'bg-slate-500'
          )}
          title={isConnected ? 'Connected' : 'Disconnected'}
        />
      </div>

      <ScrollArea className="flex-1 p-3">
        <div ref={scrollRef} className="space-y-3">
          {entries.length === 0 && (
            <div className="text-center text-slate-500 py-8 text-sm">
              <div className="text-2xl mb-2">🏛️</div>
              <div>Waiting for Mayor AI to connect...</div>
              <div className="text-xs mt-1 text-slate-600">
                Run the /play-isocity skill in Claude Code
              </div>
            </div>
          )}
          {entries.map((entry, i) =>
            entry.type === 'mayor' ? (
              <div key={entry.message.id} className="flex gap-2">
                <div className="flex-shrink-0 mt-0.5">
                  <MessageIcon messageType={entry.message.type} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white whitespace-pre-wrap break-words">
                    {entry.message.content}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {formatTime(entry.message.at)}
                  </div>
                </div>
              </div>
            ) : (
              <div key={`user-${i}-${entry.at}`} className="flex gap-2 justify-end">
                <div className="bg-blue-600 rounded-lg px-3 py-2 max-w-[85%]">
                  <div className="text-sm text-white whitespace-pre-wrap break-words">
                    {entry.content}
                  </div>
                  <div className="text-xs text-blue-300 mt-1 text-right">
                    {formatTime(entry.at)}
                  </div>
                </div>
              </div>
            )
          )}
        </div>
      </ScrollArea>

      <div className="p-3 border-t border-slate-700 bg-slate-800/30">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Advise the Mayor..."
            disabled={isSending}
            className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 disabled:opacity-50"
          />
          <button
            onClick={() => void sendAdvice()}
            disabled={!input.trim() || isSending}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg text-white text-sm font-medium transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
