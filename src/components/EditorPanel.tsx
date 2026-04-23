import type { EsphomeProject } from '../parser/types';
import { useEditorStore } from '../editor/store';
import { PropertyPanel } from './PropertyPanel';
import { VariablesPanel } from './VariablesPanel';

interface Props {
  project: EsphomeProject;
}

/**
 * Right-column container for the Properties / Variables tabs. Minimal state —
 * the active tab lives in the editor store so other views (e.g. the Variables
 * count chip in the future toolbar) can switch to it directly.
 */
export function EditorPanel({ project }: Props) {
  const activeTab = useEditorStore((s) => s.activeTab);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);

  const varCount = Object.keys(project.substitutions ?? {}).length;

  return (
    <aside className="editor-panel">
      <div className="editor-panel__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'properties'}
          className={`editor-panel__tab ${activeTab === 'properties' ? 'editor-panel__tab--active' : ''}`}
          onClick={() => setActiveTab('properties')}
        >
          Properties
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'variables'}
          className={`editor-panel__tab ${activeTab === 'variables' ? 'editor-panel__tab--active' : ''}`}
          onClick={() => setActiveTab('variables')}
        >
          Variables <span className="editor-panel__tab-count">{varCount}</span>
        </button>
      </div>
      <div className="editor-panel__content">
        {activeTab === 'properties' ? <PropertyPanel project={project} /> : <VariablesPanel project={project} />}
      </div>
    </aside>
  );
}
