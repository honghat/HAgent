import CodeMirror from '@uiw/react-codemirror'

export default function CodeEditor({ value, onChange, fontSize = 13, readOnly = false }) {
  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      readOnly={readOnly}
      basicSetup={{
        lineNumbers: true,
        highlightActiveLine: true,
        highlightActiveLineGutter: true,
        foldGutter: true,
        bracketMatching: true,
        autocompletion: false,
        highlightSelectionMatches: false,
        searchKeymap: true,
        indentOnInput: true,
      }}
      className="hagent-code-editor select-text"
      style={{ fontSize: `${fontSize}px`, height: '100%' }}
      height="100%"
    />
  )
}
