import * as monaco from 'monaco-editor'
// monaco-editor 0.56 で言語サービスはトップレベル名前空間へ移動した
// （monaco.languages.typescript は deprecated スタブなので使えない）
import { typescript } from 'monaco-editor'
// monaco-editor 0.56 の exports マップ（"./*.js" → "./esm/vs/*.js"）に合わせたサブパス
import editorWorker from 'monaco-editor/editor/editor.worker.js?worker'
import jsonWorker from 'monaco-editor/language/json/json.worker.js?worker'
import cssWorker from 'monaco-editor/language/css/css.worker.js?worker'
import htmlWorker from 'monaco-editor/language/html/html.worker.js?worker'
import tsWorker from 'monaco-editor/language/typescript/ts.worker.js?worker'

/**
 * Monaco の Vite ネイティブ worker セットアップ（§10 検証: CDN は使わない）。
 * vite-plugin-monaco-editor は不採用（4 年更新停止）。
 */
// self はブラウザ（renderer）側のみ。Node 上のユニットテストから import しても壊れないようガードする
if (typeof self !== 'undefined') {
  self.MonacoEnvironment = {
    getWorker(_workerId: string, label: string): Worker {
      switch (label) {
        case 'json':
          return new jsonWorker()
        case 'css':
        case 'scss':
        case 'less':
          return new cssWorker()
        case 'html':
        case 'handlebars':
        case 'razor':
          return new htmlWorker()
        case 'typescript':
        case 'javascript':
          return new tsWorker()
        default:
          return new editorWorker()
      }
    }
  }
}

/**
 * TypeScript / JavaScript のコード補完（言語サービス）を有効にする。
 * ワークスペースのファイルは file:// URI のモデルとして開くので、
 * 同一プロジェクト内の import 補完・型チェックが効く。
 */
export function configureLanguageServices(): void {
  const compilerOptions: typescript.CompilerOptions = {
    target: typescript.ScriptTarget.ESNext,
    module: typescript.ModuleKind.ESNext,
    moduleResolution: typescript.ModuleResolutionKind.NodeJs,
    jsx: typescript.JsxEmit.ReactJSX,
    allowJs: true,
    allowNonTsExtensions: true,
    esModuleInterop: true,
    strict: true,
    skipLibCheck: true
  }
  typescript.typescriptDefaults.setCompilerOptions(compilerOptions)
  typescript.javascriptDefaults.setCompilerOptions(compilerOptions)

  // 依存パッケージの型は持たないため「モジュールが見つからない」系の指摘だけ抑制する
  const diagnosticsOptions: typescript.DiagnosticsOptions = {
    noSemanticValidation: false,
    noSyntaxValidation: false,
    diagnosticCodesToIgnore: [
      2307, // Cannot find module
      2792, // Cannot find module (did you mean moduleResolution node?)
      7016 // Could not find a declaration file
    ]
  }
  typescript.typescriptDefaults.setDiagnosticsOptions(diagnosticsOptions)
  typescript.javascriptDefaults.setDiagnosticsOptions(diagnosticsOptions)
  typescript.typescriptDefaults.setEagerModelSync(true)
  typescript.javascriptDefaults.setEagerModelSync(true)
}

/** コード補完を含む IDE 相当のエディタ既定 */
export const EDITOR_DEFAULTS: monaco.editor.IStandaloneEditorConstructionOptions = {
  automaticLayout: true,
  minimap: { enabled: false },
  fontSize: 12,
  tabSize: 2,
  quickSuggestions: { other: true, comments: false, strings: true },
  suggestOnTriggerCharacters: true,
  acceptSuggestionOnEnter: 'on',
  tabCompletion: 'on',
  wordBasedSuggestions: 'currentDocument',
  parameterHints: { enabled: true },
  autoClosingBrackets: 'languageDefined',
  autoClosingQuotes: 'languageDefined',
  formatOnPaste: true,
  bracketPairColorization: { enabled: true },
  scrollBeyondLastLine: false,
  renderWhitespace: 'selection'
}

export { monaco }

/** ファイルパスから Monaco の言語 id を推定する */
export function languageForPath(path: string): string {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    json: 'json',
    css: 'css',
    scss: 'scss',
    html: 'html',
    md: 'markdown',
    py: 'python',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    java: 'java',
    sh: 'shell',
    yml: 'yaml',
    yaml: 'yaml',
    toml: 'ini',
    sql: 'sql',
    swift: 'swift',
    kt: 'kotlin'
  }
  return map[ext] ?? 'plaintext'
}

/** ワークスペース内のファイルを一意に指す Monaco モデル URI（import 解決に使う） */
export function modelUriFor(root: string, relPath: string): monaco.Uri {
  const normalizedRoot = root.replace(/\/+$/, '')
  return monaco.Uri.parse(`file://${normalizedRoot}/${relPath}`)
}
