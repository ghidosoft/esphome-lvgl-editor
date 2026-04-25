import type { EsphomeProject } from '../parser/types';
import { useEditorStore } from '../editor/store';
import { PropertyPanel } from './PropertyPanel';
import { VariablesPanel } from './VariablesPanel';
import { StylesPanel } from './StylesPanel';
import { ProjectPanel } from './ProjectPanel';

interface Props {
  project: EsphomeProject;
}

/**
 * Right-column container for the Properties / Styles / Variables / Project
 * tabs. Active tab lives in the editor store so other views can switch to it
 * directly. The Properties tab falls back to the Project panel when nothing is
 * selected on the canvas — turning the otherwise empty inspector into a useful
 * default landing.
 */
export function EditorPanel({ project }: Props) {
  const activeTab = useEditorStore((s) => s.activeTab);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);
  const selectedWidgetId = useEditorStore((s) => s.selectedWidgetId);

  const varCount = Object.keys(project.substitutions ?? {}).length;
  const styleCount = Object.keys(project.styles ?? {}).length;

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
          aria-selected={activeTab === 'styles'}
          className={`editor-panel__tab ${activeTab === 'styles' ? 'editor-panel__tab--active' : ''}`}
          onClick={() => setActiveTab('styles')}
        >
          Styles <span className="editor-panel__tab-count">{styleCount}</span>
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
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'project'}
          className={`editor-panel__tab ${activeTab === 'project' ? 'editor-panel__tab--active' : ''}`}
          onClick={() => setActiveTab('project')}
        >
          Project
        </button>
      </div>
      <div className="editor-panel__content">
        {activeTab === 'properties' &&
          (selectedWidgetId ? <PropertyPanel project={project} /> : <ProjectPanel project={project} />)}
        {activeTab === 'styles' && <StylesPanel project={project} />}
        {activeTab === 'variables' && <VariablesPanel project={project} />}
        {activeTab === 'project' && <ProjectPanel project={project} />}
      </div>
    </aside>
  );
}
