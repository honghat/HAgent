import { callLLM } from '../llm.js';
import { MONEY_TERMS, ROLE_TERMS, SKILL_TERMS } from './terms.js';
import { difference, extractMatches, normalizeSkill, normalizeText, overlap, parseLooseJson } from './utils.js';

function buildLearningPlan(missingSkills) {
  if (!missingSkills.length) {
    return [
      'Ôn lại 2 dự án gần nhất và chuẩn bị câu chuyện STAR cho phần business impact.',
      'Luyện giải thích kiến trúc, trade-off kỹ thuật, lỗi từng gặp và cách đo kết quả.',
    ];
  }

  return missingSkills.slice(0, 6).map(skill => {
    const s = normalizeSkill(skill);
    if (/nestjs|nodejs|node/.test(s)) return `Học ${skill}: module/controller/service, DI, validation, auth JWT, REST API, viết test cho service.`;
    if (/react|frontend/.test(s)) return `Ôn ${skill}: hooks, state flow, form handling, API loading/error states, performance cơ bản.`;
    if (/sql|postgresql|mysql/.test(s)) return `Luyện ${skill}: JOIN, GROUP BY, window functions, index cơ bản, query phân tích dữ liệu tài chính.`;
    if (/docker|devops|ci/.test(s)) return `Nắm ${skill}: Dockerfile, compose, env config, deploy flow và debug log.`;
    if (/power bi|dax|power query|etl|data warehouse/.test(s)) return `Ôn ${skill}: data model, star schema, refresh pipeline, DAX measure, dashboard KPI.`;
    if (/english|tiếng anh/.test(s)) return `Luyện ${skill}: tự giới thiệu, giải thích dự án, hỏi lại yêu cầu và đàm phán offer bằng tiếng Anh.`;
    return `Bổ sung ${skill}: đọc JD, làm mini project/demo nhỏ và chuẩn bị ví dụ đã áp dụng hoặc kế hoạch học rõ ràng.`;
  });
}

function moneySignalScore(result) {
  const haystack = `${result.title} ${result.snippet} ${result.aiSummary || ''}`.toLowerCase();
  let score = 0;
  for (const term of MONEY_TERMS) {
    if (haystack.includes(term.toLowerCase())) score += 4;
  }
  if (/senior|lead|architect|manager|head/i.test(haystack)) score += 12;
  if (/fintech|bank|finance|business intelligence|data/i.test(haystack)) score += 10;
  if (/usd|\$|thỏa thuận|negotiable|lương cao/i.test(haystack)) score += 8;
  return Math.min(40, score);
}

function buildInterviewFocus({ requiredSkills, matchedSkills, missingSkills, profile }) {
  const focus = [];
  if (matchedSkills.length) focus.push(`Nhấn mạnh kỹ năng đã khớp: ${matchedSkills.slice(0, 6).join(', ')}.`);
  if (missingSkills.length) focus.push(`Chuẩn bị câu trả lời cho gap: ${missingSkills.slice(0, 5).join(', ')}.`);
  if ((profile.roles || []).some(role => /fintech|bi|business intelligence|financial/i.test(role))) {
    focus.push('Tận dụng lợi thế domain finance/BI: hiểu báo cáo, dữ liệu, kiểm soát sai lệch và nhu cầu người dùng cuối.');
  }
  if (requiredSkills.length === 0) {
    focus.push('Trang chưa đọc được JD rõ ràng; mở link để kiểm tra yêu cầu chi tiết trước khi apply.');
  }
  return focus;
}

export function analyzeJob(result, profile, content = '') {
  const haystack = normalizeText(`${result.title} ${result.snippet} ${content}`);
  const requiredSkills = extractMatches(haystack, SKILL_TERMS, 18);
  const matchedSkills = overlap(requiredSkills, profile.skills || []);
  const missingSkills = difference(requiredSkills, profile.skills || []).slice(0, 8);
  const matchedRoles = overlap(extractMatches(haystack, ROLE_TERMS, 8), profile.roles || []);

  let score = 35;
  if (requiredSkills.length) score += Math.round((matchedSkills.length / Math.max(requiredSkills.length, 1)) * 42);
  else score += 8;
  score += Math.min(matchedRoles.length * 8, 16);
  if (/finance|fintech|bank|ngân hàng|kế toán|accounting|bi|business intelligence|data/i.test(haystack)) score += 12;
  if (/ho chi minh|hồ chí minh|hcm|remote|hybrid|vietnam/i.test(haystack)) score += 6;
  if (missingSkills.length > 4) score -= 8;

  const matchScore = Math.max(15, Math.min(96, score));
  return {
    matchScore,
    incomePotential: Math.max(20, Math.min(95, matchScore + moneySignalScore({ ...result, snippet: content || result.snippet }) - 18)),
    verdict: matchScore >= 78 ? 'Phù hợp cao' : matchScore >= 60 ? 'Có thể apply, cần ôn thêm' : 'Chỉ nên apply nếu muốn thử sức hoặc thiếu lựa chọn',
    requiredSkills,
    matchedSkills,
    missingSkills,
    learningPlan: buildLearningPlan(missingSkills),
    interviewFocus: buildInterviewFocus({ requiredSkills, matchedSkills, missingSkills, profile }),
  };
}

export async function aiAnalyzeJob({ result, profile, jobText, baseAnalysis, provider }) {
  if (!provider || provider === 'local') return null;
  const cvText = String(profile.content || '').slice(0, 7000);
  const jdText = String(jobText || `${result.title}\n${result.snippet || ''}`).slice(0, 9000);
  if (jdText.length < 80) return null;

  const system = `Bạn là AI career coach cho ứng viên Việt Nam chuyển hướng sang tech/fintech.
Nhiệm vụ: đọc CV và JD, đánh giá độ tương thích thực tế, chỉ ra cần học gì để tự tin phỏng vấn.
Trả lời CHỈ bằng JSON hợp lệ, tiếng Việt, không markdown.`;
  const prompt = JSON.stringify({
    output_schema: {
      matchScore: 'number 0-100', incomePotential: 'number 0-100, cơ hội tăng thu nhập so với CV hiện tại', verdict: 'string',
      aiSummary: '2-3 câu đánh giá thẳng thắn', strengths: ['điểm mạnh nên nhấn khi apply'], risks: ['rủi ro/gap khi phỏng vấn'],
      missingSkills: ['kỹ năng/kiến thức cần bổ sung'], learningPlan: ['việc học cụ thể trong 3-14 ngày'],
      interviewQuestions: ['câu hỏi phỏng vấn có khả năng gặp'], interviewFocus: ['ý chính cần chuẩn bị để trả lời'],
      pitch: 'đoạn pitch 3-4 câu gửi recruiter hoặc nói mở đầu phỏng vấn', nextActions: ['apply/không apply, sửa CV, làm demo, nhắn recruiter...'],
    },
    cv_profile: { name: profile.name, roles: profile.roles, skills: profile.skills, locations: profile.locations, summary: profile.summary },
    base_analysis: baseAnalysis,
    cv_text: cvText,
    job: { source: result.source, title: result.title, url: result.url, text: jdText },
  });

  try {
    const { content } = await callLLM(system, prompt, { provider, maxTokens: 1800 });
    const parsed = parseLooseJson(content);
    if (!parsed) return null;
    return {
      aiUsed: true,
      aiSummary: String(parsed.aiSummary || '').slice(0, 900),
      matchScore: Number.isFinite(Number(parsed.matchScore)) ? Math.max(0, Math.min(100, Number(parsed.matchScore))) : baseAnalysis.matchScore,
      incomePotential: Number.isFinite(Number(parsed.incomePotential)) ? Math.max(0, Math.min(100, Number(parsed.incomePotential))) : baseAnalysis.incomePotential,
      verdict: parsed.verdict || baseAnalysis.verdict,
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths.slice(0, 6) : [],
      risks: Array.isArray(parsed.risks) ? parsed.risks.slice(0, 6) : [],
      missingSkills: Array.isArray(parsed.missingSkills) ? parsed.missingSkills.slice(0, 8) : baseAnalysis.missingSkills,
      learningPlan: Array.isArray(parsed.learningPlan) ? parsed.learningPlan.slice(0, 8) : baseAnalysis.learningPlan,
      interviewQuestions: Array.isArray(parsed.interviewQuestions) ? parsed.interviewQuestions.slice(0, 8) : [],
      interviewFocus: Array.isArray(parsed.interviewFocus) ? parsed.interviewFocus.slice(0, 8) : baseAnalysis.interviewFocus,
      pitch: String(parsed.pitch || '').slice(0, 1200),
      nextActions: Array.isArray(parsed.nextActions) ? parsed.nextActions.slice(0, 6) : [],
    };
  } catch (err) {
    return { aiUsed: false, aiError: err.message };
  }
}
