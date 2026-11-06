import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Exercise the browser API module without changing the application's module resolution.
const moduleUrl = source => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText).toString('base64');
const form = moduleUrl(readFileSync(new URL('../src/utils/equipmentForm.ts', import.meta.url), 'utf8'));
const source = readFileSync(new URL('../src/utils/equipmentApi.ts', import.meta.url), 'utf8');
const { loadEquipment, loadEquipmentItem, saveEquipment, EquipmentApiError } = await import(moduleUrl(source.replace("'./equipmentForm'", JSON.stringify(form))));
const input = {
  name: 'حفار اختبار الرد', category: 'excavator', description: 'مواصفات معدة لاختبار رد الخادم الفعلي.', location: 'الرياض',
  hourlyRateHalalas: 12550, dailyRateHalalas: null, operatorMode: 'with_operator', availability: 'available', status: 'active',
};
const item = {
  ...input, id: 'd3c5638e-21ea-4b2b-a59c-e11707b0ab11', currency: 'SAR', version: 1,
  createdAt: '2026-11-06T00:00:00.000Z', updatedAt: '2026-11-06T00:00:00.000Z',
  reviewStatus: 'pending', rejectionReason: null,
};

test('equipment create, edit, detail and list accept the server review metadata', async t => {
  let response = item;
  t.mock.method(globalThis, 'fetch', async url => Response.json(String(url).includes('?page=')
    ? { equipment: [response], total: 1, page: 1, pageSize: 20 } : { equipment: response }));
  for (const reviewStatus of ['pending', 'approved', 'rejected']) {
    response = { ...item, reviewStatus, rejectionReason: reviewStatus === 'rejected' ? 'صحح مواصفات المعدة.' : null };
    assert.deepEqual(await saveEquipment(input, 'isolated-response-test'), response);
    assert.deepEqual(await saveEquipment(input, 'isolated-response-test', { id: item.id, version: 1 }), response);
    assert.deepEqual(await loadEquipmentItem(item.id), response);
    assert.deepEqual((await loadEquipment()).equipment, [response]);
  }
});

test('malformed review metadata and unexpected response fields remain rejected', async t => {
  let response;
  t.mock.method(globalThis, 'fetch', async () => Response.json({ equipment: response }));
  for (const patch of [{ reviewStatus: 'unknown' }, { reviewStatus: 1 }, { rejectionReason: {} }, { rejectionReason: 42 }, { ownerId: 'unexpected' }, { hourlyRateHalalas: -1 }]) {
    response = { ...item, ...patch };
    await assert.rejects(loadEquipmentItem(item.id), EquipmentApiError);
    await assert.rejects(saveEquipment(input, 'isolated-response-test'), EquipmentApiError);
  }
});

test('equipment responses must still identify the requested record', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ equipment: item }));
  const other = { id: 'b4c5638e-21ea-4b2b-a59c-e11707b0ab11', version: 1 };
  await assert.rejects(loadEquipmentItem(other.id), EquipmentApiError);
  await assert.rejects(saveEquipment(input, 'isolated-response-test', other), EquipmentApiError);
});
