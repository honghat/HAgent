import { useState } from 'react'
import AgentManager from './AgentManager.jsx'
import SkillManager from './SkillManager.jsx'

export default function AgentSkillManager({ token, agents, onUpdate }) {
  const [section, setSection] = useState('agents')

  return (
    <div className="h-full flex flex-col bg-gray-50 overflow-hidden">
      <div className="shrink-0 px-3 pt-3 md:px-5 md:pt-5">
        <div className="max-w-6xl mx-auto w-full flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-base font-semibold text-gray-900 tracking-tight">Agent và kỹ năng</h1>
            <p className="text-[11px] font-medium text-gray-400 mt-1">Quản lý agent và bộ kỹ năng trong cùng một màn hình.</p>
          </div>
          <div className="inline-flex w-full sm:w-auto rounded-md bg-white border border-gray-200 p-1">
            <button
              onClick={() => setSection('agents')}
              className={`flex-1 sm:flex-none rounded px-3 py-1.5 text-[11px] font-medium transition-all ${section === 'agents' ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'}`}
            >
              Agent
            </button>
            <button
              onClick={() => setSection('skills')}
              className={`flex-1 sm:flex-none rounded px-3 py-1.5 text-[11px] font-medium transition-all ${section === 'skills' ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'}`}
            >
              Kỹ năng
            </button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {section === 'agents' ? (
          <AgentManager token={token} agents={agents} onUpdate={onUpdate} embedded />
        ) : (
          <SkillManager token={token} embedded />
        )}
      </div>
    </div>
  )
}
