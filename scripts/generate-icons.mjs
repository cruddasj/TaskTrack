import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const root = path.resolve(process.cwd());
const srcSvg = path.join(root, 'assets', 'icons', 'app-logo.svg');
const outDir = path.join(root, 'assets', 'icons');

const sizes = [192, 256, 384, 512, 1024];
const brandBg = '#111827';
const SCALE_MASKABLE = 0.8; // safe zone recommended
const SCALE_ANY = 0.9; // slightly larger for launcher
const MIN_DENSITY = 2048; // oversample the vector for crisper rasterization on large outputs
const PNG_OPAQUE = { compressionLevel: 9, palette: true }; // palette reduces size on flat-color tiles
const PNG_TRANSPARENT = { compressionLevel: 9 }; // keep alpha channel for launcher icons

async function run() {
  const svgRaw = await fs.promises.readFile(srcSvg, 'utf8');
  const svgWhiteStr = svgRaw.replace('<svg ', '<svg fill="#ffffff" ');
  const svgWhite = Buffer.from(svgWhiteStr);

  for (const size of sizes) {
    // Maskable (splash): dark tile + white logo centered
    {
      const outMaskable = path.join(outDir, `icon-${size}-maskable.png`);
      const density = Math.max(MIN_DENSITY, size);
      const logoBuf = await sharp(svgWhite, { density, limitInputPixels: false })
        .resize(Math.round(size * SCALE_MASKABLE), Math.round(size * SCALE_MASKABLE), { fit: 'contain' })
        .png(PNG_TRANSPARENT)
        .toBuffer();
      await sharp({ create: { width: size, height: size, channels: 4, background: brandBg } })
        .composite([
          {
            input: logoBuf,
            top: Math.round(size * (1 - SCALE_MASKABLE) / 2),
            left: Math.round(size * (1 - SCALE_MASKABLE) / 2)
          }
        ])
        .png(PNG_OPAQUE)
        .toFile(outMaskable);
      console.log('Wrote', path.relative(root, outMaskable));
    }

    // Launcher (home screen): transparent + white logo, slightly bigger
    {
      const outAny = path.join(outDir, `icon-${size}.png`);
      const density = Math.max(MIN_DENSITY, size);
      const logoBuf = await sharp(svgWhite, { density, limitInputPixels: false })
        .resize(Math.round(size * SCALE_ANY), Math.round(size * SCALE_ANY), { fit: 'contain' })
        .png(PNG_TRANSPARENT)
        .toBuffer();
      await sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite([
          {
            input: logoBuf,
            top: Math.round(size * (1 - SCALE_ANY) / 2),
            left: Math.round(size * (1 - SCALE_ANY) / 2)
          }
        ])
        .png(PNG_TRANSPARENT)
        .toFile(outAny);
      console.log('Wrote', path.relative(root, outAny));
    }
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

