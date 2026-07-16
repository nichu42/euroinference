const fs = require('fs');
const path = require('path');

const fontsDir = path.join(__dirname, '../fonts');
if (!fs.existsSync(fontsDir)) {
  fs.mkdirSync(fontsDir, { recursive: true });
}

async function run() {
  console.log('Downloading fonts for self-hosting...');
  const cssUrl = 'https://fonts.bunny.net/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Space+Grotesk:wght@400;500;700&family=JetBrains+Mono:wght@400;500;700&display=swap';
  
  try {
    const res = await fetch(cssUrl);
    if (!res.ok) throw new Error('Failed to fetch font CSS');
    const cssText = await res.text();
    
    const blocks = cssText.split('@font-face');
    const localFontFaces = [];
    
    for (let i = 1; i < blocks.length; i++) {
      const prevBlock = blocks[i - 1];
      const currentBlock = blocks[i];
      
      const isLatin = prevBlock.trim().endsWith('/* latin */');
      if (!isLatin) continue;
      
      const woff2Regex = /url\((https:\/\/fonts\.bunny\.net\/[^)]+\.woff2)\)/;
      const match = currentBlock.match(woff2Regex);
      if (!match) continue;
      
      const remoteUrl = match[1];
      const fileName = path.basename(remoteUrl);
      const localPath = path.join(fontsDir, fileName);
      
      console.log(`Downloading ${fileName}...`);
      const fontRes = await fetch(remoteUrl);
      if (!fontRes.ok) throw new Error(`Failed to download font: ${fileName}`);
      const fontBuffer = await fontRes.arrayBuffer();
      fs.writeFileSync(localPath, Buffer.from(fontBuffer));
      
      const fontFamily = currentBlock.match(/font-family:\s*['"]([^'"]+)['"]/)[1];
      const fontStyle = currentBlock.match(/font-style:\s*([^;]+);/)[1];
      const fontWeight = currentBlock.match(/font-weight:\s*([^;]+);/)[1];
      const unicodeRange = currentBlock.match(/unicode-range:\s*([^;]+);/)[1];
      
      const fontStretchMatch = currentBlock.match(/font-stretch:\s*([^;]+);/);
      const fontStretchHtml = fontStretchMatch ? `\n  font-stretch: ${fontStretchMatch[1]};` : '';
      
      const fontFaceRule = `@font-face {
  font-family: '${fontFamily}';
  font-style: ${fontStyle};
  font-weight: ${fontWeight};${fontStretchHtml}
  font-display: swap;
  src: url('fonts/${fileName}') format('woff2');
  unicode-range: ${unicodeRange};
}`;
      localFontFaces.push(fontFaceRule);
    }
    
    const stylesPath = path.join(__dirname, '../styles.css');
    if (fs.existsSync(stylesPath)) {
      let stylesContent = fs.readFileSync(stylesPath, 'utf8');
      
      const importRegex = /@import\s+url\([^)]+\);\r?\n?/;
      stylesContent = stylesContent.replace(importRegex, '');
      
      const finalContent = localFontFaces.join('\n\n') + '\n\n' + stylesContent;
      fs.writeFileSync(stylesPath, finalContent, 'utf8');
      console.log('Successfully updated styles.css with self-hosted font-faces!');
    }
  } catch (err) {
    console.error('Error during self-hosting setup:', err.message);
  }
}

run();
