// Auto-sync roadmap based on learning progress

export async function syncRoadmap(track: string, topic: string) {
  const mapping: Record<string, string[]> = {
    'html-css': ['html-basic', 'css-basic', 'css-adv'],
    'javascript': ['js-es6', 'js-dom', 'js-async'],
    'react': ['react-basic', 'react-hooks', 'react-router'],
    'nextjs': ['nextjs-basic', 'nextjs-ssr', 'nextjs-api'],
    'nodejs': ['nodejs-basic', 'express-basic', 'rest-api'],
    'sql': ['sql-basic', 'postgres', 'prisma'],
    'git': ['git-adv'],
  };

  const roadmapIds = mapping[track] || [];
  if (roadmapIds.length === 0) return;

  // Auto-check first roadmap item for this track
  const firstId = roadmapIds[0];
  try {
    await fetch('/api/roadmap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: firstId, completed: true }),
    });
  } catch {
    // Silent fail
  }
}
