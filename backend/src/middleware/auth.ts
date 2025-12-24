import { Request, Response, NextFunction } from 'express';
// @ts-ignore
import jwt from 'jsonwebtoken';
import { UserRole } from '@prisma/client';

export interface AuthUser {
    id: number;
    email: string;
    role: string;
    name: string;
}

declare global {
    namespace Express {
        interface Request {
            user?: AuthUser;
        }
    }
}

export const ROLES = {
    ADMIN: 'ADMIN',
    ACCOUNTANT: 'ACCOUNTANT',
    TECHNICIAN: 'TECHNICIAN',
    VIEWER: 'VIEWER',
};

export const permissions: Record<string, string[]> = {
    'queues:read': [ROLES.ADMIN],
    'system:audit': [ROLES.ADMIN],
    'accounting:lock': [ROLES.ADMIN],
    'invoices:generate': [ROLES.ADMIN],
    'invoices:export': [ROLES.ADMIN],
    'invoices:delete': [ROLES.ADMIN],
    'workRecords:write': [ROLES.ADMIN, ROLES.TECHNICIAN],
    'receivedInvoices:ocr': [ROLES.ADMIN],
    'receivedInvoices:approve': [ROLES.ADMIN],
    'hardware:write': [ROLES.ADMIN],
    'billing:write': [ROLES.ADMIN],
    'billing:read': [ROLES.ADMIN, ROLES.ACCOUNTANT, ROLES.VIEWER],
    'organizations:write': [ROLES.ADMIN],
    'users:manage': [ROLES.ADMIN],
};

const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
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
        const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as AuthUser;

        // Přidání uživatelských dat do požadavku
        req.user = decoded;
        if (!req.user.role) {
            req.user.role = ROLES.VIEWER;
        }

        next();
    } catch (error: any) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Token vypršel' });
        }

        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ message: 'Neplatný token' });
        }

        return res.status(500).json({ message: 'Chyba při ověřování tokenu' });
    }
};

export const authorize = (permissionKey: string) => {
    const allowedRoles = permissions[permissionKey];
    if (!allowedRoles) {
        console.warn(`[ACL] Permission ${permissionKey} not defined.`);
        return (req: Request, res: Response, next: NextFunction) => next();
    }

    return (req: Request, res: Response, next: NextFunction) => {
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

export default authMiddleware;
