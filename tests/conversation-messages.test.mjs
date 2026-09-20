import test from 'node:test';
import assert from 'node:assert/strict';
import { applyConversationMessages } from '../src/utils/conversationMessages.ts';

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

// Model the same functional state updates used by the component. Network completion order is controlled.
function conversation() {
  let messages = [], latest = 0;
  return {
    get messages() { return messages; },
    get latest() { return latest; },
    async poll(response, initial = false) {
      const page = await response;
      messages = applyConversationMessages(messages, page.messages, initial);
      latest = Math.max(latest, ...page.messages.map(message => message.sequence));
    },
    async send(response) {
      const message = await response;
      messages = applyConversationMessages(messages, [message]);
      // Sending cannot advance the read cursor: another participant's reply may still be unread.
    },
  };
}

test('an old empty GET arriving after the first successful POST preserves the saved reply and retry GET deduplicates it', async () => {
  const state = conversation();
  await state.poll(Promise.resolve({ messages: [] }), true);
  const delayedGet = deferred(), post = deferred();
  const pendingGet = state.poll(delayedGet.promise);
  const pendingPost = state.send(post.promise);
  const saved = { id: 'first-reply', sequence: 1, role: 'admin', body: 'تم استلام الطلب', createdAt: '2026-09-20T10:00:01.000Z' };

  post.resolve(saved);
  await pendingPost;
  assert.deepEqual(state.messages, [saved]);
  assert.equal(state.latest, 0, 'POST must not skip unread replies by moving the GET cursor');

  delayedGet.resolve({ messages: [] });
  await pendingGet;
  assert.deepEqual(state.messages, [saved], 'a pre-send empty snapshot must not erase a confirmed reply');
  assert.equal(state.latest, 0);

  await state.poll(Promise.resolve({ messages: [saved] }));
  assert.deepEqual(state.messages, [saved], 'the next GET confirms the reply without duplicating it');
  assert.equal(state.latest, 1);
});

test('a delayed GET retains another participant reply before the sent reply and orders by sequence, not timestamps', async () => {
  const state = conversation();
  await state.poll(Promise.resolve({ messages: [] }), true);
  const delayedGet = deferred();
  const pendingGet = state.poll(delayedGet.promise);
  const other = { id: 'admin-reply', sequence: 5, role: 'admin', body: 'يرجى توضيح الموقع', createdAt: '2026-09-20T10:00:02.000Z' };
  const saved = { id: 'client-reply', sequence: 6, role: 'client', body: 'الموقع في الرياض', createdAt: '2026-09-20T10:00:01.000Z' };
  await state.send(Promise.resolve(saved));

  delayedGet.resolve({ messages: [other] });
  await pendingGet;
  assert.deepEqual(state.messages, [other, saved]);
  assert.equal(state.latest, 5, 'only messages seen by GET advance the cursor');
  await state.poll(Promise.resolve({ messages: [saved] }));
  assert.deepEqual(state.messages, [other, saved]);
  assert.equal(state.latest, 6);

  await state.poll(Promise.resolve({ messages: [saved] }), true);
  assert.deepEqual(state.messages, [saved], 'an explicit initial reload replaces the previously loaded page');
});
