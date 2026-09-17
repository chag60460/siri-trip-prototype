import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { MAX_MESSAGE_LENGTH } from '../src/chat-protocol.ts';
import type { ChatEvent, ChatRequest } from '../src/chat-protocol.ts';
import { ChatError, CopilotPlanner } from './copilot-planner.ts';
import type { PlannerService } from './copilot-planner.ts';
import { GeminiBackend } from './gemini-backend.ts';
import { OpenAIBackend } from './openai-backend.ts';
import { Planner } from './copilot-planner.ts';
import { parseDay } from '../src/dates.ts';
import { isDemoAppConsents } from '../src/demo-apps.ts';

const MAX_BODY_BYTES = 64_000;
const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

/** A hosted key is the only supported public backend; a personal Copilot login stays loopback-only. */
export const hostedBackend = () => Boolean(process.env.AI_API_KEY && process.env.AI_BASE_URL) || Boolean(process.env.GEMINI_API_KEY);

export function createPlanner(): PlannerService {
  if (process.env.AI_API_KEY && process.env.AI_BASE_URL) return new Planner(new OpenAIBackend());
  if (process.env.GEMINI_API_KEY) return new Planner(new GeminiBackend());
  return new CopilotPlanner();
}

export function validateRequest(value: unknown): ChatRequest {
  if (typeof value !== 'object' || value === null
    || !('message' in value) || typeof value.message !== 'string' || !value.message.trim()
    || value.message.length > MAX_MESSAGE_LENGTH
    || !('sessionId' in value) || (value.sessionId !== null && (typeof value.sessionId !== 'string' || !UUID.test(value.sessionId)))
    || !('localDate' in value) || typeof value.localDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.localDate)
    || !('timeZone' in value) || typeof value.timeZone !== 'string' || value.timeZone.length > 80
    || ('calendarConsent' in value && value.calendarConsent !== 'granted' && value.calendarConsent !== 'denied')
    || ('appConsents' in value && !isDemoAppConsents(value.appConsents))) {
    throw new ChatError(400, 'Provide a non-empty message and valid chat context.');
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value.timeZone }).format();
  } catch (error) {
    if (error instanceof RangeError) throw new ChatError(400, 'The time zone is invalid.');
    throw error;
  }
  if (parseDay(value.localDate) === null) {
    throw new ChatError(400, 'The local date is invalid.');
  }
  const calendarConsent = 'calendarConsent' in value
    && (value.calendarConsent === 'granted' || value.calendarConsent === 'denied') ? value.calendarConsent : undefined;
  const appConsents = 'appConsents' in value && isDemoAppConsents(value.appConsents) ? value.appConsents : undefined;
  return {
    message: value.message.trim(), sessionId: value.sessionId, localDate: value.localDate, timeZone: value.timeZone,
    ...(calendarConsent ? { calendarConsent } : {}),
    ...(appConsents ? { appConsents } : {}),
  };
}

function checkOrigin(request: IncomingMessage) {
  const host = request.headers.host;
  if (!host) throw new ChatError(403, 'This AI connection requires a host header.');
  const local = /^(?:127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(host);
  if (!local && !hostedBackend()) {
    throw new ChatError(403, 'This AI connection is available only in the local preview.');
  }
  const expected = local ? `http://${host}` : `https://${host}`;
  if (request.headers.origin && request.headers.origin !== expected) {
    throw new ChatError(403, 'Cross-origin AI requests are not allowed.');
  }
  if (request.method !== 'GET' && (request.headers.origin !== expected || request.headers['x-siri-client'] !== 'web')) {
    throw new ChatError(403, 'Open the prototype page to use this AI connection.');
  }
}

function visitorKey(request: IncomingMessage): string {
  const forwarded = request.headers['x-forwarded-for'];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
  return first || request.socket.remoteAddress || 'unknown';
}

function readBody(request: IncomingMessage): Promise<unknown> {
  if (!request.headers['content-type']?.startsWith('application/json')) {
    throw new ChatError(415, 'Send the request as JSON.');
  }
  return new Promise((resolve, reject) => {
    let bytes = 0;
    let chunks: Buffer[] = [];
    let failed = false;
    request.on('data', (chunk: Buffer) => {
      if (failed) return;
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        failed = true;
        chunks = [];
        reject(new ChatError(413, 'The message is too large.'));
      } else {
        chunks.push(chunk);
      }
    });
    request.on('error', reject);
    request.on('end', () => {
      if (failed) return;
      try {
        const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        resolve(value);
      } catch (error) {
        if (error instanceof SyntaxError) reject(new ChatError(400, 'The request contains invalid JSON.'));
        else reject(error);
      }
    });
  });
}

function json(response: ServerResponse, status: number, value: object) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

export function createChatApi(service: PlannerService = createPlanner()) {
  const requests: number[] = [];
  const visitors = new Map<string, number[]>();
  return {
    async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
      const abort = new AbortController();
      let finished = false;
      let streaming = false;
      const emit = (event: ChatEvent) => {
        if (response.destroyed) return;
        if (!streaming) {
          response.writeHead(200, {
            'Content-Type': 'application/x-ndjson; charset=utf-8',
            'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
          });
          streaming = true;
        }
        response.write(`${JSON.stringify(event)}\n`);
      };
      response.on('close', () => { if (!finished) abort.abort(); });
      try {
        checkOrigin(request);
        if (request.url === '/api/ai/status' && request.method === 'GET') {
          json(response, 200, await service.status());
        } else if (request.url === '/api/chat' && request.method === 'POST') {
          const now = Date.now();
          while (requests[0] !== undefined && requests[0] < now - 60_000) requests.shift();
          if (requests.length >= 20) throw new ChatError(429, 'Please wait a moment before sending more messages.');
          if (hostedBackend()) {
            const key = visitorKey(request);
            const recent = (visitors.get(key) ?? []).filter(at => at > now - 60_000);
            if (recent.length >= 8) throw new ChatError(429, 'Please wait a moment before sending more messages.');
            recent.push(now);
            visitors.set(key, recent);
            for (const [id, times] of visitors) if (!times.some(at => at > now - 60_000)) visitors.delete(id);
          }
          const body = validateRequest(await readBody(request));
          requests.push(now);
          await service.stream(body, emit, abort.signal);
          response.end();
        } else if (request.url?.startsWith('/api/chat/') && request.method === 'DELETE') {
          const id = request.url.slice('/api/chat/'.length);
          if (!UUID.test(id)) throw new ChatError(400, 'The chat identifier is invalid.');
          await service.release(id);
          response.writeHead(204);
          response.end();
        } else {
          throw new ChatError(404, 'This AI endpoint does not exist.');
        }
      } catch (error) {
        if (!abort.signal.aborted) {
          const status = error instanceof ChatError ? error.status : 502;
          const message = error instanceof ChatError ? error.message : 'Copilot could not complete the reply. Check your connection and Copilot login, then try again.';
          console.error(`AI request failed (${status}).`);
          if (streaming) {
            emit({ type: 'error', message });
            response.end();
          } else {
            json(response, status, { message });
          }
        }
      } finally {
        finished = true;
      }
    },
    close: () => service.close(),
  };
}

export function copilotChatPlugin(): Plugin {
  const api = createChatApi();
  return {
    name: 'copilot-chat-api',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url?.startsWith('/api/')) void api.handle(request, response);
        else next();
      });
      server.httpServer?.once('close', () => {
        void api.close().catch(() => console.error('The Copilot chat backend could not close cleanly.'));
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url?.startsWith('/api/')) void api.handle(request, response);
        else next();
      });
      server.httpServer.once('close', () => {
        void api.close().catch(() => console.error('The Copilot chat backend could not close cleanly.'));
      });
    },
  };
}
