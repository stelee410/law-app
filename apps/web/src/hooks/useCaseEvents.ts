import { useEffect, useState } from 'react';
import { apiUrl, parseCaseEvent } from '../lib/api';
import type { CaseEvent } from '../lib/types';
import { useAuthStore } from '../state/authStore';

export function useCaseEvents(caseId: string, enabled = true) {
  const token = useAuthStore((state) => state.token);
  const [events, setEvents] = useState<CaseEvent[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!enabled || !caseId || !token) return;

    const controller = new AbortController();
    let eventName = 'message';
    let dataBuffer = '';

    async function connect() {
      try {
        const response = await fetch(apiUrl(`/cases/${caseId}/events`), {
          headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
          signal: controller.signal
        });
        if (!response.ok || !response.body) {
          setConnected(false);
          return;
        }

        setConnected(true);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (!controller.signal.aborted) {
          const { value, done } = await reader.read();
          if (done) break;
          handleChunk(decoder.decode(value, { stream: true }));
        }
      } catch {
        if (!controller.signal.aborted) setConnected(false);
      }
    }

    function handleChunk(chunk: string) {
      for (const line of chunk.split(/\r?\n/)) {
        if (line.startsWith('event:')) {
          eventName = line.slice('event:'.length).trim();
        } else if (line.startsWith('data:')) {
          dataBuffer += `${line.slice('data:'.length).trim()}\n`;
        } else if (line === '') {
          const event = parseCaseEvent(caseId, eventName, dataBuffer.trim());
          if (event) setEvents((items) => [event, ...items].slice(0, 20));
          eventName = 'message';
          dataBuffer = '';
        }
      }
    }

    void connect();

    return () => {
      controller.abort();
    };
  }, [caseId, enabled, token]);

  return { events, connected };
}
