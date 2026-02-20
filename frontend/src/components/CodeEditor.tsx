"use client";

import { useCallback, useRef } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { basicDark } from "@uiw/codemirror-theme-basic";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { json } from "@codemirror/lang-json";
import { EditorView } from "@codemirror/view";

const langMap: Record<string, () => ReturnType<typeof javascript>> = {
  javascript: javascript,
  typescript: () => javascript({ typescript: true }),
  python,
  json,
};

const langLabels = [
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "python", label: "Python" },
  { value: "json", label: "JSON" },
];

type CodeEditorProps = {
  value: string;
  language: string;
  onChange: (value: string) => void;
  onLanguageChange: (language: string) => void;
  readOnly?: boolean;
  className?: string;
};

export function CodeEditor({
  value,
  language,
  onChange,
  onLanguageChange,
  readOnly = false,
  className = "",
}: CodeEditorProps) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const handleChange = useCallback((v: string) => {
    onChangeRef.current(v);
  }, []);

  const extensions = [
    EditorView.lineWrapping,
    (langMap[language] || javascript)(),
  ];

  return (
    <div className={`flex flex-col h-full ${className}`}>
      <div className="flex items-center gap-2 border-b border-border bg-surface-muted/50 px-2 py-1">
        <select
          value={language}
          onChange={(e) => onLanguageChange(e.target.value)}
          disabled={readOnly}
          className="rounded border border-border bg-surface-muted text-zinc-300 text-xs px-2 py-1 focus:border-accent focus:outline-none"
        >
          {langLabels.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex-1 min-h-0">
        <CodeMirror
          value={value}
          height="100%"
          theme={basicDark}
          extensions={extensions}
          onChange={handleChange}
          editable={!readOnly}
          basicSetup={{
            lineNumbers: true,
            foldGutter: true,
            highlightActiveLine: true,
            highlightSelectionMatches: true,
          }}
          className="h-full text-left"
        />
      </div>
    </div>
  );
}
