const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const GEMINI_ROOT = 'C:\\Users\\sarav\\.gemini';
const GEMINI_CONFIG_SKILLS = path.join(GEMINI_ROOT, 'config', 'skills');
const GEMINI_SKILLS = path.join(GEMINI_ROOT, 'skills');

const GEMINI_CONFIG_SHARED = path.join(GEMINI_ROOT, 'config', 'shared');
const GEMINI_SHARED = path.join(GEMINI_ROOT, 'shared');

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
  'holding-blender',
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

console.log('1. Copying .agents/shared to .gemini/config/shared and .gemini/shared...');
const repoShared = path.join(REPO_ROOT, '.agents', 'shared');
if (fs.existsSync(repoShared)) {
  copyDirRecursive(repoShared, GEMINI_CONFIG_SHARED);
  copyDirRecursive(repoShared, GEMINI_SHARED);
  console.log('   ✓ Shared modules copied successfully.');
} else {
  console.error('   ✗ .agents/shared not found!');
}

console.log('2. Copying config/investment_ways.yaml...');
const repoWays = path.join(REPO_ROOT, 'config', 'investment_ways.yaml');
if (fs.existsSync(repoWays)) {
  fs.copyFileSync(repoWays, path.join(GEMINI_ROOT, 'config', 'investment_ways.yaml'));
  console.log('   ✓ investment_ways.yaml copied.');
}

console.log('3. Copying 18 created skills to .gemini/config/skills and .gemini/skills...');
const report = [];
for (const skillName of SKILLS) {
  const src = path.join(REPO_ROOT, '.agents', 'skills', skillName);
  if (!fs.existsSync(src)) {
    console.warn(`   ✗ Source skill not found: ${skillName}`);
    continue;
  }

  const destConfig = path.join(GEMINI_CONFIG_SKILLS, skillName);
  const destDirect = path.join(GEMINI_SKILLS, skillName);

  copyDirRecursive(src, destConfig);
  copyDirRecursive(src, destDirect);

  const hasSkillMdConfig = fs.existsSync(path.join(destConfig, 'SKILL.md'));
  const hasSkillMdDirect = fs.existsSync(path.join(destDirect, 'SKILL.md'));

  report.push({
    skill: skillName,
    configCopied: hasSkillMdConfig,
    directCopied: hasSkillMdDirect
  });
  console.log(`   ✓ Copied: ${skillName} (SKILL.md present: ${hasSkillMdConfig})`);
}

console.log('\nCopy completed! Summary: ' + report.length + ' skills processed.');

