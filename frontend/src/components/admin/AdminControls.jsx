import { useCallback, useEffect, useState } from 'react'

async function readJsonResponse(res) {
  const text = await res.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(res.ok ? 'Phản hồi máy chủ không hợp lệ' : text)
  }
}

function PowerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v10"/><path d="M6.34 6.34a8 8 0 1 0 11.32 0"/>
    </svg>
  )
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.stopPropagation()
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch {}
      }}
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-[11px] text-gray-500 transition-all hover:border-gray-300 hover:text-gray-700"
    >
      {copied
        ? <svg className="h-3.5 w-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
        : <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
      }
      <span className="sr-only">{copied ? 'Copied' : 'Copy'}</span>
    </button>
  )
}

export default function AdminControls({ token }) {
  const [message, setMessage] = useState({ text: '', type: '' })
  const [rebooting, setRebooting] = useState(false)
  const [sudoPassword, setSudoPassword] = useState('')
  const [showSudoInput, setShowSudoInput] = useState(false)
  const [rustdeskAction, setRustdeskAction] = useState('')
  const [remotePowerAction, setRemotePowerAction] = useState('')
  const [hatDisplayAction, setHatDisplayAction] = useState(false)
  const [remoteServiceAction, setRemoteServiceAction] = useState('')
  const [cleaningSessions, setCleaningSessions] = useState(false)
  const [remoteStatus, setRemoteStatus] = useState(null)
  const [remoteStatusLoading, setRemoteStatusLoading] = useState(false)
  const [lanIpData, setLanIpData] = useState(null)
  const [lanIpLoading, setLanIpLoading] = useState(false)

  const refreshRemoteStatus = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setRemoteStatusLoading(true)
    try {
      const res = await fetch('/api/services/remote-machine/status', {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await readJsonResponse(res)
      if (!res.ok) throw new Error(data.detail || data.error || 'Không kiểm tra được trạng thái remote')
      setRemoteStatus(data)
    } catch (err) {
      setRemoteStatus({
        state: 'unknown',
        online: false,
        sshReachable: false,
        detail: err.message,
      })
    } finally {
      setRemoteStatusLoading(false)
    }
  }, [token])

  useEffect(() => {
    let stopped = false
    const run = async (silent = false) => {
      if (!stopped) await refreshRemoteStatus({ silent })
    }
    run(false)
    const timer = window.setInterval(() => { if (!document.hidden) run(true) }, 30000)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [token, refreshRemoteStatus])

  async function forceReboot() {
    const ok = window.confirm('Force restart Mac mini ngay? Các tiến trình chưa lưu có thể mất dữ liệu.')
    if (!ok) return
    if (!sudoPassword) {
      setShowSudoInput(true)
      return
    }
    setRebooting(true)
    setMessage({ text: '', type: '' })
    try {
      const res = await fetch('/api/quick-commands/reboot', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ args: 'force', sudo_password: sudoPassword })
      })
      const data = await readJsonResponse(res)
      if (!res.ok) throw new Error(data.detail || data.error || 'Không force restart được')
      setMessage({ text: data.content || 'Đã gửi lệnh force restart Mac mini', type: 'success' })
    } catch (err) {
      setMessage({ text: err.message, type: 'error' })
    } finally {
      setRebooting(false)
    }
  }

  async function runRustDesk(action) {
    setRustdeskAction(action)
    setMessage({ text: '', type: '' })
    try {
      const res = await fetch('/api/quick-commands/rustdesk', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ args: action })
      })
      const data = await readJsonResponse(res)
      if (!res.ok) throw new Error(data.detail || data.error || `Không chạy được RustDesk ${action}`)
      setMessage({ text: data.content || `Đã gửi lệnh RustDesk ${action}`, type: 'success' })
    } catch (err) {
      setMessage({ text: err.message, type: 'error' })
    } finally {
      setRustdeskAction('')
    }
  }

  async function runHatDisplay() {
    setHatDisplayAction(true)
    setMessage({ text: '', type: '' })
    try {
      const res = await fetch('/api/quick-commands/hatdisplay', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ args: 'on' })
      })
      const data = await readJsonResponse(res)
      if (!res.ok) throw new Error(data.detail || data.error || 'Không bật được HatDisplay')
      setMessage({ text: data.content || 'Đã gửi lệnh bật HatDisplay', type: 'success' })
    } catch (err) {
      setMessage({ text: err.message, type: 'error' })
    } finally {
      setHatDisplayAction(false)
    }
  }

  async function runRemotePower(command) {
    setRemotePowerAction(command)
    setMessage({ text: '', type: '' })
    if (command === 'bat') {
      fetch(`/api/quick-commands/${command}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }).catch(() => {})
      setRemotePowerAction('')
      setMessage({ text: 'Đã gửi lệnh bật máy remote', type: 'success' })
      setTimeout(() => refreshRemoteStatus({ silent: false }), 3000)
      return
    }
    try {
      const res = await fetch(`/api/quick-commands/${command}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
      const data = await readJsonResponse(res)
      if (!res.ok) throw new Error(data.detail || data.error || `Không chạy được /${command}`)
      setMessage({ text: data.content || `Đã gửi lệnh /${command}`, type: 'success' })
    } catch (err) {
      setMessage({ text: err.message, type: 'error' })
    } finally {
      setRemotePowerAction('')
      refreshRemoteStatus({ silent: true })
    }
  }

  async function runRemoteService(command) {
    setRemoteServiceAction(command)
    setMessage({ text: '', type: '' })
    try {
      const res = await fetch(`/api/quick-commands/${command}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
      const data = await readJsonResponse(res)
      if (!res.ok) throw new Error(data.detail || data.error || `Không chạy được /${command}`)
      setMessage({ text: data.content || `Đã gửi lệnh /${command}`, type: 'success' })
    } catch (err) {
      setMessage({ text: err.message, type: 'error' })
    } finally {
      setRemoteServiceAction('')
      refreshRemoteStatus({ silent: true })
    }
  }

  async function scanLanIP() {
    setLanIpLoading(true)
    setLanIpData(null)
    setMessage({ text: '', type: '' })
    try {
      const res = await fetch('/api/services/remote-machine/lan-ip', {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await readJsonResponse(res)
      if (!res.ok) throw new Error(data.detail || data.error || 'Không dò được IP LAN')
      setLanIpData(data)
      if (data.lan_ip) {
        setMessage({ text: `Tìm thấy remote tại ${data.lan_ip}`, type: 'success' })
      } else {
        setMessage({ text: 'Không tìm thấy remote trong LAN', type: 'error' })
      }
    } catch (err) {
      setMessage({ text: err.message, type: 'error' })
    } finally {
      setLanIpLoading(false)
    }
  }

  const statusTone = remoteStatus?.state === 'online'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
    : remoteStatus?.state === 'ssh_unavailable'
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : 'border-red-200 bg-red-50 text-red-800'
  const statusDot = remoteStatus?.state === 'online'
    ? 'bg-emerald-500'
    : remoteStatus?.state === 'ssh_unavailable'
      ? 'bg-amber-500'
      : 'bg-red-500'
  const statusLabel = remoteStatusLoading && !remoteStatus
    ? 'Đang kiểm tra...'
    : remoteStatus?.state === 'online'
      ? 'Remote đang bật'
      : remoteStatus?.state === 'ssh_unavailable'
        ? 'Remote bật, SSH chưa sẵn sàng'
        : 'Remote offline hoặc không reachable'
  const statusSummary = remoteStatus?.detail || 'Đang kiểm tra SSH remote...'

  const controlGroups = [
    {
      title: 'Nguồn máy',
      sub: 'Wake, shutdown và trạng thái remote',
      actions: [
        { label: 'Bật máy remote', detail: 'Gửi lệnh bật máy từ host hiện tại', busyLabel: 'Đang bật...', busy: remotePowerAction === 'bat', disabled: !!remotePowerAction, onClick: () => runRemotePower('bat'), tone: 'emerald' },
        { label: 'Tắt máy remote', detail: 'Tắt remote sau khi xác nhận', busyLabel: 'Đang tắt...', busy: remotePowerAction === 'tat', disabled: !!remotePowerAction, onClick: () => runRemotePower('tat'), tone: 'orange' },
      ],
    },
    {
      title: 'Truy cập từ xa',
      sub: 'RustDesk, display và dịch vụ model',
      actions: [
        { label: 'Bật RustDesk', detail: 'Khởi động remote desktop', busyLabel: 'Đang bật...', busy: rustdeskAction === 'on', disabled: !!rustdeskAction, onClick: () => runRustDesk('on'), tone: 'emerald' },
        { label: 'Restart RustDesk', detail: 'Làm mới phiên RustDesk', busyLabel: 'Đang restart...', busy: rustdeskAction === 'restart', disabled: !!rustdeskAction, onClick: () => runRustDesk('restart'), tone: 'sky' },
        { label: 'Tắt RustDesk', detail: 'Dừng remote desktop', busyLabel: 'Đang tắt...', busy: rustdeskAction === 'off', disabled: !!rustdeskAction, onClick: () => runRustDesk('off'), tone: 'slate' },
        { label: 'Bật HatDisplay', detail: 'Kích hoạt màn hình Hat', busyLabel: 'Đang bật...', busy: hatDisplayAction, disabled: hatDisplayAction, onClick: runHatDisplay, tone: 'violet' },
        { label: 'Bật LM Studio Remote', detail: 'Khởi động model server', busyLabel: 'Đang bật...', busy: remoteServiceAction === 'lmstudio', disabled: !!remoteServiceAction, onClick: () => runRemoteService('lmstudio'), tone: 'indigo' },
      ],
    },
    {
      title: 'Mạng',
      sub: 'Dò tìm LAN IP khi Tailscale lỗi',
      actions: [
        {
          label: lanIpData?.lan_ip ? `LAN IP: ${lanIpData.lan_ip}` : 'Dò IP LAN',
          detail: lanIpData?.lan_ip
            ? `Phát hiện qua ${(lanIpData.discovered_via || []).map(d => d.via).join(', ') || 'N/A'}`
            : `Quét ARP + ping sweep subnet tìm MAC ${lanIpData?.mac || '9c:6b:00:17:93:7a'}`,
          busyLabel: 'Đang dò...', busy: lanIpLoading, disabled: lanIpLoading, onClick: scanLanIP, tone: lanIpData?.lan_ip ? 'emerald' : lanIpData ? 'red' : 'sky',
        },
      ],
    },
    {
      title: 'Bảo trì',
      sub: 'Dọn dữ liệu runtime và tác vụ rủi ro',
      actions: [
        {
          label: 'Dọn sessions', detail: 'Xóa lịch sử session và file trên đĩa', busyLabel: 'Đang dọn...', busy: cleaningSessions, disabled: cleaningSessions, onClick: async () => {
            setCleaningSessions(true)
            setMessage({ text: '', type: '' })
            try {
              const res = await fetch('/api/sessions/clean', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
              })
              const data = await readJsonResponse(res)
              if (!res.ok) throw new Error(data.detail || data.error || 'Không dọn được sessions')
              setMessage({ text: data.message || 'Đã dọn sessions', type: 'success' })
            } catch (err) {
              setMessage({ text: err.message, type: 'error' })
            } finally {
              setCleaningSessions(false)
            }
          }, tone: 'amber',
        },
        { label: 'Force restart', detail: 'Restart Mac mini bằng sudo', busyLabel: 'Đang gửi...', busy: rebooting, disabled: rebooting, onClick: forceReboot, tone: 'red', danger: true },
      ],
    },
  ]

  const toneClasses = {
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-300 hover:bg-emerald-100',
    orange: 'border-orange-200 bg-orange-50 text-orange-800 hover:border-orange-300 hover:bg-orange-100',
    sky: 'border-sky-200 bg-sky-50 text-sky-800 hover:border-sky-300 hover:bg-sky-100',
    slate: 'border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-300 hover:bg-gray-100',
    violet: 'border-violet-200 bg-violet-50 text-violet-800 hover:border-violet-300 hover:bg-violet-100',
    indigo: 'border-indigo-200 bg-indigo-50 text-indigo-800 hover:border-indigo-300 hover:bg-indigo-100',
    amber: 'border-amber-200 bg-amber-50 text-amber-800 hover:border-amber-300 hover:bg-amber-100',
    red: 'border-red-200 bg-red-50 text-red-800 hover:border-red-300 hover:bg-red-100',
  }

  const renderAction = (action) => (
    <button
      key={action.label}
      type="button"
      onClick={action.onClick}
      disabled={action.disabled}
      className={`group flex min-h-[82px] flex-col justify-between rounded-lg border p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 ${toneClasses[action.tone] || toneClasses.slate}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold leading-5 text-gray-950">
            {action.busy ? action.busyLabel : action.label}
          </div>
          <div className="mt-1 text-[11px] leading-4 opacity-75">{action.detail}</div>
        </div>
        <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${action.danger ? 'bg-red-500' : action.busy ? 'animate-pulse bg-current' : 'bg-current opacity-60'}`} />
      </div>
      {action.danger && (
        <div className="mt-3 inline-flex w-fit items-center rounded border border-red-200 bg-white/50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-red-700">
          Xác nhận bắt buộc
        </div>
      )}
    </button>
  )

  return (
    <section className="space-y-5">
      {message.text && (
        <div className={`rounded-md px-4 py-2 text-[11px] font-semibold ${
          message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
        }`}>
          {message.text}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 bg-gradient-to-r from-gray-950 via-gray-900 to-slate-800 px-5 py-5 text-white">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
                <PowerIcon />
              </div>
              <div>
                <h2 className="text-base font-semibold tracking-tight">Điều khiển Mac mini</h2>
                <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.2em] text-white/50">Host operations console</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => refreshRemoteStatus()}
              disabled={remoteStatusLoading}
              className="inline-flex h-9 w-fit items-center justify-center rounded-md border border-white/15 bg-white/10 px-3 text-[11px] font-semibold text-white transition-all hover:bg-white/15 disabled:opacity-50"
            >
              {remoteStatusLoading ? 'Đang quét...' : 'Quét trạng thái'}
            </button>
          </div>
        </div>

        <div className="grid gap-4 p-4 lg:grid-cols-[360px_1fr]">
          <aside className="space-y-3">
            <div className={`rounded-lg border p-4 ${statusTone}`}>
              <div className="flex items-start gap-3">
                <span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${statusDot} ${remoteStatusLoading ? 'animate-pulse' : ''}`} />
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold">{statusLabel}</div>
                  <div className="mt-1 break-words text-[12px] leading-5 opacity-80">{statusSummary}</div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
              <div className="text-[12px] font-semibold">Khu vực thao tác hệ thống</div>
              <p className="mt-1 text-[11px] leading-5 text-amber-800/80">
                Các lệnh shutdown, dọn session và restart bắt buộc xác nhận trước khi gửi xuống host.
              </p>
            </div>

            {showSudoInput && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <label className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-red-500">Sudo password</label>
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    value={sudoPassword}
                    onChange={e => setSudoPassword(e.target.value)}
                    placeholder="Nhập sudo password..."
                    className="min-w-0 flex-1 rounded-md border border-red-200 bg-white px-3 py-2 text-[12px] text-red-700 outline-none transition-all placeholder:text-red-300 focus:border-red-400"
                    autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') forceReboot() }}
                  />
                  <button
                    type="button"
                    onClick={() => { setShowSudoInput(false); setSudoPassword('') }}
                    className="rounded-md border border-red-200 bg-white px-3 py-2 text-[11px] font-semibold text-red-600 hover:border-red-300"
                  >
                    Hủy
                  </button>
                </div>
              </div>
            )}
          </aside>

          <div className="space-y-4">
            {controlGroups.map(group => (
              <div key={group.title} className="rounded-lg border border-gray-100 bg-gray-50/60 p-3">
                <div className="mb-3 flex items-end justify-between gap-3">
                  <div>
                    <h3 className="text-[13px] font-semibold text-gray-950">{group.title}</h3>
                    <p className="mt-0.5 text-[11px] leading-4 text-gray-400">{group.sub}</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {group.actions.map(renderAction)}
                </div>
              </div>
            ))}

            {lanIpData && (
              <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-[13px] font-semibold text-gray-900">Kết quả dò IP LAN</h3>
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${lanIpData.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${lanIpData.ok ? 'bg-emerald-500' : 'bg-red-500'}`} />
                    {lanIpData.ok ? 'Online' : 'Offline'}
                  </span>
                </div>

                <div className="space-y-2 text-[12px]">
                  <div className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2">
                    <span className="text-gray-500">LAN IP</span>
                    <span className="font-mono font-semibold text-gray-900">
                      {lanIpData.lan_ip || 'Không tìm thấy'}
                    </span>
                  </div>

                  {lanIpData.lan_ip && (
                    <div className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2">
                      <span className="text-gray-500">SSH</span>
                      <span className="flex items-center gap-2 font-mono text-gray-700">
                        <span className="select-all">{lanIpData.instructions}</span>
                        <CopyButton text={lanIpData.instructions} />
                      </span>
                    </div>
                  )}

                  {lanIpData.ssh_user && (
                    <div className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2">
                      <span className="text-gray-500">User</span>
                      <span className="font-mono text-gray-700">{lanIpData.ssh_user}</span>
                    </div>
                  )}

                  {lanIpData.discovered_via?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {lanIpData.discovered_via.map((d, i) => (
                        <span key={i} className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-mono text-gray-500">{d.via}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
