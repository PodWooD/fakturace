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
  'billing:write': ['ADMIN', 'ACCOUNTANT'],
  'billing:read': ['ADMIN', 'ACCOUNTANT', 'VIEWER'],
  'invoices:generate': ['ADMIN', 'ACCOUNTANT'],
  'invoices:delete': ['ADMIN', 'ACCOUNTANT'],
  'invoices:export': ['ADMIN', 'ACCOUNTANT'],
  'receivedInvoices:ocr': ['ADMIN', 'ACCOUNTANT'],
  'receivedInvoices:approve': ['ADMIN', 'ACCOUNTANT'],
  'hardware:write': ['ADMIN', 'ACCOUNTANT'],
  'organizations:write': ['ADMIN', 'ACCOUNTANT'],
  'workRecords:write': ['ADMIN', 'ACCOUNTANT', 'TECHNICIAN'],
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
