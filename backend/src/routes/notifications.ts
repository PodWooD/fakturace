import express, { Request, Response } from 'express';
import { PrismaClient, NotificationType, NotificationLevel } from '@prisma/client';
import authMiddleware from '../middleware/auth';
import {
    getNotifications,
    markNotificationRead,
    markAllNotificationsRead,
} from '../services/notificationService';
// @ts-ignore
import { enqueueNotification } from '../queues/notificationQueue';

interface AuthRequest extends Request {
    user?: {
        id: number;
        email: string;
        role: string;
        name: string;
    };
}

const router = express.Router();
const prisma = new PrismaClient();

router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { unread, type, limit } = req.query;
        const notifications = await getNotifications(prisma, {
            userId: req.user?.id ?? null,
            unreadOnly: unread === 'true',
            types: type as NotificationType,
            limit: limit ? parseInt(String(limit), 10) : undefined,
        });

        res.json(notifications);
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ error: 'Chyba při načítání notifikací' });
    }
});

router.post('/:id/read', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (!id) {
            return res.status(400).json({ error: 'Neplatné ID notifikace' });
        }

        const result = await markNotificationRead(prisma, {
            id,
            userId: req.user?.id ?? null,
        });

        if (result.count === 0) {
            return res.status(404).json({ error: 'Notifikace nenalezena' });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({ error: 'Chyba při označení notifikace jako přečtené' });
    }
});

router.post('/read-all', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        await markAllNotificationsRead(prisma, {
            userId: req.user?.id ?? null,
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Error marking all notifications as read:', error);
        res.status(500).json({ error: 'Chyba při označení všech notifikací jako přečtené' });
    }
});

// Debug endpoint to create manual notifications during development (optional)
if (process.env.NODE_ENV !== 'production') {
    router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
        try {
            const { type = NotificationType.OCR_FAILURE, level = NotificationLevel.INFO, message, metadata } = req.body;
            if (!message) {
                return res.status(400).json({ error: 'Chybí zpráva notifikace' });
            }

            const notificationPayload = {
                type,
                level,
                message,
                metadata,
                userId: req.user?.id ?? null,
            };

            await enqueueNotification(notificationPayload, prisma);

            res.status(202).json({ queued: true });
        } catch (error) {
            console.error('Error creating notification:', error);
            res.status(500).json({ error: 'Chyba při vytváření notifikace' });
        }
    });
}

export default router;
