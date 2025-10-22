import { describe, expect, it } from 'vitest';
import { hasPermission, isAdmin } from './permissions';

describe('permissions helper', () => {
  it('grants ADMIN full access', () => {
    expect(hasPermission('ADMIN', 'billing:write')).toBe(true);
    expect(hasPermission('ADMIN', 'queues:read')).toBe(true);
    expect(isAdmin('ADMIN')).toBe(true);
  });

  it('enforces role specific permissions', () => {
    expect(hasPermission('ACCOUNTANT', 'billing:write')).toBe(true);
    expect(hasPermission('ACCOUNTANT', 'queues:read')).toBe(false);
    expect(hasPermission('VIEWER', 'billing:read')).toBe(true);
    expect(hasPermission('VIEWER', 'billing:write')).toBe(false);
  });

  it('handles missing role gracefully', () => {
    expect(hasPermission(undefined, 'invoices:generate')).toBe(false);
    expect(isAdmin(undefined)).toBe(false);
  });
});
