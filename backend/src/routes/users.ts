import express, { Request, Response } from 'express';
// @ts-ignore
import bcrypt from 'bcryptjs';
import { PrismaClient, UserRole, User } from '@prisma/client';
import authMiddleware, { authorize } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

const mapUser = (user: User) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
});

const validateRole = (role?: string): UserRole => {
    if (!role) {
        return UserRole.VIEWER;
    }
    const normalized = role.toUpperCase();
    if (Object.values(UserRole).includes(normalized as UserRole)) {
        return normalized as UserRole;
    }
    throw new Error('Neplatná role');
};

router.use(authMiddleware);
router.use(authorize('users:manage'));

router.get('/', async (req: Request, res: Response) => {
    try {
        const users = await prisma.user.findMany({
            orderBy: { createdAt: 'desc' },
        });
        res.json(users.map(mapUser));
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Chyba při načítání uživatelů' });
    }
});

router.post('/', async (req: Request, res: Response) => {
    try {
        const { name, email, password, role } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Jméno, e-mail a heslo jsou povinné' });
        }

        const normalizedRole = validateRole(role);
        const hash = await bcrypt.hash(password, 10);

        const user = await prisma.user.create({
            data: {
                name,
                email,
                password: hash,
                role: normalizedRole,
            },
        });

        res.status(201).json(mapUser(user));
    } catch (error: any) {
        if (error.code === 'P2002') {
            return res.status(409).json({ error: 'Uživatel s tímto e-mailem již existuje' });
        }
        console.error('Error creating user:', error);
        res.status(500).json({ error: 'Chyba při vytváření uživatele' });
    }
});

router.put('/:id', async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (!id) {
            return res.status(400).json({ error: 'Neplatné ID uživatele' });
        }

        const { name, email, role, password } = req.body;
        const data: any = {};

        if (name !== undefined) data.name = name;
        if (email !== undefined) data.email = email;
        if (role !== undefined) data.role = validateRole(role);
        if (password) {
            data.password = await bcrypt.hash(password, 10);
        }

        const user = await prisma.user.update({
            where: { id },
            data,
        });

        res.json(mapUser(user));
    } catch (error: any) {
        if (error.code === 'P2002') {
            return res.status(409).json({ error: 'Uživatel s tímto e-mailem již existuje' });
        }
        if (error.code === 'P2025') {
            return res.status(404).json({ error: 'Uživatel nenalezen' });
        }
        console.error('Error updating user:', error);
        res.status(500).json({ error: 'Chyba při aktualizaci uživatele' });
    }
});

router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (!id) {
            return res.status(400).json({ error: 'Neplatné ID uživatele' });
        }

        await prisma.user.delete({ where: { id } });
        res.json({ success: true });
    } catch (error: any) {
        if (error.code === 'P2025') {
            return res.status(404).json({ error: 'Uživatel nenalezen' });
        }
        console.error('Error deleting user:', error);
        res.status(500).json({ error: 'Chyba při mazání uživatele' });
    }
});

export default router;
