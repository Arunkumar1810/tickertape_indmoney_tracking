const fs = require('fs');
const path = require('path');

const skillsDir = path.resolve('skills');
for (const skill of fs.readdirSync(skillsDir)) {
  const scriptsDir = path.join(skillsDir, skill, 'scripts');
  if (fs.existsSync(scriptsDir)) {
    for (const f of fs.readdirSync(scriptsDir)) {
      if (f.endsWith('.js')) {
        const content = fs.readFileSync(path.join(scriptsDir, f), 'utf8');
        const lines = content.split('\n');
        for (const line of lines) {
          if (line.includes('require(') && line.includes('scripts/')) {
            console.log(`${skill}/${f}: ${line.trim()}`);
          }
        }
      }
    }
  }
}

