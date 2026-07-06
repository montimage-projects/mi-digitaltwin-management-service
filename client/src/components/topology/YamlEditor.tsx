import { useCallback, useRef } from 'react';
import Editor, { OnMount, OnChange } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';

interface YamlEditorProps {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}

const defaultYaml = `# Scenario Topology
# Define your network topology here

version: "1.0"

# Network topology definition
topology:
  nodes: []
  edges: []

# Service deployments
services: []
`;

export function YamlEditor({ value, onChange, readOnly = false }: YamlEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  const handleEditorMount: OnMount = useCallback((editor) => {
    editorRef.current = editor;
  }, []);

  const handleChange: OnChange = useCallback(
    (newValue) => {
      if (newValue !== undefined) {
        onChange(newValue);
      }
    },
    [onChange]
  );

  return (
    <Editor
      height="100%"
      defaultLanguage="yaml"
      value={value || defaultYaml}
      onChange={handleChange}
      onMount={handleEditorMount}
      options={{
        readOnly,
        minimap: { enabled: false },
        fontSize: 14,
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        automaticLayout: true,
        tabSize: 2,
        insertSpaces: true,
        folding: true,
        lineDecorationsWidth: 10,
        lineNumbersMinChars: 3,
        renderLineHighlight: 'line',
        scrollbar: {
          verticalScrollbarSize: 10,
          horizontalScrollbarSize: 10,
        },
      }}
      theme="vs-dark"
    />
  );
}
