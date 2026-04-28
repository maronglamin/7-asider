import fs from 'fs';
import path from 'path';

export function uploadPath(...segments: string[]): string {
  return path.join(process.cwd(), 'uploads', ...segments);
}

export function ensureUploadDirectory(dir: string): string {
  if (fs.existsSync(dir)) {
    const stat = fs.statSync(dir);
    if (!stat.isDirectory()) {
      throw new Error(`Upload path exists but is not a directory: ${dir}`);
    }
    return dir;
  }

  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
