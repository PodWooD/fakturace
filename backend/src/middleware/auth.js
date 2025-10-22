const jwt = require('jsonwebtoken');

const ROLES = {
  ADMIN: 'ADMIN',
  ACCOUNTANT: 'ACCOUNTANT',
  TECHNICIAN: 'TECHNICIAN',
  VIEWER: 'VIEWER',
};

const permissions = {
  'queues:read': [ROLES.ADMIN],
  'system:audit': [ROLES.ADMIN],
  'accounting:lock': [ROLES.ADMIN],
  'invoices:generate': [ROLES.ADMIN, ROLES.ACCOUNTANT],
  'invoices:export': [ROLES.ADMIN, ROLES.ACCOUNTANT],
  'invoices:delete': [ROLES.ADMIN, ROLES.ACCOUNTANT],
  'workRecords:write': [ROLES.ADMIN, ROLES.ACCOUNTANT, ROLES.TECHNICIAN],
  'receivedInvoices:ocr': [ROLES.ADMIN, ROLES.ACCOUNTANT],
  'receivedInvoices:approve': [ROLES.ADMIN, ROLES.ACCOUNTANT],
  'hardware:write': [ROLES.ADMIN, ROLES.ACCOUNTANT],
  'billing:write': [ROLES.ADMIN, ROLES.ACCOUNTANT],
  'billing:read': [ROLES.ADMIN, ROLES.ACCOUNTANT, ROLES.VIEWER],
  'organizations:write': [ROLES.ADMIN, ROLES.ACCOUNTANT],
  'users:manage': [ROLES.ADMIN],
};

const authMiddleware = (req, res, next) => {
  try {
    // Získání tokenu z hlavičky
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({ message: 'Chybí autorizační token' });
    }

    // Token má formát "Bearer <token>"
    const token = authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ message: 'Neplatný formát tokenu' });
    }

    // Verifikace tokenu
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Přidání uživatelských dat do požadavku
    req.user = decoded;
    if (!req.user.role) {
      req.user.role = ROLES.VIEWER;
    }
    
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token vypršel' });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Neplatný token' });
    }
    
    return res.status(500).json({ message: 'Chyba při ověřování tokenu' });
  }
};

const authorize = (permissionKey) => {
  const allowedRoles = permissions[permissionKey];
  if (!allowedRoles) {
    console.warn(`[ACL] Permission ${permissionKey} not defined.`);
    return (req, res, next) => next();
  }

  return (req, res, next) => {
    const role = req.user?.role || ROLES.VIEWER;

    if (role === ROLES.ADMIN) {
      return next();
    }

    if (!allowedRoles.includes(role)) {
      return res.status(403).json({ error: 'Nedostatečná oprávnění' });
    }

    return next();
  };
};

module.exports = authMiddleware;
module.exports.authorize = authorize;
module.exports.ROLES = ROLES;
module.exports.permissions = permissions;
