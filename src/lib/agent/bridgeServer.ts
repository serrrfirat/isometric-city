import type { AgentActionRequest, AgentObservation, MayorMessage, UserAdvice, StreamChunk, StreamEvent } from './types';

let latestObservation: AgentObservation | null = null;
let lastObservationAt = 0;

const actionQueue: AgentActionRequest[] = [];
const messageHistory: MayorMessage[] = [];
const adviceQueue: UserAdvice[] = [];

const MAX_MESSAGE_HISTORY = 100;

type StreamClient = {
  id: string;
  controller: ReadableStreamDefaultController<Uint8Array>;
};

const streamClients: StreamClient[] = [];
let currentStreamId: string | null = null;
let currentStreamBuffer = '';

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function registerStreamClient(controller: ReadableStreamDefaultController<Uint8Array>): string {
  const id = generateId('client');
  streamClients.push({ id, controller });
  return id;
}

export function unregisterStreamClient(id: string): void {
  const idx = streamClients.findIndex((c) => c.id === id);
  if (idx !== -1) {
    streamClients.splice(idx, 1);
  }
}

function broadcastToClients(event: StreamEvent): void {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  const encoder = new TextEncoder();
  const encoded = encoder.encode(data);
  
  for (const client of streamClients) {
    try {
      client.controller.enqueue(encoded);
    } catch {
      // Client disconnected, will be cleaned up
    }
  }
}

export function pushStreamChunk(content: string, done: boolean, providedStreamId?: string): { streamId: string; chunkId: string } {
  if (!currentStreamId || providedStreamId) {
    currentStreamId = providedStreamId || generateId('stream');
    currentStreamBuffer = '';
    broadcastToClients({ type: 'start', data: { streamId: currentStreamId, at: Date.now() } });
  }
  
  const chunkId = generateId('chunk');
  const chunk: StreamChunk = {
    id: chunkId,
    streamId: currentStreamId,
    content,
    at: Date.now(),
    done,
  };
  
  currentStreamBuffer += content;
  broadcastToClients({ type: 'chunk', data: chunk });
  
  if (done) {
    broadcastToClients({ type: 'end', data: { streamId: currentStreamId, at: Date.now() } });
    currentStreamId = null;
    currentStreamBuffer = '';
  }
  
  return { streamId: chunk.streamId, chunkId };
}

export function getCurrentStreamState(): { streamId: string | null; buffer: string } {
  return { streamId: currentStreamId, buffer: currentStreamBuffer };
}

export function getConnectedClientCount(): number {
  return streamClients.length;
}

export function setLatestObservation(observation: AgentObservation): void {
  latestObservation = observation;
  lastObservationAt = Date.now();
}

export function getLatestObservation(): { observation: AgentObservation | null; lastObservationAt: number } {
  return { observation: latestObservation, lastObservationAt };
}

export function enqueueActionRequest(request: AgentActionRequest): number {
  actionQueue.push(request);
  return actionQueue.length;
}

export function dequeueNextActionRequest(): AgentActionRequest | null {
  return actionQueue.shift() ?? null;
}

export function clearAgentQueue(): void {
  actionQueue.length = 0;
}

export function addMayorMessage(message: Omit<MayorMessage, 'id' | 'at'>): MayorMessage {
  const newMessage: MayorMessage = {
    ...message,
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    at: Date.now(),
  };
  messageHistory.push(newMessage);
  if (messageHistory.length > MAX_MESSAGE_HISTORY) {
    messageHistory.shift();
  }
  return newMessage;
}

export function getMessagesSince(sinceId?: string): MayorMessage[] {
  if (!sinceId) {
    return [...messageHistory];
  }
  const idx = messageHistory.findIndex((m) => m.id === sinceId);
  if (idx === -1) {
    return [...messageHistory];
  }
  return messageHistory.slice(idx + 1);
}

export function addUserAdvice(content: string): UserAdvice {
  const advice: UserAdvice = {
    id: `adv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    content,
    at: Date.now(),
    read: false,
  };
  adviceQueue.push(advice);
  return advice;
}

export function getUnreadAdvice(): UserAdvice[] {
  const unread = adviceQueue.filter((a) => !a.read);
  unread.forEach((a) => {
    a.read = true;
  });
  return unread;
}

export function getAllAdvice(): UserAdvice[] {
  return [...adviceQueue];
}
