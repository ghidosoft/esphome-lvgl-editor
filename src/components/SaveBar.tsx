import { useEffect, useMemo } from 'react';
import { useEditorStore } from '../editor/store';
import { buildEditOps } from '../editor/mutation';
import { commitProject, postEdit } from '../client/api';
import type { EsphomeProject } from '../parser/types';

interface Props {
  project: EsphomeProject;
  projectName: string;
  onSaved: () => void;
}

/**
 * Floating bar on the canvas stage with pending-edit count and Save action.
 * Hidden when there's nothing to save.
 *
 * Save flow: translate overrides → ops, POST /__lvgl/edit (server mutates CST
 * in memory), then POST /__lvgl/commit (server writes dirty files). On
 * success: clear overrides, ask the project hook to refetch so the new
 * source-map reflects on-disk state.
 */
export function SaveBar({ project, projectName, onSaved }: Props) {
  const overrides = useEditorStore((s) => s.overrides);
  const saving = useEditorStore((s) => s.saving);
  const saveError = useEditorStore((s) => s.saveError);
  const setSaving = useEditorStore((s) => s.setSaving);
  const setSaveError = useEditorStore((s) => s.setSaveError);
  const clearOverrides = useEditorStore((s) => s.clearOverrides);

  const { ops, skipped } = useMemo(() => buildEditOps(project, overrides), [project, overrides]);

  const dirtyWidgetCount = Object.keys(overrides).length;
  const hasAnything = dirtyWidgetCount > 0;

  async function doSave() {
    if (ops.length === 0) {
      // Nothing the server can actually persist (all overrides are var-backed
      // or otherwise deferred). Surface it rather than silently "succeed".
      setSaveError('No saveable changes — variable-backed edits need P4.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await postEdit(projectName, ops);
      await commitProject(projectName);
      clearOverrides();
      onSaved();
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // Ctrl/Cmd+S shortcut.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        if (!hasAnything) return;
        e.preventDefault();
        doSave();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAnything, ops, projectName]);

  if (!hasAnything && !saveError) return null;

  return (
    <div className="save-bar">
      <div className="save-bar__main">
        <span className="save-bar__count">
          {dirtyWidgetCount} widget{dirtyWidgetCount === 1 ? '' : 's'} with unsaved edits
        </span>
        {skipped.length > 0 && (
          <span className="save-bar__skipped" title={skipped.map((s) => `${s.propKey}: ${s.reason}`).join('\n')}>
            · {skipped.length} deferred
          </span>
        )}
      </div>
      <div className="save-bar__actions">
        <button
          type="button"
          className="save-bar__discard"
          onClick={() => { clearOverrides(); setSaveError(null); }}
          disabled={saving}
        >
          Discard
        </button>
        <button type="button" className="save-bar__save" onClick={doSave} disabled={saving || ops.length === 0}>
          {saving ? 'Saving…' : `Save (${ops.length})`}
        </button>
      </div>
      {saveError && <div className="save-bar__error">{saveError}</div>}
    </div>
  );
}
