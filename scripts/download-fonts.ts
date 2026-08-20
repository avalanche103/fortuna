import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const FONT_DIR = path.join(process.cwd(), 'public', 'fonts');
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const CSS_URL =
  'https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,700;0,900;1,700&family=Oswald:wght@600&family=Source+Sans+3:wght@400;600&family=Caveat:wght@500&display=swap';

async function main(): Promise<void> {
  fs.mkdirSync(FONT_DIR, { recursive: true });
  const css = await fetch(CSS_URL, { headers: { 'User-Agent': UA } }).then((res) => res.text());
  const urls = [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map((m) => m[1]);
  const unique = [...new Set(urls)];
  const mapping: { file: string; url: string }[] = [];

  for (const url of unique) {
    const familyGuess = /s\/([^/]+)\//.exec(url)?.[1] || 'font';
    const hash = crypto.createHash('sha1').update(url).digest('hex').slice(0, 12);
    const file = `${familyGuess}-${hash}.woff2`;
    const dest = path.join(FONT_DIR, file);
    if (!fs.existsSync(dest)) {
      const buf = Buffer.from(await fetch(url).then((res) => res.arrayBuffer()));
      fs.writeFileSync(dest, buf);
      console.log(file, buf.length);
    } else {
      console.log(file, 'exists');
    }
    mapping.push({ file, url });
  }

  let localCss = css;
  for (const item of mapping) {
    localCss = localCss.split(item.url).join(`/fonts/${item.file}`);
  }
  fs.writeFileSync(path.join(process.cwd(), 'public', 'css', 'fonts.css'), localCss);
  console.log(`wrote ${mapping.length} faces`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
