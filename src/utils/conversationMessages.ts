import type { RequestMessage } from './requestInboxApi';

export function applyConversationMessages(current: RequestMessage[], incoming: RequestMessage[], initial = false): RequestMessage[] {
  // A background read can predate a successful send, even before the first polling cursor exists.
  const retained = initial ? [] : current;
  return Array.from(new Map([...retained, ...incoming].map(message => [message.id, message])).values())
    .sort((a, b) => a.sequence - b.sequence);
}
