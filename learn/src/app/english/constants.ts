export const LEVEL_COLORS: Record<string, string> = {
  A1: '#58a6ff',
  A2: '#3fb950',
  B1: '#d29922',
  B2: '#f78166',
  C1: '#d2a8ff',
};

export const WRITING_PROMPTS = [
  "Describe how React components work.",
  "Explain what an API is in simple terms.",
  "What is the difference between SQL and NoSQL databases?",
  "How do you handle debugging a complex bug?",
  "What are the pros and cons of microservices?",
  "Describe your favorite programming language.",
  "Explain the importance of code reviews.",
  "How to maintain a good work-life balance as a dev?",
  "The impact of AI on software development.",
  "Best practices for secure coding.",
  "Your experience with remote work.",
  "What makes a good technical lead?",
  "How to optimize web performance?",
  "The future of frontend frameworks.",
  "Why is documentation critical in a project?"
];

export const SPEAKING_TOPICS = [
  "Tell me about your favorite project that you have worked on.",
  "What are the most important skills for a junior developer?",
  "How do you stay updated with new technologies?",
  "Describe a time when you had to work in a team to solve a problem.",
  "What do you like most about being a software engineer?",
  "Explain the difference between Git merge and Git rebase.",
  "How do you prioritize your daily tasks as a developer?",
  "What is your dream job in the tech industry?",
  "How do you handle a disagreement with a co-worker?",
  "Describe a technical challenge you solved recently.",
  "What are your thoughts on open-source software?",
  "How would you explain recursion to a non-technical person?",
  "What is the most difficult bug you've ever fixed?",
  "How do you prepare for a technical interview?",
  "Why did you decide to become a programmer?"
];

export const LISTEN_SCENARIOS = {
  coder: [
    'a developer explaining a bug fix to their team',
    'a tech lead discussing code review feedback',
    'a programmer describing their debugging process',
    'a developer talking about their favorite programming language',
    'a team discussing API design decisions',
    'a developer explaining how they optimized performance',
    'a programmer sharing their experience with a new framework',
    'a tech interview conversation about problem-solving'
  ],
  communication: [
    'a conversation at a coffee shop',
    'someone describing their weekend plans',
    'a phone call arranging to meet a friend',
    'a discussion about hobbies and interests',
    'someone giving directions to a tourist',
    'a conversation about favorite movies or books',
    'friends planning a trip together',
    'someone describing their daily routine'
  ],
  business: [
    'a manager giving feedback in a performance review',
    'a team discussing project deadlines',
    'a client meeting about requirements',
    'a presentation about quarterly results',
    'a negotiation about contract terms',
    'a job interview conversation',
    'colleagues discussing a business proposal',
    'a meeting about budget allocation'
  ],
  ielts: [
    'a student describing their hometown',
    'someone discussing environmental issues',
    'a conversation about education systems',
    'someone explaining the benefits of technology',
    'a discussion about work-life balance',
    'someone describing a memorable event',
    'a conversation about cultural differences',
    'someone discussing health and fitness'
  ],
  finance: [
    'a banker explaining mortgage options',
    'an investor discussing stock market trends',
    'a financial advisor talking about retirement planning',
    'a conversation about company earnings reports',
    'someone explaining how blockchain affects banking',
    'a discussion about inflation and interest rates',
    'a meeting about personal budgeting and saving',
    'an analyst describing cryptocurrency fluctuations'
  ],
  'interview-coder': [
    'a candidate answering "Tell me about yourself" in a software engineer interview',
    'an interviewer asking about a challenging bug the candidate has fixed',
    'a candidate explaining a past project using the STAR method',
    'a system design interview discussing scalability trade-offs',
    'an interviewer asking "Why do you want to work at our company?"',
    'a candidate negotiating salary and benefits with a tech recruiter',
    'a behavioral interview about handling conflict with a teammate',
    'a candidate asking smart questions at the end of a tech interview',
    'a coding interview where the candidate explains their thought process out loud',
    'an interviewer asking about strengths, weaknesses, and career goals'
  ],
  'interview-finance': [
    'a candidate answering "Walk me through your resume" in a banking interview',
    'an interviewer asking about valuation methods (DCF, comparables)',
    'a candidate explaining why they want to work in investment banking',
    'a behavioral interview about working long hours under pressure',
    'an interviewer asking about a recent market trend or deal',
    'a candidate discussing a financial model they built',
    'a fit interview about teamwork and leadership in finance',
    'an interviewer asking "Why finance and not consulting?"',
    'a candidate negotiating compensation with an HR manager at a bank',
    'a technical interview about accounting and financial statements'
  ]
};

export const READ_LEVELS = [
  { id: 'A1', label: 'A1' },
  { id: 'A2', label: 'A2' },
  { id: 'B1', label: 'B1' },
  { id: 'B2', label: 'B2' },
  { id: 'C1', label: 'C1' },
];

export const CEFR_CURRICULUM: Record<string, { grammar: string; vocab: string; skill: string; sentence: string }> = {
  A1: {
    grammar: 'to be (am/is/are), have/has, Present Simple, possessive (my/your), this/that, there is/are, can/can\'t, plural -s, basic question (what/where/who)',
    vocab: '500-1000 từ thông dụng: gia đình, số đếm, màu sắc, ngày tháng, đồ ăn, nghề nghiệp, đồ vật quanh nhà',
    skill: 'Câu chào hỏi, giới thiệu bản thân, mô tả người/vật đơn giản',
    sentence: 'Câu rất ngắn (5-8 từ), 1 mệnh đề, present tense.',
  },
  A2: {
    grammar: 'Past Simple (regular/irregular), Present Continuous, going to (future), comparative/superlative, adverbs of frequency, must/should, prepositions of time/place',
    vocab: '1500-2500 từ: du lịch, mua sắm, sức khoẻ, thời tiết, sở thích, cảm xúc cơ bản',
    skill: 'Kể chuyện đơn giản, mô tả thói quen, nói về quá khứ gần',
    sentence: 'Câu 8-12 từ, có thể dùng and/but/because.',
  },
  B1: {
    grammar: 'Present Perfect (vs Past Simple), Past Continuous, First/Second Conditional, Passive Voice (Present/Past), Reported Speech (basic), Relative Clauses (who/which/that), modal (might/could/would)',
    vocab: '2500-3500 từ: công việc, công nghệ cơ bản, môi trường, tin tức, cảm xúc đa dạng, idiom thông dụng',
    skill: 'Trình bày ý kiến, kể trải nghiệm, viết email không trang trọng, thảo luận pros/cons',
    sentence: 'Câu 12-18 từ, dùng linking word (however, although, in addition).',
  },
  B2: {
    grammar: 'Present Perfect Continuous, Past Perfect, Third Conditional & Mixed Conditional, Passive (all tenses), Reported Speech (advanced), Gerund vs Infinitive, Wish/If only, Causative (have something done), advanced modal (must have/might have)',
    vocab: '4000-6000 từ: kinh doanh, học thuật, abstract noun (achievement, attitude), phrasal verb, collocation',
    skill: 'Tranh luận, viết essay có argument, diễn đạt sắc thái, nói về chủ đề trừu tượng',
    sentence: 'Câu 15-25 từ, mệnh đề phức, đa dạng cấu trúc.',
  },
  C1: {
    grammar: 'Inversion (Hardly had..., Not only...), Cleft sentence (It was... that), Subjunctive, advanced passive, ellipsis, complex conditional, nuanced modal (would rather, had better)',
    vocab: '8000+ từ: idiom, formal/academic vocab, register (formal vs informal), nuance, connotation',
    skill: 'Diễn đạt ý phức tạp tự nhiên, viết bài học thuật, persuasive writing, hùng biện',
    sentence: 'Câu phức tạp 20-35 từ, đa dạng cấu trúc nâng cao.',
  },
};

export const UNIT_CURRICULUM: Record<string, { title: string; grammar: string; vocab: string; scenario: string }[]> = {
  A1: [
    { title: 'Hello & Introductions', grammar: 'to be (am/is/are), my/your', vocab: 'name, country, age, job', scenario: 'Meeting someone new for the first time' },
    { title: 'My Family', grammar: 'have/has, possessive', vocab: 'family members, ages', scenario: 'Talking about your family' },
    { title: 'Numbers & Time', grammar: 'present simple with time', vocab: 'numbers 1-100, days, months, time', scenario: 'Asking about time and dates' },
    { title: 'Daily Routine', grammar: 'present simple, adverbs of frequency', vocab: 'wake up, brush teeth, eat, work, sleep', scenario: 'Describing your typical day' },
    { title: 'Food & Drink', grammar: 'a/an, some/any, like/don\'t like', vocab: 'breakfast, lunch, dinner, common foods', scenario: 'Ordering at a café' },
    { title: 'My House', grammar: 'there is / there are, prepositions of place', vocab: 'rooms, furniture', scenario: 'Describing your home' },
    { title: 'Shopping', grammar: 'how much / how many, this/that', vocab: 'clothes, prices, sizes', scenario: 'Buying clothes at a shop' },
    { title: 'Hobbies', grammar: 'present simple, like + verb-ing', vocab: 'sports, music, reading, games', scenario: 'Talking about free time' },
    { title: 'Weather & Seasons', grammar: 'it is + adjective', vocab: 'hot, cold, rainy, sunny, seasons', scenario: 'Discussing the weather' },
    { title: 'Directions', grammar: 'imperatives, prepositions of direction', vocab: 'turn left/right, straight, near, opposite', scenario: 'Asking and giving directions' },
  ],
  A2: [
    { title: 'Past Holidays', grammar: 'Past Simple (regular & irregular)', vocab: 'travel, places, activities', scenario: 'Talking about a recent vacation' },
    { title: 'Future Plans', grammar: 'going to, will', vocab: 'plans, predictions, ambitions', scenario: 'Describing weekend plans' },
    { title: 'At the Restaurant', grammar: 'would like, can I have...', vocab: 'menu, dishes, drinks, bill', scenario: 'Ordering food at a restaurant' },
    { title: 'Health & Body', grammar: 'should/shouldn\'t, modal advice', vocab: 'body parts, illness, doctor', scenario: 'Visiting the doctor' },
    { title: 'Comparing Things', grammar: 'comparative & superlative', vocab: 'adjectives: big, small, fast, expensive', scenario: 'Comparing products before buying' },
    { title: 'At Work', grammar: 'present continuous for now', vocab: 'office, meeting, colleague, deadline', scenario: 'Describing your current work' },
    { title: 'Travel & Transport', grammar: 'prepositions of movement, modals', vocab: 'plane, train, bus, ticket, station', scenario: 'Booking a train ticket' },
    { title: 'Personal Stories', grammar: 'past simple narrative', vocab: 'first, then, after that, finally', scenario: 'Telling a story from your childhood' },
    { title: 'Technology Around Us', grammar: 'present simple + passive intro', vocab: 'phone, app, internet, social media', scenario: 'Describing how you use your phone' },
    { title: 'Goals & Dreams', grammar: 'want to, hope to, plan to', vocab: 'career, study, learn, achieve', scenario: 'Talking about your goals for next year' },
  ],
  B1: [
    { title: 'Life Experiences', grammar: 'Present Perfect vs Past Simple', vocab: 'experience, ever, never, since, for', scenario: 'Discussing things you have done in your life' },
    { title: 'If I Could...', grammar: 'Second Conditional', vocab: 'imaginary situations, would, might', scenario: 'Discussing hypothetical situations' },
    { title: 'News & Events', grammar: 'Passive Voice (Present/Past)', vocab: 'announce, report, discover, build', scenario: 'Reporting recent news' },
    { title: 'Workplace Communication', grammar: 'Reported Speech basics', vocab: 'meeting, said, asked, mentioned', scenario: 'Reporting what colleagues said' },
    { title: 'Describing People', grammar: 'Relative Clauses (who/which/that)', vocab: 'personality, appearance, character', scenario: 'Describing a person you admire' },
    { title: 'Pros & Cons', grammar: 'linking words (however, although)', vocab: 'advantage, disadvantage, on the other hand', scenario: 'Discussing pros and cons of remote work' },
    { title: 'Cultural Differences', grammar: 'modals of possibility (might/could)', vocab: 'culture, tradition, custom, etiquette', scenario: 'Comparing cultures' },
    { title: 'Solving Problems', grammar: 'First Conditional', vocab: 'issue, solution, fix, troubleshoot', scenario: 'Describing how you solved a problem at work' },
    { title: 'Environment', grammar: 'should + passive', vocab: 'pollution, recycle, climate, sustainable', scenario: 'Discussing environmental issues' },
    { title: 'Personal Achievements', grammar: 'Present Perfect Continuous', vocab: 'achieve, accomplish, proud, milestone', scenario: 'Talking about an achievement you are proud of' },
  ],
  B2: [
    { title: 'Career Development', grammar: 'Present Perfect Continuous', vocab: 'promotion, growth, skill, expertise', scenario: 'Discussing your career progression' },
    { title: 'Regrets & Reflections', grammar: 'Third Conditional, wish + past perfect', vocab: 'regret, decision, hindsight, lesson', scenario: 'Reflecting on past decisions' },
    { title: 'Technology & Society', grammar: 'Mixed Conditionals', vocab: 'innovation, disruption, AI, automation', scenario: 'Debating the impact of AI on jobs' },
    { title: 'Persuasion & Argument', grammar: 'modal perfect (must have, might have)', vocab: 'argue, persuade, convince, evidence', scenario: 'Building a persuasive argument' },
    { title: 'Project Management', grammar: 'Causative (have something done)', vocab: 'deadline, milestone, deliverable, stakeholder', scenario: 'Reporting project status to stakeholders' },
    { title: 'Abstract Concepts', grammar: 'Gerund vs Infinitive', vocab: 'freedom, responsibility, ethics, justice', scenario: 'Discussing abstract values' },
    { title: 'Interview Skills', grammar: 'advanced reported speech', vocab: 'strength, weakness, scenario, hypothetical', scenario: 'Answering tough job interview questions' },
    { title: 'Negotiation', grammar: 'softening language, hedging', vocab: 'compromise, agree, terms, conditions', scenario: 'Negotiating salary or contract terms' },
    { title: 'Critical Thinking', grammar: 'complex sentences with multiple clauses', vocab: 'analyze, evaluate, assumption, bias', scenario: 'Critically reviewing a proposal' },
    { title: 'Future of Work', grammar: 'Future Perfect, Future Continuous', vocab: 'remote, hybrid, gig economy, upskill', scenario: 'Predicting how work will change in 10 years' },
  ],
  C1: [
    { title: 'Sophisticated Storytelling', grammar: 'Inversion (Hardly had..., Not only...)', vocab: 'narrative devices, vivid description', scenario: 'Telling a story with dramatic effect' },
    { title: 'Academic Discussion', grammar: 'Cleft sentences, nominalization', vocab: 'hypothesis, methodology, paradigm, framework', scenario: 'Discussing a research finding' },
    { title: 'Diplomatic Language', grammar: 'softeners, subjunctive', vocab: 'tactful, diplomatic, nuance, register', scenario: 'Delivering difficult feedback diplomatically' },
    { title: 'Idioms & Nuance', grammar: 'idiomatic expressions, collocations', vocab: 'common idioms, phrasal verbs at C1 level', scenario: 'Using idioms naturally in conversation' },
    { title: 'Public Speaking', grammar: 'rhetorical devices, parallel structure', vocab: 'audience, captivate, articulate, eloquent', scenario: 'Delivering a TED-style talk' },
    { title: 'Complex Argumentation', grammar: 'concessive clauses, advanced linking', vocab: 'notwithstanding, albeit, conversely', scenario: 'Constructing a multi-layered argument' },
    { title: 'Cultural Subtleties', grammar: 'register shifts (formal/informal)', vocab: 'connotation, undertone, implication', scenario: 'Navigating cultural sensitivities' },
    { title: 'Ethics & Philosophy', grammar: 'hypothetical & abstract structures', vocab: 'ethical dilemma, moral, principle, virtue', scenario: 'Discussing an ethical dilemma' },
    { title: 'Leadership Communication', grammar: 'persuasive structures, ellipsis', vocab: 'vision, mission, inspire, mobilize', scenario: 'Inspiring a team with a vision speech' },
    { title: 'Mastering Nuance', grammar: 'all advanced structures combined', vocab: 'precision, subtlety, mastery', scenario: 'Expressing complex emotions with precision' },
  ],
};

export const READ_TOPICS = ['Web Development', 'Career & Jobs', 'Technology', 'Daily Life', 'Science', 'Business'];

export const VOCAB_TOPICS = ['programming', 'web development', 'databases', 'networking', 'AI & ML', 'DevOps', 'career & jobs', 'daily life', 'finance', 'investing'];
export const INTERVIEW_VOCAB_TOPICS = [
  'job interview phrases', 'CV & resume action verbs', 'describing strengths & skills',
  'behavioral interview (STAR method)', 'salary negotiation', 'company culture & values',
  'technical interview (problem solving)', 'teamwork & collaboration', 'leadership & management',
  'career goals & ambitions', 'email & professional communication', 'meeting & presentation phrases',
];

export const GRAMMAR_TOPICS = [
  'Present Simple', 'Present Continuous', 'Present Perfect',
  'Past Simple', 'Past Continuous', 'Future Simple',
  'Passive Voice', 'Relative Clauses', 'Conditionals (If)',
  'Reported Speech', 'Gerund & Infinitive', 'Modal Verbs', 'Prepositions',
  'Articles (A, An, The)', 'Comparisons', 'Wish Clauses', 'Used to / Get used to',
  'Causative Form', 'Conjunctions (Although, Despite...)', 'Question Tags',
  'Inversion (Đảo ngữ)', 'Subjunctive Mood', 'Phrasal Verbs Basics'
];
export const INTERVIEW_GRAMMAR_TOPICS = [
  'Present Perfect (I have worked / I have achieved) — dùng trong phỏng vấn',
  'Past Simple — kể kinh nghiệm làm việc (STAR method)',
  'Second Conditional (If I were... I would...) — câu hỏi tình huống giả định',
  'Modal Verbs (can/could/would/should) — thể hiện năng lực & đề xuất',
];

export const TABS = [
  { id: 'curriculum', l: '🗂️ Danh mục' },
  { id: 'listen', l: '🎧 Nghe' },
  { id: 'speak', l: '🎤 Nói' }, { id: 'write', l: '✍️ Viết' },
  { id: 'read', l: '📖 Đọc' },
  { id: 'dict', l: '🔎 Tra từ' },
  { id: 'grammar', l: '📐 Ngữ pháp' },
  { id: 'vocab', l: '📚 Từ vựng' },
  { id: 'guide', l: '📘 Hướng dẫn' },
] as const;

export type LearnMode = typeof MODES[number]['id'];

export const MODES = [
  { id: 'coder', label: '💻 Coder', desc: 'software developer, technology' },
  { id: 'communication', label: '🗣️ Giao tiếp', desc: 'daily communication, social situations' },
  { id: 'business', label: '💼 Công việc', desc: 'office, formal business context' },
  { id: 'ielts', label: '🎓 IELTS', desc: 'academic, formal education' },
  { id: 'finance', label: '🏦 Finance', desc: 'investment, banking, economy' },
  { id: 'interview-coder', label: '🤖 PV Coder', desc: 'software engineer job interview' },
  { id: 'interview-finance', label: '🏦 PV Tài chính', desc: 'finance/banking job interview' },
  { id: 'all', label: '🌈 Tất cả', desc: 'general english' },
];
