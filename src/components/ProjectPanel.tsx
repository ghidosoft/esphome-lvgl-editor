import type { EsphomeProject } from '../parser/types';
import { useEditorStore } from '../editor/store';
import type { SchemaEntry } from '../editor/schema';
import { PropControl } from './PropControl';

interface Props {
  project: EsphomeProject;
}

const WIDTH_ENTRY: SchemaEntry = { key: 'displayWidth', kind: 'number', min: 1, unit: 'px' };
const HEIGHT_ENTRY: SchemaEntry = { key: 'displayHeight', kind: 'number', min: 1, unit: 'px' };
const DARK_ENTRY: SchemaEntry = { key: 'darkMode', kind: 'bool' };

/**
 * Project-level settings panel: display dimensions and dark mode. Edits are
 * staged in `projectOverrides` and flushed by SaveBar against `project.sourcePath`.
 * Shown when the user explicitly picks the "Project" tab, and as the fallback
 * when nothing is selected on the canvas.
 */
export function ProjectPanel({ project }: Props) {
  const projectOverrides = useEditorStore((s) => s.projectOverrides);
  const updateProjectSetting = useEditorStore((s) => s.updateProjectSetting);

  const widthValue = projectOverrides.displayWidth ?? project.display.width;
  const heightValue = projectOverrides.displayHeight ?? project.display.height;
  const darkValue = projectOverrides.darkMode ?? project.theme.darkMode;

  const widthDirty = projectOverrides.displayWidth !== undefined;
  const heightDirty = projectOverrides.displayHeight !== undefined;
  const darkDirty = projectOverrides.darkMode !== undefined;

  return (
    <div className="panel-body">
      <header className="panel-body__header">
        <div className="panel-body__type">Project</div>
        <div className="panel-body__id">{project.name}</div>
        <OriginLine label="writes to" file={project.sourcePath} />
      </header>

      <div className="panel-body__rows">
        <div className="prop-group">
          <div className="prop-group__header">Display</div>
          <div className="prop-group__rows">
            <SettingRow
              label="width"
              entry={WIDTH_ENTRY}
              value={widthValue}
              hasOverride={widthDirty}
              onChange={(v) =>
                updateProjectSetting(
                  'displayWidth',
                  typeof v === 'number' && Number.isFinite(v) ? v : undefined,
                )
              }
              onRevert={() => updateProjectSetting('displayWidth', undefined)}
            />
            <SettingRow
              label="height"
              entry={HEIGHT_ENTRY}
              value={heightValue}
              hasOverride={heightDirty}
              onChange={(v) =>
                updateProjectSetting(
                  'displayHeight',
                  typeof v === 'number' && Number.isFinite(v) ? v : undefined,
                )
              }
              onRevert={() => updateProjectSetting('displayHeight', undefined)}
            />
          </div>
        </div>

        <div className="prop-group">
          <div className="prop-group__header">Theme</div>
          <div className="prop-group__rows">
            <SettingRow
              label="dark mode"
              entry={DARK_ENTRY}
              value={darkValue}
              hasOverride={darkDirty}
              onChange={(v) =>
                updateProjectSetting('darkMode', typeof v === 'boolean' ? v : undefined)
              }
              onRevert={() => updateProjectSetting('darkMode', undefined)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingRow({
  label,
  entry,
  value,
  hasOverride,
  onChange,
  onRevert,
}: {
  label: string;
  entry: SchemaEntry;
  value: unknown;
  hasOverride: boolean;
  onChange: (v: unknown) => void;
  onRevert: () => void;
}) {
  const rowClass = ['prop-row', hasOverride ? 'prop-row--dirty' : ''].join(' ').trim();
  return (
    <div className={rowClass}>
      <div className="prop-row__key">
        {label}
        {hasOverride && <span className="prop-row__dirty-dot" title="unsaved change" />}
      </div>
      <div className="prop-row__control">
        <PropControl entry={entry} value={value} onChange={onChange} />
        {hasOverride && (
          <button
            type="button"
            className="prop-row__btn"
            title="Revert to source"
            onClick={onRevert}
          >
            ↺
          </button>
        )}
      </div>
    </div>
  );
}

function OriginLine({ label, file }: { label: string; file: string }) {
  if (!file) return null;
  return (
    <div className="prop-row__origin">
      {label} <code>{shortFile(file)}</code>
    </div>
  );
}

function shortFile(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/');
  return parts.slice(-2).join('/');
}
