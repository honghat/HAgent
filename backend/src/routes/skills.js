import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { skillManager, SKILLS_DIR } from '../services/skills/manager.js';
import fs from 'fs';
import path from 'path';

export const skillsRouter = Router();

skillsRouter.use(requireAuth);

skillsRouter.get('/skills', async (req, res) => {
  try {
    await skillManager.loadSkills();
    const skills = skillManager.getAllSkills(); // Using getAllSkills to include 'instructions' for editing
    res.json(skills);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

skillsRouter.post('/skills', async (req, res) => {
  try {
    const { name, description, instructions } = req.body;
    if (!name || !name.match(/^[a-z0-9-]+$/)) {
      return res.status(400).json({ error: 'Tên kỹ năng chỉ được chứa chữ thường, số và dấu gạch ngang.' });
    }
    
    const skillDir = path.join(SKILLS_DIR, name);
    const filePath = path.join(skillDir, 'SKILL.md');
    if (fs.existsSync(filePath)) return res.status(400).json({ error: 'Kỹ năng này đã tồn tại.' });
    
    fs.mkdirSync(skillDir, { recursive: true });
    const content = `---\nname: "${name}"\ndescription: "${description || ''}"\n---\n\n${instructions || ''}`;
    fs.writeFileSync(filePath, content, 'utf8');
    
    await skillManager.loadSkills();
    res.json({ success: true, name });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

skillsRouter.put('/skills/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const { description, instructions } = req.body;
    
    const filePath = path.join(SKILLS_DIR, name, 'SKILL.md');
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Kỹ năng không tồn tại.' });
    
    const content = `---\nname: "${name}"\ndescription: "${description || ''}"\n---\n\n${instructions || ''}`;
    fs.writeFileSync(filePath, content, 'utf8');
    
    await skillManager.loadSkills();
    res.json({ success: true, name });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

skillsRouter.delete('/skills/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const skillDir = path.join(SKILLS_DIR, name);
    const filePath = path.join(skillDir, 'SKILL.md');
    
    if (fs.existsSync(filePath)) {
      fs.rmSync(skillDir, { recursive: true, force: true });
      await skillManager.loadSkills();
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
