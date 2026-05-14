export const JOB_SITES = [
  { name: 'CareerViet', query: 'site:careerviet.vn/viec-lam', domain: 'careerviet.vn', searchUrl: q => `https://careerviet.vn/viec-lam/${encodeURIComponent(q).replace(/%20/g, '-')}-k-vi.html` },
  { name: 'ITviec', query: 'site:itviec.com', domain: 'itviec.com', searchUrl: q => `https://itviec.com/it-jobs?query=${encodeURIComponent(q)}` },
  { name: 'TopCV', query: 'site:topcv.vn/viec-lam', domain: 'topcv.vn', searchUrl: q => `https://www.topcv.vn/tim-viec-lam-${encodeURIComponent(q).replace(/%20/g, '-')}` },
  { name: 'VietnamWorks', query: 'site:vietnamworks.com', domain: 'vietnamworks.com', searchUrl: q => `https://www.vietnamworks.com/viec-lam?q=${encodeURIComponent(q)}` },
  { name: 'LinkedIn Jobs', query: 'site:linkedin.com/jobs', domain: 'linkedin.com', searchUrl: q => `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(q)}` },
];

export const KNOWN_JOB_DOMAINS = JOB_SITES.map(({ name, domain }) => ({ name, domain }));

export const MONEY_TERMS = [
  'senior', 'lead', 'principal', 'architect', 'manager', 'head', 'fintech', 'bank', 'banking',
  'financial', 'finance', 'bi', 'business intelligence', 'data engineer', 'ai', 'cloud',
  'remote', 'hybrid', 'english', 'tiếng anh', 'usd', '$', 'thỏa thuận', 'negotiable',
];

export const SKILL_TERMS = [
  'javascript', 'typescript', 'react', 'node.js', 'nodejs', 'nestjs', 'express', 'next.js', 'vue',
  'python', 'fastapi', 'django', 'flask', 'java', 'spring', 'golang', 'go', 'php',
  'laravel', 'c#', '.net', 'sql', 'postgresql', 'mysql', 'mongodb', 'redis',
  'docker', 'kubernetes', 'aws', 'gcp', 'azure', 'linux', 'devops', 'ci/cd',
  'machine learning', 'ai', 'llm', 'rag', 'openai', 'langchain', 'data analysis',
  'power bi', 'power query', 'dax', 'excel', 'vba', 'automation', 'api', 'backend', 'frontend', 'fullstack',
  'finance', 'fintech', 'erp', 'accounting', 'business intelligence', 'etl', 'data warehouse',
  'product management', 'project management', 'business analysis', 'scrum',
  'seo', 'content', 'marketing', 'sales', 'crm', 'customer success',
];

export const ROLE_TERMS = [
  'fintech developer', 'bi developer', 'business intelligence engineer',
  'financial systems developer',
  'software engineer', 'fullstack developer', 'full stack developer', 'backend developer',
  'frontend developer', 'ai engineer', 'machine learning engineer', 'data analyst',
  'business analyst', 'product manager', 'project manager', 'automation engineer',
  'devops engineer', 'technical lead', 'solution architect', 'marketing manager',
  'sales manager', 'operations manager',
];

export const LOCATION_TERMS = ['ho chi minh', 'hồ chí minh', 'hcm', 'ha noi', 'hà nội', 'da nang', 'đà nẵng', 'remote', 'hybrid'];
export const VIETNAM_MARKERS = [
  'vietnam', 'việt nam', 'ho chi minh', 'hồ chí minh', 'hcm', 'saigon', 'sài gòn',
  'ha noi', 'hà nội', 'da nang', 'đà nẵng', 'binh duong', 'bình dương', 'remote vietnam',
];
export const UNREALISTIC_LOCATION_MARKERS = [
  'new york', 'san francisco', 'austin', 'california', 'texas', 'singapore', 'relocate',
  'relocation', 'united states', 'new york city metropolitan area', 'nyc',
];
