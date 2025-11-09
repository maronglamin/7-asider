import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { prisma } from '../db/prisma';
import { requireAuth, AuthedRequest } from '../middleware/auth';

const router = Router();

const uploadDir = path.join(process.cwd(), 'uploads', 'fields');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req: any, _file: any, cb: any) => cb(null, uploadDir),
  filename: (_req: any, file: any, cb: any) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '');
    const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    cb(null, `${base || 'image'}_${unique}${ext}`);
  },
});

const upload = multer({ storage });

// GET /fields/kyc/me - fetch current user's kyc record
router.get('/me', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const kyc = await (prisma as any).fieldKyc.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { images: { orderBy: { order: 'asc' } } },
    });
    if (!kyc) return res.json({ exists: false });
    res.json({ exists: true, kyc });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to fetch KYC' });
  }
});

// GET /fields/kyc/mine - list current user's fields with pagination
// Query: ?limit=10&cursor=<lastId>
router.get('/mine', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 10));
    const cursor = (req.query.cursor as string | undefined) || undefined;

    const results = await (prisma as any).fieldKyc.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        name: true,
        city: true,
        address: true,
        surfaceType: true,
        size: true,
        pricePerHour: true,
        status: true,
        rejectionReason: true,
        suspensionReason: true,
        createdAt: true,
        updatedAt: true,
        images: { select: { id: true, url: true, order: true }, orderBy: { order: 'asc' } },
      },
    });

    let nextCursor: string | null = null;
    let items = results;
    if (results.length > limit) {
      const nextItem = results[results.length - 1];
      nextCursor = nextItem.id;
      items = results.slice(0, limit);
    }

    res.json({ items, nextCursor });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to fetch fields' });
  }
});

// GET /fields/kyc/public - public listing with search/sort/pagination
// Query: ?q=term&sort=price_asc|price_desc|recent|nearest&limit=12&offset=0&city=&surfaceType=&hasLights=true|false&all=1
router.get('/public', async (req: Request, res: Response) => {
  try {
    const qRaw = (req.query.q as string | undefined) || '';
    const q = qRaw.trim();
    const sort = ((req.query.sort as string | undefined) || 'recent').toLowerCase();
    const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 12));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const city = (req.query.city as string | undefined)?.trim();
    const surfaceType = (req.query.surfaceType as string | undefined)?.trim();
    const hasLightsParam = (req.query.hasLights as string | undefined)?.toLowerCase();
    const includeAll = ((req.query.all as string | undefined)?.toLowerCase() === '1' || (req.query.all as string | undefined)?.toLowerCase() === 'true');

    const where: any = {
      ...(!includeAll ? { status: 'APPROVED' } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { address: { contains: q, mode: 'insensitive' } },
              { city: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(city ? { city: { contains: city, mode: 'insensitive' } } : {}),
      ...(surfaceType && surfaceType.toLowerCase() !== 'any'
        ? { surfaceType: { equals: surfaceType, mode: 'insensitive' } }
        : {}),
      ...(hasLightsParam === 'true' || hasLightsParam === 'false'
        ? { hasLights: hasLightsParam === 'true' }
        : {}),
    };

    let orderBy: any = { updatedAt: 'desc' };
    if (sort === 'price_asc') orderBy = { pricePerHour: 'asc' };
    else if (sort === 'price_desc') orderBy = { pricePerHour: 'desc' };
    else if (sort === 'nearest') orderBy = { updatedAt: 'desc' }; // placeholder; wire to geo later

    const results = await (prisma as any).fieldKyc.findMany({
      where,
      orderBy,
      skip: offset,
      take: limit + 1,
      select: {
        id: true,
        name: true,
        city: true,
        address: true,
        surfaceType: true,
        size: true,
        pricePerHour: true,
        hasLights: true,
        description: true,
        updatedAt: true,
        images: { select: { id: true, url: true, order: true }, orderBy: { order: 'asc' } },
      },
    });

    const hasMore = results.length > limit;
    const itemsRaw = hasMore ? results.slice(0, limit) : results;
    const items = itemsRaw.map((it: any) => ({
      ...it,
      pricePerHour: it.pricePerHour != null ? Number(it.pricePerHour) : null,
    }));

    res.json({ items, nextOffset: offset + items.length, hasMore });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to fetch fields' });
  }
});

// GET /fields/kyc/public/:id - public fetch single field
// Query: ?all=1 (testing to include any status)
router.get('/public/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const includeAll = ((req.query.all as string | undefined)?.toLowerCase() === '1' || (req.query.all as string | undefined)?.toLowerCase() === 'true');
    const item = await (prisma as any).fieldKyc.findUnique({
      where: { id },
      include: { images: { orderBy: { order: 'asc' } } },
    });
    if (!item) return res.status(404).json({ error: 'Not found' });
    if (!includeAll && item.status !== 'APPROVED') return res.status(404).json({ error: 'Not found' });
    const result = { ...item, pricePerHour: item.pricePerHour != null ? Number(item.pricePerHour) : null };
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to fetch field' });
  }
});

// GET /fields/kyc/:id - fetch a specific field (owner only)
router.get('/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const id = req.params.id;
    const item = await (prisma as any).fieldKyc.findUnique({
      where: { id },
      include: { images: { orderBy: { order: 'asc' } } },
    });
    if (!item || item.userId !== userId) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to fetch field' });
  }
});

// PATCH /fields/kyc/:id/price - update pricePerHour (owner only)
router.patch('/:id/price', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const id = req.params.id;
    const { pricePerHour } = req.body as any;
    if (pricePerHour === undefined || pricePerHour === null || pricePerHour === '') {
      return res.status(400).json({ error: 'pricePerHour is required' });
    }
    const priceNum = Number(pricePerHour);
    if (!isFinite(priceNum) || priceNum < 0) {
      return res.status(400).json({ error: 'Invalid pricePerHour' });
    }

    const existing = await (prisma as any).fieldKyc.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) return res.status(404).json({ error: 'Not found' });

    const updated = await (prisma as any).fieldKyc.update({
      where: { id },
      data: { pricePerHour: priceNum },
    });
    res.json({ ok: true, id: updated.id, pricePerHour: updated.pricePerHour });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to update price' });
  }
});

// POST /fields/kyc - create or resubmit (only allowed if new or REJECTED)
router.post('/', requireAuth, upload.array('images', 3), async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const {
      name,
      city,
      address,
      phone,
      surfaceType,
      size,
      pricePerHour,
      hasLights,
      description,
      updatedBy,
    } = req.body as any;

    if (!name) return res.status(400).json({ error: 'name is required' });

    const files = (req as any).files as any[] | undefined;
    if (!files || files.length < 1 || files.length > 3) {
      return res.status(400).json({ error: 'Upload 1 to 3 images' });
    }

    // Build public URLs for saved files (served by express static)
    const imageUrls = files.map((f) => `/uploads/fields/${path.basename(f.path)}`);

    const data = {
      userId,
      name,
      city: city || null,
      address: address || null,
      phone: phone || null,
      surfaceType: surfaceType || null,
      size: size || null,
      pricePerHour: pricePerHour ? parseFloat(pricePerHour) : null,
      hasLights: hasLights === 'true' || hasLights === true,
      description: description || null,
      status: 'PENDING' as const,
      rejectionReason: null,
      suspensionReason: null,
      updatedBy: updatedBy || null,
    };

    const kyc = await (prisma as any).fieldKyc.create({ data });

    const imagesData = imageUrls.map((url, idx) => ({ fieldKycId: kyc.id, url, order: idx }));
    await (prisma as any).fieldKycImage.createMany({ data: imagesData });

    const result = await (prisma as any).fieldKyc.findUnique({ where: { id: kyc.id }, include: { images: { orderBy: { order: 'asc' } } } });
    res.json({ ok: true, id: kyc.id, kyc: result });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to submit KYC' });
  }
});

export default router;


