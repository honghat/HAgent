const fs = require('fs');
const path = require('path');

const targetDirs = [
  path.join(__dirname, '..', 'backend', 'agent', 'app', 'skills')
];

function processDir(dir) {
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    if (fs.statSync(fullPath).isDirectory()) {
      processDir(fullPath);
    } else if (fullPath.endsWith('.md') || fullPath.endsWith('.json') || fullPath.endsWith('.sh') || fullPath.endsWith('.py')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let changed = false;

      const replacements = [
        [/\/mnt\/skills\/public\//g, 'backend/agent/app/skills/hagent/'],
        [/\/mnt\/user-data\/workspace\//g, 'data/'],
        [/\/mnt\/user-data\/outputs\//g, 'data/outputs/'],
        [/\/mnt\/user-data\/uploads\//g, 'data/uploads/'],
        [/\/mnt\/user-data\//g, 'data/'],
        [/\/root\//g, './'] // Common sandbox home to relative
      ];

      for (const [regex, replacement] of replacements) {
        if (regex.test(content)) {
          content = content.replace(regex, replacement);
          changed = true;
        }
      }

      if (changed) {
        console.log(`Updated: ${fullPath}`);
        fs.writeFileSync(fullPath, content);
      }
    }
  }
}

targetDirs.forEach(dir => {
  if (fs.existsSync(dir)) {
    processDir(dir);
  }
});
