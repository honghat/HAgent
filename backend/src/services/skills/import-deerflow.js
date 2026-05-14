import fs from 'fs';
import path from 'path';

const DEERFLOW_SKILLS_PATH = '/Users/nguyenhat/deer-flow/skills/public';
const BACKEND_ROOT = path.join(process.cwd()); // Assumes running from backend/
const HAGENT_SKILLS_PATH = path.join(BACKEND_ROOT, 'agent/app/skills/hagent');

/**
 * Recursively copy a directory
 */
function copyFolderSync(from, to) {
  if (!fs.existsSync(to)) fs.mkdirSync(to, { recursive: true });
  fs.readdirSync(from).forEach(element => {
    if (fs.lstatSync(path.join(from, element)).isFile()) {
      fs.copyFileSync(path.join(from, element), path.join(to, element));
    } else {
      copyFolderSync(path.join(from, element), path.join(to, element));
    }
  });
}

async function importSkills() {
  console.log('Starting comprehensive skills import into HAgent project skills...');

  if (!fs.existsSync(HAGENT_SKILLS_PATH)) {
    fs.mkdirSync(HAGENT_SKILLS_PATH, { recursive: true });
  }

  if (!fs.existsSync(DEERFLOW_SKILLS_PATH)) {
    console.error(`Source path not found: ${DEERFLOW_SKILLS_PATH}`);
    return;
  }

  const skillDirs = fs.readdirSync(DEERFLOW_SKILLS_PATH);
  let count = 0;

  for (const dir of skillDirs) {
    const sourceSkillDir = path.join(DEERFLOW_SKILLS_PATH, dir);
    if (!fs.lstatSync(sourceSkillDir).isDirectory()) continue;

    const skillFilePath = path.join(sourceSkillDir, 'SKILL.md');
    
    if (fs.existsSync(skillFilePath)) {
      const targetSkillDir = path.join(HAGENT_SKILLS_PATH, dir);
      copyFolderSync(sourceSkillDir, targetSkillDir);

      console.log(`Imported skill: ${dir}`);
      count++;
    }
  }

  console.log(`\nSuccessfully imported ${count} skills with scripts and assets to HAgent.`);
}

importSkills().catch(err => console.error('Import failed:', err));
