import { useState, useRef, useEffect } from 'react'
import { Upload, Download, CheckCircle2, Loader2, Settings, Languages, FileText, FileSpreadsheet, AlertTriangle, RefreshCw } from 'lucide-react'

function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function PdfTranslator({ token, apiUrl = '/api/pdf' }) {
  const [file, setFile] = useState(null)
  const [sourceLang, setSourceLang] = useState('auto')
  const [targetLang, setTargetLang] = useState('vi')
  const [context, setContext] = useState('')
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState(null)
  const [downloadUrl, setDownloadUrl] = useState(null)
  const [translatedFilename, setTranslatedFilename] = useState(null)
  const [apiKey, setApiKey] = useState('')
  const [activeTab, setActiveTab] = useState('translate')
  const [engine, setEngine] = useState('gemini') // 'gemini' | 'basic'
  const fileInputRef = useRef(null)

  // Load API key from local storage on mount
  useEffect(() => {
    const savedKey = localStorage.getItem('gemini_api_key') || ''
    setApiKey(savedKey)
  }, [])

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0]
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setFile(selectedFile)
      setError(null)
      setDownloadUrl(null)
    } else {
      setError('Vui lòng chọn một file PDF hợp lệ')
      setFile(null)
    }
  }

  const handleReset = () => {
    setFile(null)
    setError(null)
    setDownloadUrl(null)
    setTranslatedFilename(null)
    setProgress(0)
    setSourceLang('auto')
    setTargetLang('vi')
    setContext('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const saveApiKey = () => {
    localStorage.setItem('gemini_api_key', apiKey.trim())
    alert('Đã lưu cấu hình API Key thành công!')
  }

  const handleWordDownload = async (e) => {
    e.preventDefault()
    if (!file) {
      setError('Vui lòng chọn một file PDF')
      return
    }
    if (engine === 'gemini' && !apiKey.trim()) {
      setError('Vui lòng cấu hình Gemini API Key trong tab Cài đặt')
      setActiveTab('settings')
      return
    }

    setLoading(true)
    setError(null)
    setDownloadUrl(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await fetch(
        `${apiUrl}/translate-doc?source_lang=${sourceLang}&target_lang=${targetLang}&api_keys=${encodeURIComponent(apiKey.trim())}&context=${encodeURIComponent(context)}&engine=${engine}`,
        { 
          method: 'POST', 
          headers: authHeaders(token),
          body: formData 
        }
      )

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Quá trình dịch thất bại')
      }

      const data = await response.json()
      setDownloadUrl(`${apiUrl}${data.download_url}`)
      setTranslatedFilename(data.filename)
    } catch (err) {
      setError(err.message || 'Đã xảy ra lỗi trong quá trình dịch tài liệu')
    } finally {
      setLoading(false)
    }
  }

  const handlePdfDownload = async (e) => {
    e.preventDefault()
    if (!file) {
      setError('Vui lòng chọn một file PDF')
      return
    }
    if (engine === 'gemini' && !apiKey.trim()) {
      setError('Vui lòng cấu hình Gemini API Key trong tab Cài đặt')
      setActiveTab('settings')
      return
    }

    setLoading(true)
    setProgress(0)
    setError(null)
    setDownloadUrl(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      // Step 1: Create task
      const response = await fetch(
        `${apiUrl}/translate-pdf-direct?source_lang=${sourceLang}&target_lang=${targetLang}&api_keys=${encodeURIComponent(apiKey.trim())}&context=${encodeURIComponent(context)}&engine=${engine}`,
        { 
          method: 'POST', 
          headers: authHeaders(token),
          body: formData 
        }
      )

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Không thể tạo tác vụ dịch PDF')
      }

      const data = await response.json()
      const taskId = data.task_id

      // Step 2: Poll for task status
      const pollInterval = setInterval(async () => {
        try {
          const statusResponse = await fetch(`${apiUrl}/task-status/${taskId}`, {
            headers: authHeaders(token)
          })

          if (!statusResponse.ok) {
            clearInterval(pollInterval)
            throw new Error('Không thể kiểm tra trạng thái tác vụ')
          }

          const taskStatus = await statusResponse.json()

          // Update progress bar
          setProgress(taskStatus.progress || 0)

          if (taskStatus.status === 'completed') {
            clearInterval(pollInterval)
            setProgress(100)
            setDownloadUrl(`${apiUrl}${taskStatus.result.download_url}`)
            setTranslatedFilename(taskStatus.result.filename)
            setLoading(false)
          } else if (taskStatus.status === 'failed') {
            clearInterval(pollInterval)
            setProgress(0)
            setError(taskStatus.error || 'Dịch PDF trực tiếp thất bại')
            setLoading(false)
          }
        } catch (pollError) {
          clearInterval(pollInterval)
          setProgress(0)
          setError('Lỗi kiểm tra tiến trình: ' + pollError.message)
          setLoading(false)
        }
      }, 2000)

    } catch (err) {
      setError(err.message || 'Đã xảy ra lỗi khi kết nối dịch PDF trực tiếp')
      setProgress(0)
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-4xl mx-auto py-2">
      {/* Sub Header */}
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-200">
        <div>
          <h2 className="text-[15px] font-semibold text-gray-950">Dịch tài liệu nâng cao (HatAI PDF)</h2>
          <p className="text-[11px] text-gray-500 font-medium">Giữ nguyên bố cục trang hoặc xuất sang tài liệu Word qua Gemini hoặc dịch máy</p>
        </div>
        
        {/* Tab Switcher - styled inside top corner */}
        <div className="flex bg-gray-100 rounded-lg p-0.5 border border-gray-200">
          <button
            onClick={() => setActiveTab('translate')}
            className={`px-3 py-1 text-[11px] font-medium rounded-md transition-all flex items-center gap-1 ${
              activeTab === 'translate'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <Languages className="h-3 w-3" />
            Dịch thuật
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-3 py-1 text-[11px] font-medium rounded-md transition-all flex items-center gap-1 ${
              activeTab === 'settings'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <Settings className="h-3 w-3" />
            Cấu hình API
          </button>
        </div>
      </div>

      {/* Settings Tab Content */}
      {activeTab === 'settings' && (
        <div className="bg-white rounded-lg p-5 border border-gray-200 shadow-sm space-y-4">
          <div>
            <h3 className="text-[13px] font-semibold text-gray-950 mb-1">Cấu hình Gemini API Keys</h3>
            <p className="text-[11px] text-gray-500 mb-3">
              Nhập các khóa API Gemini để chạy tiến trình dịch. Bạn có thể nhập nhiều key cách nhau bằng dấu phẩy để hệ thống tự động xoay tua (Key Rotation) tránh giới hạn băng thông.
            </p>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Nhập khóa API Gemini (ví dụ: AIzaSy..., AIzaSy...)"
              className="w-full h-10 px-3 text-sm rounded border border-gray-300 focus:outline-none focus:border-[#d71920] transition-colors"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={saveApiKey}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#d71920] hover:bg-[#b9151b] rounded shadow transition-all flex items-center gap-1.5"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Lưu cấu hình
            </button>
            <a 
              href="https://aistudio.google.com/app/apikey" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="px-3 py-2 text-xs font-medium text-blue-600 hover:underline flex items-center"
            >
              Lấy API Key miễn phí tại Google AI Studio
            </a>
          </div>
        </div>
      )}

      {/* Translate Tab Content */}
      {activeTab === 'translate' && (
        <div className="bg-white rounded-lg p-5 border border-gray-200 shadow-sm space-y-4">
          <form className="space-y-4">
            {/* File Upload Dropzone */}
            <div>
              <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                Chọn file tài liệu PDF
              </span>
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border border-dashed border-gray-300 rounded-lg p-5 text-center bg-gray-50 hover:bg-gray-100/50 cursor-pointer transition-colors"
              >
                <Upload className="mx-auto h-7 w-7 text-gray-400" />
                <div className="mt-2 text-[13px] font-semibold text-gray-800">
                  {file ? (
                    <span className="text-emerald-600 flex items-center justify-center gap-1">
                      <CheckCircle2 className="h-4 w-4" />
                      {file.name}
                    </span>
                  ) : (
                    'Chọn file PDF hoặc kéo thả tại đây'
                  )}
                </div>
                <div className="mt-1 text-[11px] text-gray-500">
                  Chỉ hỗ trợ định dạng .pdf (Tối đa 50MB)
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>
            </div>

            {/* Engine Selection */}
            <div>
              <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                Bộ máy dịch thuật (Engine)
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setEngine('gemini')}
                  className={`py-2 px-3 text-xs font-semibold rounded border transition-all ${
                    engine === 'gemini'
                      ? 'border-[#d71920] bg-[#fff4f4] text-[#b9151b]'
                      : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Gemini AI (Bản dịch chất lượng cao)
                </button>
                <button
                  type="button"
                  onClick={() => setEngine('basic')}
                  className={`py-2 px-3 text-xs font-semibold rounded border transition-all ${
                    engine === 'basic'
                      ? 'border-[#d71920] bg-[#fff4f4] text-[#b9151b]'
                      : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Dịch máy (Dịch nhanh & Miễn phí)
                </button>
              </div>
            </div>

            {/* Context / Field (Optional) */}
            {engine === 'gemini' && (
              <div>
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    Ngữ cảnh dịch / Chuyên ngành (Tùy chọn)
                  </span>
                  <input
                    type="text"
                    value={context}
                    onChange={(e) => setContext(e.target.value)}
                    placeholder="Ví dụ: Công nghệ thông tin, Y học, Luật pháp, Tài chính..."
                    className="h-10 w-full rounded border border-gray-300 px-3 text-sm outline-none focus:border-[#d71920]"
                  />
                </label>
              </div>
            )}

            {/* Language Selection Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">Ngôn ngữ gốc</span>
                  <select
                    value={sourceLang}
                    onChange={(e) => setSourceLang(e.target.value)}
                    className="h-10 w-full rounded border border-gray-300 bg-white px-3 text-sm outline-none focus:border-[#d71920]"
                  >
                    <option value="auto">Tự động nhận diện</option>
                    <option value="en">Tiếng Anh (English)</option>
                    <option value="vi">Tiếng Việt (Vietnamese)</option>
                    <option value="zh">Tiếng Trung (Chinese)</option>
                    <option value="ja">Tiếng Nhật (Japanese)</option>
                    <option value="ko">Tiếng Hàn (Korean)</option>
                    <option value="fr">Tiếng Pháp (French)</option>
                    <option value="de">Tiếng Đức (German)</option>
                    <option value="es">Tiếng Tây Ban Nha (Spanish)</option>
                  </select>
                </label>
              </div>

              <div>
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">Ngôn ngữ dịch</span>
                  <select
                    value={targetLang}
                    onChange={(e) => setTargetLang(e.target.value)}
                    className="h-10 w-full rounded border border-gray-300 bg-white px-3 text-sm outline-none focus:border-[#d71920]"
                  >
                    <option value="vi">Tiếng Việt (Vietnamese)</option>
                    <option value="en">Tiếng Anh (English)</option>
                    <option value="zh">Tiếng Trung (Chinese)</option>
                    <option value="ja">Tiếng Nhật (Japanese)</option>
                    <option value="ko">Tiếng Hàn (Korean)</option>
                    <option value="fr">Tiếng Pháp (French)</option>
                    <option value="de">Tiếng Đức (German)</option>
                    <option value="es">Tiếng Tây Ban Nha (Spanish)</option>
                  </select>
                </label>
              </div>
            </div>

            {/* Progress Bar */}
            {loading && progress > 0 && (
              <div className="space-y-2 border-t border-gray-100 pt-3">
                <div className="flex justify-between text-xs text-gray-600 font-medium">
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[#d71920]" />
                    Đang dịch tài liệu PDF...
                  </span>
                  <span>{progress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#d71920] to-[#b9151b] transition-all duration-300 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Actions Bar */}
            <div className="flex flex-wrap items-center gap-2 border-t border-gray-200 pt-4">
              <button
                type="button"
                onClick={handleWordDownload}
                disabled={loading || !file}
                className="h-10 px-4 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {loading && progress === 0 && !downloadUrl ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4" />
                )}
                Dịch sang tài liệu Word
              </button>

              <button
                type="button"
                onClick={handlePdfDownload}
                disabled={loading || !file}
                className="h-10 px-4 text-xs font-semibold text-white bg-[#d71920] hover:bg-[#b9151b] rounded transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {loading && progress > 0 ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileSpreadsheet className="h-4 w-4" />
                )}
                Dịch PDF trực tiếp (Giữ layout)
              </button>

              {file && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="h-10 px-4 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded transition-all flex items-center gap-1"
                >
                  <RefreshCw className="h-3 w-3" />
                  Đặt lại
                </button>
              )}
            </div>
          </form>

          {/* Success Result Area */}
          {downloadUrl && (
            <div className="mt-4 p-4 rounded bg-emerald-50 border border-emerald-200">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold text-emerald-800 text-sm mb-1">Dịch tài liệu hoàn tất!</p>
                  <p className="text-xs text-emerald-700 mb-3 truncate max-w-full">
                    Kết quả: {translatedFilename}
                  </p>
                  <a
                    href={downloadUrl}
                    download
                    className="inline-flex items-center gap-1.5 py-2 px-4 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded transition-all shadow-sm"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Tải file bản dịch
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mt-4 p-3 rounded bg-red-50 border border-red-200">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-red-800 text-sm">Lỗi dịch thuật:</p>
                  <p className="text-xs text-red-700">{error}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
