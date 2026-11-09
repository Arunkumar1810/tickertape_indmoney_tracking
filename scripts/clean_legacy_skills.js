const fs = require('fs');
const path = require('path');

const GEMINI_SKILLS = path.resolve('.gemini/skills');

// 1. Preserve indmoney cache
const indSource = path.join(GEMINI_SKILLS, 'fetch-indmoney-us-stocks', '.cache');
const indDest = path.join(GEMINI_SKILLS, 'fetch-indmoney-us', '.cache');
if (fs.existsSync(indSource)) {
  if (!fs.existsSync(indDest)) fs.mkdirSync(indDest, { recursive: true });
  for (const f of fs.readdirSync(indSource)) {
    const sFile = path.join(indSource, f);
    const dFile = path.join(indDest, f);
    if (!fs.existsSync(dFile)) {
      fs.copyFileSync(sFile, dFile);
      console.log(`Preserved cache: ${f} -> fetch-indmoney-us/.cache/`);
    }
  }
}

// 2. Preserve tickertape fundamental cache
const ttSource = path.join(GEMINI_SKILLS, 'fundamental-stock-analysis', 'cache');
const ttDest = path.join(GEMINI_SKILLS, 'provider-tickertape', '.cache');
if (fs.existsSync(ttSource)) {
  if (!fs.existsSync(ttDest)) fs.mkdirSync(ttDest, { recursive: true });
  for (const f of fs.readdirSync(ttSource)) {
    const sFile = path.join(ttSource, f);
    const dFile = path.join(ttDest, f);
    if (!fs.existsSync(dFile)) {
      fs.copyFileSync(sFile, dFile);
      console.log(`Preserved cache: ${f} -> provider-tickertape/.cache/`);
    }
  }
}

// 3. Delete 6 legacy skills
const legacySkills = [
  'fetch-lts',
  'fetch-lts-xirr',
  'fetch-indmoney-us-stocks',
  'fundamental-stock-analysis',
  'fundamental-us-stock-analysis',
  'analyze-lts-holdings'
];

for (const s of legacySkills) {
  const target = path.join(GEMINI_SKILLS, s);
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
    console.log(`✓ Deleted legacy skill: .gemini/skills/${s}`);
  } else {
    console.log(`Already removed or not found: ${s}`);
  }
}

