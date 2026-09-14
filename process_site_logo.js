const sharp = require('sharp');

const source = 'assets/site-logo-generated.png';
const mask = Buffer.from(`
  <svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
    <rect width="512" height="512" rx="112" fill="white"/>
  </svg>
`);

async function main() {
  await sharp(source)
    .extract({ left: 51, top: 30, width: 1152, height: 1152 })
    .resize(512, 512, { fit: 'fill' })
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toFile('assets/site-logo-512.png');

  await Promise.all([
    sharp('assets/site-logo-512.png').resize(180).png().toFile('assets/site-logo-180.png'),
    sharp('assets/site-logo-512.png').resize(32).png().toFile('assets/site-logo-32.png'),
  ]);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
