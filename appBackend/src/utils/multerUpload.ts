import multer from 'multer';
import path from 'path';
import { ensureUploadDirectory } from './uploads';

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const RECEIPT_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.pdf']);

function safeExtension(originalname: string, allowed: Set<string>, fallback: string): string {
  const ext = path.extname(originalname || '').toLowerCase();
  return allowed.has(ext) ? ext : fallback;
}

function buildStorage(uploadDir: string, allowed: Set<string>, fallbackExt: string, namePrefix: string) {
  return multer.diskStorage({
    destination: (_req: any, _file: any, cb: any) => {
      try {
        cb(null, ensureUploadDirectory(uploadDir));
      } catch (error) {
        cb(error as Error, uploadDir);
      }
    },
    filename: (_req: any, file: any, cb: any) => {
      const ext = safeExtension(file.originalname, allowed, fallbackExt);
      const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      cb(null, `${namePrefix}_${unique}${ext}`);
    },
  });
}

export function createImageUpload(uploadDir: string) {
  return multer({
    storage: buildStorage(uploadDir, IMAGE_EXTENSIONS, '.jpg', 'image'),
    limits: { fileSize: MAX_FILE_BYTES, files: 3 },
    fileFilter: (_req: any, file: any, cb: any) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      if (!IMAGE_EXTENSIONS.has(ext)) {
        cb(new Error('Only JPG, PNG, and WebP images are allowed'));
        return;
      }
      cb(null, true);
    },
  });
}

export function createReceiptUpload(uploadDir: string) {
  return multer({
    storage: buildStorage(uploadDir, RECEIPT_EXTENSIONS, '.jpg', 'receipt'),
    limits: { fileSize: MAX_FILE_BYTES, files: 1 },
    fileFilter: (_req: any, file: any, cb: any) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      if (!RECEIPT_EXTENSIONS.has(ext)) {
        cb(new Error('Only JPG, PNG, WebP, or PDF receipts are allowed'));
        return;
      }
      cb(null, true);
    },
  });
}
