import { callLLM } from '../llm.js';

/**
 * Parse CV text and extract structured information
 */
export async function parseCV(rawText, provider = 'lmstudio') {
  if (!rawText || rawText.trim().length < 50) {
    throw new Error('Nội dung CV quá ngắn hoặc không đọc được');
  }

  const prompt = `Phân tích CV sau và trích xuất thông tin theo format JSON:

CV:
${rawText}

Trả về JSON với cấu trúc:
{
  "name": "Tên ứng viên",
  "roles": ["Vai trò 1", "Vai trò 2"],
  "skills": ["Kỹ năng 1", "Kỹ năng 2"],
  "experience": ["Kinh nghiệm 1", "Kinh nghiệm 2"],
  "education": ["Học vấn 1"],
  "summary": "Tóm tắt ngắn gọn về ứng viên"
}

QUAN TRỌNG: Chỉ trả về JSON, không giải thích, không markdown.`;

  try {
    console.log(`[AI Parse] Using provider: ${provider}`);
    const res = await callLLM(
      "Bạn là một hệ thống phân tích dữ liệu CV chuyên nghiệp. Luôn trả về kết quả dưới dạng JSON thuần túy.",
      [{ role: 'user', content: prompt }],
      { provider, maxTokens: 2500 }
    );

    const content = res.content.trim();
    console.log(`[AI Parse] Raw AI Response Length: ${content.length}`);
    if (content.length < 10) {
      console.error('[AI Parse Error] AI returned empty or too short response:', content);
      throw new Error('AI không trả về nội dung phân tích');
    }

    const jsonMatch = content.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      console.error('[AI Parse Error] Raw content:', content);
      throw new Error('AI không trả về đúng định dạng JSON cho CV');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate fields
    if (!parsed.skills || !Array.isArray(parsed.skills)) parsed.skills = [];
    if (!parsed.roles || !Array.isArray(parsed.roles)) parsed.roles = [];

    return parsed;
  } catch (error) {
    console.error('[AI Service Exception]', error);
    throw new Error(`Lỗi phân tích CV: ${error.message}`);
  }
}

/**
 * Analyze job vs CV and generate insights
 */
export async function analyzeJob(jobDescription, cvData, provider = 'lmstudio') {
  const prompt = `Phân tích công việc này với CV của ứng viên:

CÔNG VIỆC:
${jobDescription}

ỨNG VIÊN:
- Vai trò: ${cvData.roles?.join(', ') || 'N/A'}
- Kỹ năng: ${cvData.skills?.join(', ') || 'N/A'}
- Kinh nghiệm: ${cvData.experience?.join(', ') || 'N/A'}

Trả về JSON với cấu trúc:
{
  "match_score": 75,
  "skills_match": ["Kỹ năng khớp 1", "Kỹ năng khớp 2"],
  "skills_gap": ["Kỹ năng thiếu 1", "Kỹ năng thiếu 2"],
  "strengths": ["Điểm mạnh 1", "Điểm mạnh 2"],
  "risks": ["Rủi ro 1", "Rủi ro 2"],
  "learning_plan": [
    {"topic": "Chủ đề cần học", "priority": "high", "resources": "Nguồn học"},
    {"topic": "Chủ đề khác", "priority": "medium", "resources": "Nguồn học"}
  ],
  "interview_prep": {
    "focus_areas": ["Trọng tâm 1", "Trọng tâm 2"],
    "questions": ["Câu hỏi có thể gặp 1", "Câu hỏi 2"],
    "tips": ["Tip 1", "Tip 2"]
  },
  "pitch": "Tin nhắn ứng tuyển ngắn gọn, chuyên nghiệp"
}

Chỉ trả về JSON, không giải thích.`;

  const res = await callLLM(
    "Bạn là một chuyên gia săn đầu người và tư vấn sự nghiệp.",
    [{ role: 'user', content: prompt }],
    { provider, maxTokens: 3000 }
  );

  const jsonMatch = res.content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Không phân tích được job');

  return JSON.parse(jsonMatch[0]);
}

/**
 * Generate search queries from CV
 */
export async function generateSearchQueries(cvData, provider = 'lmstudio') {
  const prompt = `Dựa vào CV này, tạo 3-5 query tìm kiếm việc làm phù hợp:

ỨNG VIÊN:
- Vai trò: ${cvData.roles?.join(', ') || 'N/A'}
- Kỹ năng: ${cvData.skills?.join(', ') || 'N/A'}

Trả về JSON array:
["query 1", "query 2", "query 3"]

Chỉ trả về JSON array, không giải thích.`;

  const res = await callLLM(
    "Bạn là một chuyên gia tư vấn việc làm.",
    [{ role: 'user', content: prompt }],
    { provider, maxTokens: 500 }
  );

  const jsonMatch = res.content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  return JSON.parse(jsonMatch[0]);
}
