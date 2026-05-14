import { useState } from 'react'
import AgentManager from './AgentManager.jsx'
import SkillManager from './SkillManager.jsx'

export default function AgentSkillManager({ token, agents, onUpdate }) {
  const [section, setSection] = useState('agents')

  return (
    <div className="h-full flex flex-col bg-white/30 overflow-hidden">
      <div className="shrink-0 px-3 pt-3 sm:px-4 sm:pt-4 md:px-10 md:pt-8">
        <div className="max-w-6xl mx-auto w-full flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg sm:text-xl font-semibold text-gray-900 tracking-tight">Agents & Skills</h1>
            <p className="text-[11px] font-medium text-gray-400 mt-1">Quản lý agent và bộ kỹ năng trong cùng một màn hình.</p>
          </div>
          <div className="inline-flex w-full sm:w-auto rounded-2xl bg-white border border-gray-100 p-1 shadow-sm">
            <button
              onClick={() => setSection('agents')}
              className={`flex-1 sm:flex-none rounded-lg px-3 sm:px-4 py-2 text-[11px] font-medium transition-all ${section === 'agents' ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'}`}
            >
              Agents
            </button>
            <button
              onClick={() => setSection('skills')}
              className={`flex-1 sm:flex-none rounded-lg px-3 sm:px-4 py-2 text-[11px] font-medium transition-all ${section === 'skills' ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'}`}
            >
              Skills
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
