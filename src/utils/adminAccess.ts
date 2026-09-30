import type { Client } from '../components/client/AuthContext';
import type { Page } from '../data/productPages';

type AdminUser = Pick<Client, 'adminSession' | 'permissions'>;

export function adminLandingPage(user: AdminUser): Page {
  return user.permissions.platformAdmin
    ? 'admin'
    : user.permissions.manageRequests
      ? 'admin-requests'
      : user.permissions.reviewBrokers
        ? 'admin-lessors'
        : 'client';
}

export function canAccessAdminPage(user: AdminUser | null, page: Page): boolean {
  if (!user?.adminSession) return false;
  if (user.permissions.platformAdmin) return true;
  return (page === 'admin-requests' && user.permissions.manageRequests) ||
    (page === 'admin-lessors' && user.permissions.reviewBrokers);
}
