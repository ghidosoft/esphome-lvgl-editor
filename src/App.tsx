import { useMemo } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { DeviceFrame } from './components/DeviceFrame';
import { CanvasView } from './components/CanvasView';
import { ErrorDrawer } from './components/ErrorDrawer';
import { EditorPanel } from './components/EditorPanel';
import { SaveBar } from './components/SaveBar';
import { useProject } from './client/hooks/useProject';
import { useProjects } from './client/hooks/useProjects';
import { useEditorStore, applyOverrides } from './editor/store';

export function App() {
  const projects = useProjects();

  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<HomeRedirect projects={projects.data ?? []} loading={projects.loading} />} />
        <Route path="/project/:name" element={<ProjectShell projects={projects.data ?? []} />} />
        <Route path="/project/:name/page/:pageId" element={<ProjectShell projects={projects.data ?? []} />} />
        <Route path="*" element={<HomeRedirect projects={projects.data ?? []} loading={projects.loading} />} />
      </Routes>
    </div>
  );
}

function HomeRedirect({ projects, loading }: { projects: { name: string; hasLvgl: boolean }[]; loading: boolean }) {
  if (loading) return <div className="loading">Loading projects…</div>;
  const first = projects.find((p) => p.hasLvgl);
  if (!first) {
    return (
      <div className="empty">
        No ESPHome projects with an <code>lvgl:</code> block found in <code>../esphome/</code>.
      </div>
    );
  }
  return <Navigate to={`/project/${first.name}`} replace />;
}

function ProjectShell({ projects }: { projects: { name: string; hasLvgl: boolean }[] }) {
  const params = useParams<{ name: string; pageId?: string }>();
  const name = params.name!;
  const project = useProject(name);
  const widgetOverrides = useEditorStore((s) => s.widgetOverrides);
  const varOverrides = useEditorStore((s) => s.varOverrides);
  const widgetDeletions = useEditorStore((s) => s.widgetDeletions);
  const styleOverrides = useEditorStore((s) => s.styleOverrides);
  const styleDeletions = useEditorStore((s) => s.styleDeletions);

  const derivedProject = useMemo(
    () =>
      project.data
        ? applyOverrides(
            project.data,
            widgetOverrides,
            varOverrides,
            widgetDeletions,
            styleOverrides,
            styleDeletions,
          )
        : null,
    [project.data, widgetOverrides, varOverrides, widgetDeletions, styleOverrides, styleDeletions],
  );

  // Default to first non-skip page (mirrors the device's startup page).
  if (derivedProject && !params.pageId && derivedProject.pages.length > 0) {
    const initial = derivedProject.pages.find((p) => !p.skip) ?? derivedProject.pages[0];
    return <Navigate to={`/project/${name}/page/${initial.id}`} replace />;
  }

  const activePage = derivedProject?.pages.find((p) => p.id === params.pageId) ?? null;

  return (
    <>
      <Sidebar projects={projects} activeProject={derivedProject} />
      <main className="stage">
        {project.loading && <div className="loading">Loading {name}…</div>}
        {project.error && <div className="error">Error: {project.error}</div>}
        {derivedProject && !derivedProject.hasLvgl && (
          <div className="empty">
            <code>{name}</code> doesn't define an <code>lvgl:</code> block.
          </div>
        )}
        {derivedProject && derivedProject.hasLvgl && activePage && (
          <DeviceFrame width={derivedProject.display.width} height={derivedProject.display.height}>
            <CanvasView project={derivedProject} page={activePage} />
          </DeviceFrame>
        )}
        {derivedProject && derivedProject.hasLvgl && !activePage && derivedProject.pages.length === 0 && (
          <div className="empty">No pages defined.</div>
        )}
        {derivedProject && <SaveBar project={derivedProject} projectName={name} onSaved={project.refetch} />}
      </main>
      {derivedProject ? <EditorPanel project={derivedProject} /> : <aside className="editor-panel" />}
      <ErrorDrawer errors={derivedProject?.errors ?? []} />
    </>
  );
}
