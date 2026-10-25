/**
 * Regenerates the app icons from `assets/app-logo.jpg`.
 *
 * The source is 612x556 with a little dead space around the neon sign, so it is centre
 * cropped to the artwork and resampled up with Lanczos3. Resampling cannot invent detail
 * that is not in the source — the glow-heavy artwork survives it well, but a genuinely
 * sharper icon needs a larger original, not a better filter.
 *
 * Run with: node scripts/build-icons.js
 */
const sharp = require('sharp');

const SRC = 'assets/app-logo.jpg';
/** The artwork's own backdrop, so padding and the splash screen blend into it. */
const BG = { r: 4, g: 11, b: 30, alpha: 1 };
/** Centred square covering the neon sign, measured off the source. */
const CROP = { left: 34, top: 6, width: 544, height: 544 };

const cropped = () => sharp(SRC).extract(CROP);

/** Full-bleed square icon. */
async function fullBleed(size, out) {
  await cropped()
    .resize(size, size, { kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9 })
    .toFile(out);
  console.log(out, `${size}x${size}`);
}

/**
 * Android adaptive foregrounds are masked to a circle or squircle and the outer third is
 * trimmed, so the sign is scaled into the safe zone on transparency. Its dark corners
 * vanish against the matching flat background layer.
 */
async function safeZone(size, fraction, out) {
  const inner = Math.round(size * fraction);
  const logo = await cropped().resize(inner, inner, { kernel: sharp.kernel.lanczos3 }).toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: logo, gravity: 'center' }])
    .png({ compressionLevel: 9 })
    .toFile(out);
  console.log(out, `${size}x${size} safe zone`);
}

async function flat(size, out) {
  await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .png({ compressionLevel: 9 })
    .toFile(out);
  console.log(out, `${size}x${size} flat`);
}

(async () => {
  await fullBleed(1024, 'assets/icon.png');
  await fullBleed(1024, 'assets/splash-icon.png');
  await fullBleed(196, 'assets/favicon.png');
  await safeZone(1024, 0.68, 'assets/android-icon-foreground.png');
  await flat(1024, 'assets/android-icon-background.png');
  await safeZone(1024, 0.68, 'assets/android-icon-monochrome.png');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
