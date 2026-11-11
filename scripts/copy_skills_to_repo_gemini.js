const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const REPO_GEMINI_DIR = path.join(REPO_ROOT, '.gemini');
const REPO_GEMINI_SKILLS = path.join(REPO_GEMINI_DIR, 'skills');
const REPO_GEMINI_SHARED = path.join(REPO_GEMINI_DIR, 'shared');

const SKILLS = [
  'agent-buffet',
  'analyze-graham',
  'analyze-klarman-solvency',
  'analyze-lts-holdings',
  'analyze-lynch',
  'fetch-angelone',
  'fetch-indmoney-us',
  'fetch-indmoney-us-stocks',
  'fetch-lts',
  'fetch-lts-xirr',
  'forensic-governance',
  'fundamental-stock-analysis',
  'fundamental-us-stock-analysis',
  'guardrail-engine',
  'fetch-strategy-stocks',
  'provider-tickertape',
  'strategy-xirr',
  'way-long-term-strategy'
];

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

console.log('1. Creating .gemini/ in repository root...');
if (!fs.existsSync(REPO_GEMINI_DIR)) {
  fs.mkdirSync(REPO_GEMINI_DIR, { recursive: true });
}

console.log('2. Copying .agents/shared to .gemini/shared...');
const repoShared = path.join(REPO_ROOT, '.agents', 'shared');
if (fs.existsSync(repoShared)) {
  copyDirRecursive(repoShared, REPO_GEMINI_SHARED);
  console.log('   ✓ Shared framework modules copied to .gemini/shared');
} else {
  console.error('   ✗ .agents/shared not found!');
}

console.log('3. Copying 18 created skills to .gemini/skills...');
let successCount = 0;
for (const skillName of SKILLS) {
  const src = path.join(REPO_ROOT, '.agents', 'skills', skillName);
  if (!fs.existsSync(src)) {
    console.warn(`   ✗ Source skill not found: ${skillName}`);
    continue;
  }

  const dest = path.join(REPO_GEMINI_SKILLS, skillName);
  copyDirRecursive(src, dest);

  const hasSkillMd = fs.existsSync(path.join(dest, 'SKILL.md'));
  if (hasSkillMd) {
    successCount++;
    console.log(`   ✓ Copied to .gemini/skills/${skillName}`);
  } else {
    console.warn(`   ⚠ Copied ${skillName} but SKILL.md is missing!`);
  }
}

console.log(`\nCompleted: ${successCount}/${SKILLS.length} skills successfully placed into .gemini/skills/ in the repository.`);

