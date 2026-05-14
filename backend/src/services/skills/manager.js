import fs from 'fs';
import path from 'path';
import { parseSkill } from './parser.js';

export const SKILLS_DIR = path.join(process.cwd(), 'agent/app/skills/hagent');
const DATA_DIR = path.resolve(process.cwd(), '..', 'data');

class SkillManager {
  constructor() {
    this.skills = new Map();
    this.ensureDirectory();
  }

  ensureDirectory() {
    if (!fs.existsSync(SKILLS_DIR)) {
      fs.mkdirSync(SKILLS_DIR, { recursive: true });
    }
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  /**
   * Load all skills from storage
   */
  async loadSkills() {
    const files = fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && fs.existsSync(path.join(SKILLS_DIR, entry.name, 'SKILL.md')))
      .map(entry => path.join(entry.name, 'SKILL.md'));
    this.skills.clear();

    for (const file of files) {
      const content = fs.readFileSync(path.join(SKILLS_DIR, file), 'utf8');
      const skill = parseSkill(content);
      if (skill) {
        this.skills.set(skill.name, { ...skill, path: file });
      }
    }
    console.log(`[SkillManager] Loaded ${this.skills.size} skills.`);
  }

  /**
   * Get all skills for prompt injection
   */
  getAllSkills() {
    return Array.from(this.skills.values());
  }

  /**
   * Get skill by name
   */
  getSkill(name) {
    return this.skills.get(name);
  }

  /**
   * Get compact skill list for LLM awareness (name + description only)
   */
  getSkillCatalog() {
    return this.getAllSkills().map(s => ({
      name: s.name,
      description: s.description || s.metadata?.description || '',
    }));
  }

  /**
   * Get full skill instructions, adapted for local execution
   */
  getSkillInstructions(name) {
    const skill = this.skills.get(name);
    if (!skill) return null;

    let instructions = skill.instructions;
    // Adapt HAgent sandbox paths to local paths
    instructions = this.adaptPaths(instructions);
    return {
      name: skill.name,
      description: skill.description,
      instructions,
    };
  }

  /**
   * Adapt HAgent sandbox paths (/mnt/...) to local HAgent paths
   */
  adaptPaths(text) {
    const projectRoot = path.resolve(process.cwd(), '..');
    const skillsRoot = SKILLS_DIR;
    const outputDir = path.join(projectRoot, 'data', 'outputs');
    const dataDir = path.join(projectRoot, 'data');

    // Ensure output dir exists
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    return text
      .replace(/\/mnt\/skills\/public/g, skillsRoot)
      .replace(/\/mnt\/user-data\/outputs/g, outputDir)
      .replace(/\/mnt\/user-data\/workspace/g, dataDir)
      .replace(/\/mnt\/user-data\/uploads/g, path.join(projectRoot, 'data', 'uploads'));
  }

  /**
   * Find relevant skills based on user input
   * Uses keyword matching + description analysis
   */
  findRelevantSkills(text) {
    const relevant = [];
    const lowerText = text.toLowerCase();

    // Keyword-to-skill mapping for common patterns
    const SKILL_TRIGGERS = {
      'deep-research': [
        'research', 'nghiên cứu', 'tìm hiểu sâu', 'phân tích', 'investigate', 'explore',
        'what is', 'explain', 'compare', 'so sánh', 'đánh giá',
      ],
      'ppt-generation': [
        'ppt', 'powerpoint', 'presentation', 'slide', 'trình bày', 'thuyết trình', 'bài thuyết trình',
      ],
      'image-generation': [
        'tạo ảnh', 'generate image', 'vẽ', 'draw', 'imagine', 'hình ảnh', 'visualize',
        'tạo hình', 'minh họa', 'illustration',
      ],
      'video-generation': [
        'video', 'clip', 'tạo video', 'generate video', 'animation',
      ],
      'chart-visualization': [
        'chart', 'biểu đồ', 'graph', 'visualization', 'pie chart', 'bar chart',
        'line chart', 'đồ thị',
      ],
      'data-analysis': [
        'phân tích dữ liệu', 'data analysis', 'analyze data', 'thống kê', 'statistics',
        'dataset', 'csv', 'excel',
      ],
      'code-documentation': [
        'document code', 'tài liệu code', 'code docs', 'jsdoc', 'docstring',
        'api doc', 'documentation',
      ],
      'frontend-design': [
        'thiết kế giao diện', 'ui design', 'ux', 'frontend', 'giao diện', 'layout',
        'mockup', 'wireframe', 'landing page',
      ],
      'newsletter-generation': [
        'newsletter', 'bản tin', 'email marketing', 'email template',
      ],
      'podcast-generation': [
        'podcast', 'audio script', 'kịch bản podcast',
      ],
      'consulting-analysis': [
        'tư vấn', 'consulting', 'swot', 'business analysis', 'strategy',
        'chiến lược', 'business model',
      ],
      'academic-paper-review': [
        'paper review', 'academic', 'journal', 'scientific paper', 'bài báo khoa học',
        'luận văn', 'thesis', 'peer review',
      ],
      'systematic-literature-review': [
        'literature review', 'systematic review', 'meta-analysis', 'tổng quan tài liệu',
      ],
      'github-deep-research': [
        'github', 'repo', 'repository', 'open source', 'github research',
      ],
      'bootstrap': [
        'bootstrap', 'scaffold', 'khởi tạo dự án', 'init project', 'create project',
        'new project', 'dự án mới',
      ],
      'web-design-guidelines': [
        'web design', 'thiết kế web', 'responsive', 'accessibility',
      ],
      'skill-creator': [
        'tạo skill', 'create skill', 'new skill', 'skill mới',
      ],
      'hagent-gateway': [
        'gateway', 'messaging platform', 'telegram', 'zalo', 'bot channel',
        'adapter', 'platform mới', 'kênh nhắn tin', 'gửi thông báo',
      ],
      'find-skills': [
        'find skill', 'tìm skill', 'install skill', 'skill marketplace', 'available skills',
      ],
      'vercel-deploy-claimable': [
        'deploy', 'vercel', 'deploy vercel', 'triển khai',
      ],
      'surprise-me': [
        'surprise', 'bất ngờ', 'random', 'ngẫu nhiên', 'thú vị',
      ],
      'systematic-debugging': [
        'debug', 'sửa lỗi', 'lỗi không rõ', 'tìm nguyên nhân', 'root cause',
        'bug khó', 'không hiểu lỗi', 'investigate', 'trace', 'diagnose',
        'crash', 'lỗi bí', 'tại sao lỗi', 'why error', 'error analysis',
      ],
      'test-driven-development': [
        'tdd', 'test driven', 'viết test', 'unit test', 'write test',
        'test first', 'red green', 'coverage', 'kiểm thử', 'test case',
        'test suite', 'jest', 'mocha', 'pytest', 'vitest',
      ],
    };

    // 1. Check explicit keyword triggers
    for (const [skillName, triggers] of Object.entries(SKILL_TRIGGERS)) {
      if (triggers.some(t => lowerText.includes(t))) {
        const skill = this.skills.get(skillName);
        if (skill) relevant.push(skill);
      }
    }

    // 2. Check description-based matching (fallback)
    if (relevant.length === 0) {
      for (const skill of this.skills.values()) {
        const desc = (skill.description || '').toLowerCase();
        // Check if significant words from user text appear in skill description
        const words = lowerText.split(/\s+/).filter(w => w.length > 3);
        const matchCount = words.filter(w => desc.includes(w)).length;
        if (matchCount >= 2) {
          relevant.push(skill);
        }
      }
    }

    return relevant;
  }
}

export const skillManager = new SkillManager();
