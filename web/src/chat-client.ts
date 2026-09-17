import { isChatEvent } from './chat-protocol';
import type { AIStatus, ChatEvent, ChatRequest } from './chat-protocol';

async function responseError(response: Response): Promise<Error> {
  const value: unknown = await response.json();
  const message = typeof value === 'object' && value !== null && 'message' in value && typeof value.message === 'string'
    ? value.message : `The AI server returned HTTP ${response.status}.`;
  return new Error(message);
}

export async function getAIStatus(signal: AbortSignal): Promise<AIStatus> {
  const response = await fetch('/api/ai/status', { signal });
  if (!response.ok) throw await responseError(response);
  const value: unknown = await response.json();
  if (typeof value !== 'object' || value === null || !('ready' in value) || value.ready !== true
    || !('model' in value) || typeof value.model !== 'string') throw new Error('The AI connection returned an invalid status.');
  return { ready: true, model: value.model };
}

export async function streamChat(request: ChatRequest, onEvent: (event: ChatEvent) => void, signal: AbortSignal): Promise<void> {
  const response = await fetch('/api/chat', {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', 'X-Siri-Client': 'web' },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw await responseError(response);
  if (!response.body) throw new Error('The AI response did not contain a stream.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let completed: Extract<ChatEvent, { type: 'done' }> | null = null;
  const consume = (line: string) => {
    if (!line.trim()) return;
    const event: unknown = JSON.parse(line);
    if (!isChatEvent(event)) throw new Error('The AI server returned an invalid event.');
    if (event.type === 'error') throw new Error(event.message);
    if (event.type === 'done') completed = event;
    else onEvent(event);
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      if (buffer.length > 1_000_000) throw new Error('The AI response is too large.');
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) consume(line);
      if (done) break;
    }
    if (buffer.trim()) consume(buffer);
    if (!completed) throw new Error('The AI connection ended before the reply was complete.');
    onEvent(completed);
  } finally {
    reader.releaseLock();
  }
}

export async function releaseChat(id: string): Promise<void> {
  const response = await fetch(`/api/chat/${encodeURIComponent(id)}`, {
    method: 'DELETE', headers: { 'X-Siri-Client': 'web' },
  });
  if (!response.ok) throw await responseError(response);
}
