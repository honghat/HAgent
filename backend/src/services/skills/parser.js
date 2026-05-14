import matter from 'gray-matter';

/**
 * Skill Parser
 * Parses HAgent-style Markdown skills with YAML frontmatter.
 */
export function parseSkill(content) {
  try {
    const { data, content: body } = matter(content);
    
    return {
      name: data.name || 'unknown-skill',
      description: data.description || '',
      instructions: body.trim(),
      metadata: data
    };
  } catch (e) {
    console.error('[SkillParser] Failed to parse skill:', e.message);
    return null;
  }
}
