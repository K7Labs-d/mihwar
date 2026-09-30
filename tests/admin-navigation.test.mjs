import test from 'node:test';
import assert from 'node:assert/strict';
import { adminLandingPage, canAccessAdminPage } from '../src/utils/adminAccess.ts';

const user = (permissions = {}, adminSession = true) => ({
  adminSession,
  permissions: { platformAdmin: false, manageRequests: false, reviewBrokers: false, ...permissions },
});

test('delegated administrators retain only their permitted workspaces and landing pages', () => {
  for (const [permission, destination] of [
    ['manageRequests', 'admin-requests'], ['reviewBrokers', 'admin-lessors'],
  ]) {
    const delegated = user({ [permission]: true });
    assert.equal(adminLandingPage(delegated), destination);
    assert.equal(canAccessAdminPage(delegated, destination), true);
    for (const page of ['admin', 'admin-requests', 'admin-lessors', 'admin-users', 'admin-equipment', 'admin-audit']) {
      if (page !== destination) assert.equal(canAccessAdminPage(delegated, page), false);
    }
  }
  const both = user({ manageRequests: true, reviewBrokers: true });
  assert.equal(adminLandingPage(both), 'admin-requests');
  assert.equal(canAccessAdminPage(both, 'admin-lessors'), true);
});

test('owner navigation requires an administrative session and ordinary users get no admin access', () => {
  const owner = user({ platformAdmin: true, manageRequests: true, reviewBrokers: true });
  assert.equal(adminLandingPage(owner), 'admin');
  for (const page of ['admin', 'admin-requests', 'admin-lessors', 'admin-users', 'admin-equipment', 'admin-audit']) {
    assert.equal(canAccessAdminPage(owner, page), true);
    assert.equal(canAccessAdminPage({ ...owner, adminSession: false }, page), false);
    assert.equal(canAccessAdminPage(user(), page), false);
    assert.equal(canAccessAdminPage(null, page), false);
  }
  assert.equal(adminLandingPage(user()), 'client');
});
