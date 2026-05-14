import { Link2 } from 'lucide-react'

export default function JobCard({ job, provider }) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 hover:border-gray-200 hover:shadow-lg transition-all">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold text-gray-400 mb-2">{job.source} · {job.verdict || 'Đang đánh giá'}</p>
          <h4 className="text-base font-semibold text-gray-900 leading-snug">{job.title}</h4>
          <p className="mt-1 text-[10px] font-semibold text-gray-300">{job.aiUsed ? `AI: ${provider}` : job.aiError ? 'AI fallback' : 'Local analysis'} · {job.freshnessLabel || 'Không rõ ngày đăng'}</p>
        </div>
        <div className="shrink-0 flex flex-col gap-1">
          <div className="w-11 h-11 rounded-xl bg-gray-50 flex items-center justify-center text-xs font-semibold text-gray-900" title="Độ phù hợp">{job.matchScore}</div>
          <div className="w-11 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center text-[10px] font-semibold" title="Tiềm năng thu nhập">{job.incomePotential || 0}</div>
        </div>
      </div>
      {job.aiSummary && (
        <div className="mt-4 rounded-xl bg-emerald-50/70 border border-emerald-100 p-3">
          <p className="text-[10px] font-semibold text-emerald-700 mb-2">AI đánh giá</p>
          <p className="text-sm font-semibold leading-relaxed text-emerald-900">{job.aiSummary}</p>
        </div>
      )}
      <p className="text-sm text-gray-500 leading-relaxed mt-3 line-clamp-3">{job.snippet || 'Mở liên kết để xem mô tả chi tiết.'}</p>
      <div className="mt-4 grid grid-cols-1 gap-3">
        <MiniTags title="Khớp CV" items={job.matchedSkills} tone="green" empty="Chưa thấy kỹ năng khớp rõ trong JD" />
        <MiniTags title="Cần học/ôn" items={job.missingSkills} tone="amber" empty="Chưa phát hiện gap kỹ năng lớn" />
        <MiniTags title="Điểm mạnh nên nhấn" items={job.strengths} tone="green" empty="AI chưa tạo điểm mạnh riêng" />
        <MiniTags title="Rủi ro khi phỏng vấn" items={job.risks} tone="amber" empty="AI chưa nêu rủi ro riêng" />
      </div>
      {!!job.learningPlan?.length && (
        <div className="mt-4 rounded-xl bg-amber-50/70 border border-amber-100 p-3">
          <p className="text-[10px] font-semibold text-amber-700 mb-2">Kế hoạch học nhanh</p>
          <ul className="space-y-1.5">
            {job.learningPlan.slice(0, 4).map(item => (
              <li key={item} className="text-xs font-semibold leading-relaxed text-amber-900">{item}</li>
            ))}
          </ul>
        </div>
      )}
      {!!job.interviewFocus?.length && (
        <div className="mt-3 rounded-xl bg-gray-50 border border-gray-100 p-3">
          <p className="text-[10px] font-semibold text-gray-500 mb-2">Trọng tâm phỏng vấn</p>
          <ul className="space-y-1.5">
            {job.interviewFocus.slice(0, 4).map(item => (
              <li key={item} className="text-xs font-semibold leading-relaxed text-gray-600">{item}</li>
            ))}
          </ul>
        </div>
      )}
      {!!job.interviewQuestions?.length && (
        <div className="mt-3 rounded-xl bg-white border border-gray-100 p-3">
          <p className="text-[10px] font-semibold text-gray-500 mb-2">Câu hỏi có thể gặp</p>
          <ul className="space-y-1.5">
            {job.interviewQuestions.slice(0, 5).map(item => (
              <li key={item} className="text-xs font-semibold leading-relaxed text-gray-600">{item}</li>
            ))}
          </ul>
        </div>
      )}
      {job.pitch && (
        <div className="mt-3 rounded-xl bg-indigo-50/70 border border-indigo-100 p-3">
          <p className="text-[10px] font-semibold text-indigo-700 mb-2">Pitch ứng tuyển</p>
          <p className="text-xs font-semibold leading-relaxed text-indigo-900">{job.pitch}</p>
        </div>
      )}
      {!!job.nextActions?.length && (
        <div className="mt-3 rounded-xl bg-gray-900 p-3">
          <p className="text-[10px] font-semibold text-gray-300 mb-2">Bước tiếp theo</p>
          <ul className="space-y-1.5">
            {job.nextActions.slice(0, 4).map(item => (
              <li key={item} className="text-xs font-semibold leading-relaxed text-white">{item}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-5 flex items-center gap-2 text-[11px] font-bold text-gray-400">
        <Link2 className="w-3.5 h-3.5" />
        <a href={job.url} target="_blank" rel="noreferrer" className="truncate hover:text-gray-900">{job.url}</a>
      </div>
    </div>
  )
}

function MiniTags({ title, items = [], tone = 'gray', empty }) {
  const toneClass = tone === 'green'
    ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
    : tone === 'amber'
      ? 'bg-amber-50 border-amber-100 text-amber-700'
      : 'bg-gray-50 border-gray-100 text-gray-500'

  return (
    <div>
      <p className="text-[10px] font-semibold text-gray-300 mb-2">{title}</p>
      {items?.length ? (
        <div className="flex flex-wrap gap-1.5">
          {items.slice(0, 8).map(item => (
            <span key={item} className={`px-2 py-1 rounded-lg border text-[10px] font-semibold uppercase tracking-wider ${toneClass}`}>{item}</span>
          ))}
        </div>
      ) : (
        <p className="text-xs font-semibold text-gray-400">{empty}</p>
      )}
    </div>
  )
}
