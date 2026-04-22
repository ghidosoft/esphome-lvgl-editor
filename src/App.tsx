import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { DeviceFrame } from './components/DeviceFrame';
import { CanvasView } from './components/CanvasView';
import { ErrorPanel } from './components/ErrorPanel';
import { useProject } from './client/hooks/useProject';
import { useProjects } from './client/hooks/useProjects';

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

  // Default to first non-skip page (mirrors the device's startup page).
  if (project.data && !params.pageId && project.data.pages.length > 0) {
    const initial = project.data.pages.find((p) => !p.skip) ?? project.data.pages[0];
    return <Navigate to={`/project/${name}/page/${initial.id}`} replace />;
  }

  const activePage = project.data?.pages.find((p) => p.id === params.pageId) ?? null;

  return (
    <>
      <Sidebar projects={projects} activeProject={project.data} />
      <main className="stage">
        {project.loading && <div className="loading">Loading {name}…</div>}
        {project.error && <div className="error">Error: {project.error}</div>}
        {project.data && !project.data.hasLvgl && (
          <div className="empty">
            <code>{name}</code> doesn't define an <code>lvgl:</code> block.
          </div>
        )}
        {project.data && project.data.hasLvgl && activePage && (
          <DeviceFrame width={project.data.display.width} height={project.data.display.height}>
            <CanvasView project={project.data} page={activePage} />
          </DeviceFrame>
        )}
        {project.data && project.data.hasLvgl && !activePage && project.data.pages.length === 0 && (
          <div className="empty">No pages defined.</div>
        )}
      </main>
      <ErrorPanel errors={project.data?.errors ?? []} />
    </>
  );
}
