import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyBrokerDraft, validateBrokerStep, validateBrokerDocuments, workValues } from '../src/utils/brokerForm.ts';

const valid = { ...emptyBrokerDraft, name: 'اختبار النموذج', identity: '1000000000', phone: '0500000000', email: 'form@example.test', domains: 'مجال اختبار', regions: 'منطقة اختبار' };
test('broker validation is conditional on entity and accepts Arabic digits', () => {
  assert.deepEqual(validateBrokerStep(valid, 0), {});
  assert.ok(validateBrokerStep({ ...valid, identity: '' }, 0).identity);
  assert.deepEqual(validateBrokerStep({ ...valid, entity: 'company', identity: '', commercial: '1234567890' }, 0), {});
  assert.ok(validateBrokerStep({ ...valid, entity: 'company', commercial: '' }, 0).commercial);
  assert.deepEqual(validateBrokerStep({ ...valid, phone: '٠٥٠٠٠٠٠٠٠٠', identity: '١٠٠٠٠٠٠٠٠٠' }, 0), {});
  assert.ok(validateBrokerStep({ ...valid, phone: '123', email: 'bad' }, 0).phone);
  assert.ok(validateBrokerStep({ ...valid, email: 'bad' }, 0).email);
});
test('work choices are user supplied, bounded and deduplicated', () => {
  assert.deepEqual(workValues('أ، ب\nأ , ج'), ['أ', 'ب', 'ج']);
  assert.deepEqual(validateBrokerStep(valid, 1), {});
  assert.ok(validateBrokerStep({ ...valid, domains: '   ' }, 1).domains);
  assert.ok(validateBrokerStep({ ...valid, regions: 'x'.repeat(61) }, 1).regions);
});
test('local documents are optional and restricted to supported sizes and formats', () => {
  assert.equal(validateBrokerDocuments([]), undefined);
  assert.equal(validateBrokerDocuments([{ name: 'document.PDF', size: 1024 }]), undefined);
  assert.ok(validateBrokerDocuments([{ name: 'file.exe', size: 1024 }]));
  assert.ok(validateBrokerDocuments([{ name: 'empty.pdf', size: 0 }]));
  assert.ok(validateBrokerDocuments([{ name: 'large.pdf', size: 11 * 1024 * 1024 }]));
  assert.ok(validateBrokerDocuments(Array.from({ length: 6 }, () => ({ name: 'file.pdf', size: 100 }))));
});
