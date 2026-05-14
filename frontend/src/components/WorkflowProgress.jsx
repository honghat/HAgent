import { CheckCircle2, Loader2, XCircle } from 'lucide-react'

export default function WorkflowProgress({ steps, isRunning }) {
  if (!steps || steps.length === 0) return null

  const stepLabels = {
    search: 'Tìm việc làm',
    evaluate: 'Đánh giá độ phù hợp',
    analyze: 'Phân tích & chuẩn bị',
    draft: 'Tạo draft ứng tuyển',
    summary: 'Hoàn thành',
  }

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-4 sm:p-5">
      <h3 className="text-xs font-semibold text-gray-900 mb-4">Tiến trình tự động</h3>
      <div className="space-y-3">
        {steps.map((step, index) => (
          <div key={index} className="flex items-start gap-3">
            <div className="shrink-0 mt-0.5">
              {step.status === 'running' && (
                <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
              )}
              {step.status === 'completed' && (
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              )}
              {step.status === 'failed' && (
                <XCircle className="w-4 h-4 text-red-500" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900">
                {stepLabels[step.step] || step.step}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">{step.data?.message}</p>
              {step.data?.count !== undefined && (
                <p className="text-xs font-semibold text-emerald-600 mt-1">
                  {step.data.count} kết quả
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
      {isRunning && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>Đang xử lý...</span>
          </div>
        </div>
      )}
    </div>
  )
}
