import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

// Writes an uploaded file under uploads/<subdir>/ and returns the relative URL it's servable at.
// Deliberately relative, not an absolute `http://host:port/...` URL — see MapsService.uploadImage
// for why (this app is single-origin; a baked-in host breaks under a Cloudflare Tunnel/https).
export function saveUploadedImage(
  file: Express.Multer.File,
  subdir: string,
): string {
  const uploadDir = join(process.cwd(), 'uploads', subdir);
  if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });

  const filename = `${Date.now()}_${file.originalname.replace(/\s+/g, '_')}`;
  writeFileSync(join(uploadDir, filename), file.buffer);

  return `/uploads/${subdir}/${filename}`;
}
