import { useState } from 'react'
import { Link2 } from 'lucide-react'

export default function JobCard({ job, provider }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-3 sm:rounded-2xl sm:p-5 hover:border-gray-200 hover:shadow-lg transition-all">
      <div className="flex items-start justify-between gap-2 sm:gap-3">
        <div className="min-w-0">
          <p className="text-[9px] font-semibold text-gray-400 mb-1.5 sm:text-[10px] sm:mb-2">{job.source} · {job.verdict || 'Đang đánh giá'}</p>
          <h4 className="text-sm font-semibold text-gray-900 leading-snug sm:text-base">{job.title}</h4>
          <p className="mt-1 text-[9px] font-semibold text-gray-300 sm:text-[10px]">{job.aiUsed ? `AI: ${provider}` : job.aiError ? 'AI fallback' : 'Local analysis'} · {job.freshnessLabel || 'Không rõ ngày đăng'}</p>
        </div>
        <div className="shrink-0 flex flex-col gap-1">
          <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl bg-gray-50 flex items-center justify-center text-[11px] sm:text-xs font-semibold text-gray-900" title="Độ phù hợp">{job.matchScore}</div>
          <div className="w-9 h-6 sm:w-11 sm:h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center text-[9px] sm:text-[10px] font-semibold" title="Tiềm năng thu nhập">{job.incomePotential || 0}</div>
        </div>
      </div>
      {job.aiSummary && (
        <div className="mt-3 sm:mt-4 rounded-lg sm:rounded-xl bg-emerald-50/70 border border-emerald-100 p-2 sm:p-3">
          <p className="text-[9px] font-semibold text-emerald-700 mb-1.5 sm:text-[10px] sm:mb-2">AI đánh giá</p>
          <p className="text-xs font-semibold leading-relaxed text-emerald-900 sm:text-sm">{job.aiSummary}</p>
        </div>
      )}
      {job.description_snippet || job.aiSummary ? (
        <DescriptionSection description={job.description_snippet} aiSummary={job.aiSummary} />
      ) : (
        <p className="text-xs text-gray-400 leading-relaxed mt-2 sm:mt-3 italic sm:text-sm">Chưa có mô tả chi tiết. Mở link để xem thêm.</p>
      )}
      <div className="mt-3 sm:mt-4 space-y-2 sm:space-y-3">
        <MiniTags title="Khớp CV" items={job.matchedSkills} tone="green" empty="Chưa thấy kỹ năng khớp rõ trong JD" />
        <MiniTags title="Cần học/ôn" items={job.missingSkills} tone="amber" empty="Chưa phát hiện gap kỹ năng lớn" />
        <MiniTags title="Điểm mạnh nên nhấn" items={job.strengths} tone="green" empty="AI chưa tạo điểm mạnh riêng" />
        <MiniTags title="Rủi ro khi phỏng vấn" items={job.risks} tone="amber" empty="AI chưa nêu rủi ro riêng" />
      </div>
      {!!job.learningPlan?.length && (
        <div className="mt-3 sm:mt-4 rounded-lg sm:rounded-xl bg-amber-50/70 border border-amber-100 p-2 sm:p-3">
          <p className="text-[9px] font-semibold text-amber-700 mb-1.5 sm:text-[10px] sm:mb-2">Kế hoạch học nhanh</p>
          <ul className="space-y-1 sm:space-y-1.5">
            {job.learningPlan.slice(0, 4).map(item => (
              <li key={item} className="text-[11px] font-semibold leading-relaxed text-amber-900 sm:text-xs">{item}</li>
            ))}
          </ul>
        </div>
      )}
      {!!job.interviewFocus?.length && (
        <div className="mt-2 sm:mt-3 rounded-lg sm:rounded-xl bg-gray-50 border border-gray-100 p-2 sm:p-3">
          <p className="text-[9px] font-semibold text-gray-500 mb-1.5 sm:text-[10px] sm:mb-2">Trọng tâm phỏng vấn</p>
          <ul className="space-y-1 sm:space-y-1.5">
            {job.interviewFocus.slice(0, 4).map(item => (
              <li key={item} className="text-[11px] font-semibold leading-relaxed text-gray-600 sm:text-xs">{item}</li>
            ))}
          </ul>
        </div>
      )}
      {!!job.interviewQuestions?.length && (
        <div className="mt-2 sm:mt-3 rounded-lg sm:rounded-xl bg-white border border-gray-100 p-2 sm:p-3">
          <p className="text-[9px] font-semibold text-gray-500 mb-1.5 sm:text-[10px] sm:mb-2">Câu hỏi có thể gặp</p>
          <ul className="space-y-1 sm:space-y-1.5">
            {job.interviewQuestions.slice(0, 5).map(item => (
              <li key={item} className="text-[11px] font-semibold leading-relaxed text-gray-600 sm:text-xs">{item}</li>
            ))}
          </ul>
        </div>
      )}
      {job.pitch && (
        <div className="mt-2 sm:mt-3 rounded-lg sm:rounded-xl bg-indigo-50/70 border border-indigo-100 p-2 sm:p-3">
          <p className="text-[9px] font-semibold text-indigo-700 mb-1.5 sm:text-[10px] sm:mb-2">Pitch ứng tuyển</p>
          <p className="text-[11px] font-semibold leading-relaxed text-indigo-900 sm:text-xs">{job.pitch}</p>
        </div>
      )}
      {!!job.nextActions?.length && (
        <div className="mt-2 sm:mt-3 rounded-lg sm:rounded-xl bg-gray-900 p-2 sm:p-3">
          <p className="text-[9px] font-semibold text-gray-300 mb-1.5 sm:text-[10px] sm:mb-2">Bước tiếp theo</p>
          <ul className="space-y-1 sm:space-y-1.5">
            {job.nextActions.slice(0, 4).map(item => (
              <li key={item} className="text-[11px] font-semibold leading-relaxed text-white sm:text-xs">{item}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-3 sm:mt-5 flex items-center gap-1.5 sm:gap-2 text-[10px] font-bold text-gray-400 sm:text-[11px]">
        <Link2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
        <a href={job.url} target="_blank" rel="noreferrer" className="truncate hover:text-gray-900">{job.url}</a>
      </div>
    </div>
  )
}

function DescriptionSection({ description, aiSummary }) {
  const [expanded, setExpanded] = useState(false)
  const text = description || aiSummary || ''
  const short = text.length <= 150
  return (
    <div className="mt-2 sm:mt-3">
      <div onClick={() => setExpanded(!expanded)} className="cursor-pointer select-none">
        <p className={`text-xs text-gray-500 leading-relaxed transition-all sm:text-sm ${expanded || short ? '' : 'line-clamp-3'}`}>
          {text}
        </p>
        {!short && (
          <p className="text-[9px] font-semibold text-blue-500 mt-1 sm:text-[10px]">{expanded ? 'Thu gọn ▲' : 'Xem chi tiết mô tả ▼'}</p>
        )}
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
      <p className="text-[9px] font-semibold text-gray-300 mb-1.5 sm:text-[10px] sm:mb-2">{title}</p>
      {items?.length ? (
        <div className="flex flex-wrap gap-1 sm:gap-1.5">
          {items.slice(0, 8).map(item => (
            <span key={item} className={`px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-lg border text-[9px] font-semibold uppercase tracking-wider sm:text-[10px] ${toneClass}`}>{item}</span>
          ))}
        </div>
      ) : (
        <p className="text-[11px] font-semibold text-gray-400 sm:text-xs">{empty}</p>
      )}
    </div>
  )
}
