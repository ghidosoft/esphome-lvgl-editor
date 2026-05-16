import { useEffect, useEffectEvent, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { commitProject, postEdit } from '../client/api';
import { buildEditOps, buildProjectEditOps } from '../editor/mutation';
import { useEditorStore } from '../editor/store';
import type { EsphomeProject } from '../parser/types';

interface Props {
  project: EsphomeProject;
  projectName: string;
}

/**
 * Floating bar on the canvas stage with pending-edit count and Save action.
 * Hidden when there's nothing to save.
 *
 * Save flow: translate overrides → ops, POST /__lvgl/edit (server mutates
 * CST in memory), then POST /__lvgl/commit (server writes dirty files). On
 * success: clear overrides and invalidate the cached project so the new
 * source-map reflects on-disk state.
 */
export function SaveBar({ project, projectName }: Props) {
  const widgetOverrides = useEditorStore((s) => s.widgetOverrides);
  const varOverrides = useEditorStore((s) => s.varOverrides);
  const widgetDeletions = useEditorStore((s) => s.widgetDeletions);
  const styleOverrides = useEditorStore((s) => s.styleOverrides);
  const styleDeletions = useEditorStore((s) => s.styleDeletions);
  const projectOverrides = useEditorStore((s) => s.projectOverrides);
  const saveError = useEditorStore((s) => s.saveError);
  const setSaveError = useEditorStore((s) => s.setSaveError);
  const clearOverrides = useEditorStore((s) => s.clearOverrides);

  const queryClient = useQueryClient();

  const { ops, skipped } = useMemo(() => {
    const base = buildEditOps(
      project,
      widgetOverrides,
      varOverrides,
      widgetDeletions,
      styleOverrides,
      styleDeletions,
    );
    const projectOps = buildProjectEditOps(project, projectOverrides);
    return { ops: [...base.ops, ...projectOps], skipped: base.skipped };
  }, [
    project,
    widgetOverrides,
    varOverrides,
    widgetDeletions,
    styleOverrides,
    styleDeletions,
    projectOverrides,
  ]);

  const save = useMutation({
    mutationFn: async () => {
      await postEdit(projectName, ops);
      await commitProject(projectName);
    },
    onMutate: () => {
      setSaveError(null);
    },
    onSuccess: () => {
      clearOverrides();
      void queryClient.invalidateQueries({ queryKey: ['lvgl', 'project', projectName] });
    },
    onError: (e: Error) => setSaveError(e.message),
  });

  const saving = save.isPending;

  const dirtyWidgetIds = new Set([
    ...Object.keys(widgetOverrides),
    ...Object.keys(widgetDeletions),
  ]);
  const dirtyStyleIds = new Set([...Object.keys(styleOverrides), ...Object.keys(styleDeletions)]);
  const widgetCount = dirtyWidgetIds.size;
  const styleCount = dirtyStyleIds.size;
  const varCount = Object.keys(varOverrides).length;
  const projectCount = Object.keys(projectOverrides).length;
  const hasAnything = widgetCount + styleCount + varCount + projectCount > 0;

  const doSaveEvent = useEffectEvent(() => {
    if (ops.length === 0) return;
    save.mutate();
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        if (!hasAnything) return;
        e.preventDefault();
        doSaveEvent();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hasAnything]);

  if (!hasAnything && !saveError) return null;

  return (
    <div className="save-bar">
      <div className="save-bar__main">
        <span className="save-bar__count">
          {[
            widgetCount > 0 ? `${widgetCount} widget${widgetCount === 1 ? '' : 's'}` : null,
            styleCount > 0 ? `${styleCount} style${styleCount === 1 ? '' : 's'}` : null,
            varCount > 0 ? `${varCount} variable${varCount === 1 ? '' : 's'}` : null,
            projectCount > 0
              ? `${projectCount} project setting${projectCount === 1 ? '' : 's'}`
              : null,
          ]
            .filter(Boolean)
            .join(' · ')}
          {' with unsaved edits'}
        </span>
        {skipped.length > 0 && (
          <span
            className="save-bar__skipped"
            title={skipped
              .map((s) => {
                const owner = s.varName ?? s.styleId ?? s.widgetId ?? '?';
                return `${owner}${s.propKey ? `.${s.propKey}` : ''}: ${s.reason}`;
              })
              .join('\n')}
          >
            · {skipped.length} deferred
          </span>
        )}
      </div>
      <div className="save-bar__actions">
        <button
          type="button"
          className="save-bar__discard"
          onClick={() => {
            clearOverrides();
            setSaveError(null);
          }}
          disabled={saving}
        >
          Discard
        </button>
        <button
          type="button"
          className="save-bar__save"
          onClick={() => save.mutate()}
          disabled={saving || ops.length === 0}
        >
          {saving ? 'Saving…' : `Save (${ops.length})`}
        </button>
      </div>
      {saveError && <div className="save-bar__error">{saveError}</div>}
    </div>
  );
}
