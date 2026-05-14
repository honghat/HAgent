import { getProfile } from './profiles.js';
import { searchJobsForProfile } from './job-search.js';
import { saveApplicationDrafts } from './applications.js';

/**
 * Full automated workflow:
 * 1. Tìm việc từ nguồn
 * 2. Đánh giá độ phù hợp với CV
 * 3. Tạo learning plan cho từng job
 * 4. Chuẩn bị câu hỏi phỏng vấn
 * 5. Tạo draft message
 */
export async function runFullWorkflow({
  userId,
  profileId,
  query,
  location = 'Vietnam',
  remote = true,
  limit = 24,
  provider = 'local',
  minScore = 60,
  onProgress = null,
}) {
  const profile = getProfile(userId, profileId, true);
  if (!profile) throw new Error('CV không tồn tại');

  const steps = [];
  const notify = (step, status, data = {}) => {
    steps.push({ step, status, timestamp: new Date().toISOString(), ...data });
    if (onProgress) onProgress({ step, status, data });
  };

  try {
    // Step 1: Tìm việc
    notify('search', 'running', { message: 'Đang tìm kiếm việc làm từ các nguồn...' });
    const search = await searchJobsForProfile({
      userId,
      profileId,
      query,
      location,
      remote,
      limit,
      provider,
    });
    notify('search', 'completed', {
      message: `Tìm thấy ${search.results.length} công việc`,
      count: search.results.length,
    });

    // Step 2: Lọc và đánh giá
    notify('evaluate', 'running', { message: 'Đang đánh giá độ phù hợp với CV...' });
    const qualified = search.results.filter(job => (job.matchScore || 0) >= minScore);
    notify('evaluate', 'completed', {
      message: `${qualified.length} công việc phù hợp (≥${minScore} điểm)`,
      count: qualified.length,
    });

    // Step 3: Phân tích chi tiết (learning plan, interview prep)
    notify('analyze', 'running', { message: 'Đang tạo kế hoạch học và câu hỏi phỏng vấn...' });
    const analyzed = qualified.map(job => ({
      ...job,
      learningPlan: job.learningPlan || [],
      interviewQuestions: job.interviewQuestions || [],
      interviewFocus: job.interviewFocus || [],
      strengths: job.strengths || [],
      risks: job.risks || [],
    }));
    notify('analyze', 'completed', {
      message: 'Hoàn thành phân tích chi tiết',
      withLearningPlan: analyzed.filter(j => j.learningPlan.length > 0).length,
      withInterviewPrep: analyzed.filter(j => j.interviewQuestions.length > 0).length,
    });

    // Step 4: Tạo draft applications
    notify('draft', 'running', { message: 'Đang tạo draft tin nhắn ứng tuyển...' });
    const applications = saveApplicationDrafts({
      userId,
      profileId,
      searchId: search.id,
      jobs: analyzed,
      minScore,
    });
    notify('draft', 'completed', {
      message: `Tạo ${applications.length} draft chờ duyệt`,
      count: applications.length,
    });

    // Step 5: Tổng hợp kết quả
    notify('summary', 'completed', {
      message: 'Hoàn thành workflow tự động',
      totalJobs: search.results.length,
      qualifiedJobs: qualified.length,
      draftsCreated: applications.length,
    });

    return {
      success: true,
      search,
      results: analyzed,
      applications,
      steps,
      summary: {
        totalJobs: search.results.length,
        qualifiedJobs: qualified.length,
        draftsCreated: applications.length,
        avgMatchScore: qualified.length > 0
          ? Math.round(qualified.reduce((sum, j) => sum + (j.matchScore || 0), 0) / qualified.length)
          : 0,
      },
    };
  } catch (error) {
    notify('error', 'failed', { message: error.message });
    throw error;
  }
}
