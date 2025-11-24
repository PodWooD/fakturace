export type UserRole = 'ADMIN' | 'ACCOUNTANT' | 'TECHNICIAN' | 'VIEWER' | undefined;

export type PermissionKey =
  | 'queues:read'
  | 'system:audit'
  | 'accounting:lock'
  | 'billing:write'
  | 'billing:read'
  | 'invoices:generate'
  | 'invoices:delete'
  | 'invoices:export'
  | 'receivedInvoices:ocr'
  | 'receivedInvoices:approve'
  | 'hardware:write'
  | 'organizations:write'
  | 'workRecords:write'
  | 'users:manage';

const PERMISSIONS: Record<PermissionKey, Array<'ADMIN' | 'ACCOUNTANT' | 'TECHNICIAN' | 'VIEWER'>> = {
  'queues:read': ['ADMIN'],
  'system:audit': ['ADMIN'],
  'accounting:lock': ['ADMIN'],
  'billing:write': ['ADMIN'],
  'billing:read': ['ADMIN', 'ACCOUNTANT', 'VIEWER'],
  'invoices:generate': ['ADMIN'],
  'invoices:delete': ['ADMIN'],
  'invoices:export': ['ADMIN'],
  'receivedInvoices:ocr': ['ADMIN'],
  'receivedInvoices:approve': ['ADMIN'],
  'hardware:write': ['ADMIN'],
  'organizations:write': ['ADMIN'],
  'workRecords:write': ['ADMIN', 'TECHNICIAN'],
  'users:manage': ['ADMIN'],
};

export function hasPermission(role: UserRole, permission: PermissionKey) {
  if (!role) {
    return false;
  }
  if (role === 'ADMIN') {
    return true;
  }
  const allowed = PERMISSIONS[permission];
  if (!allowed) {
    return false;
  }
  return allowed.includes(role);
}

export function isAdmin(role: UserRole) {
  return role === 'ADMIN';
}
