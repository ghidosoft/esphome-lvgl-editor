import { NavLink, useParams } from 'react-router-dom';
import type { EsphomeProject } from '../parser/types';
import type { ProjectListEntry } from '../server/projectScanner';

interface SidebarProps {
  projects: ProjectListEntry[];
  activeProject: EsphomeProject | null;
}

export function Sidebar({ projects, activeProject }: SidebarProps) {
  const params = useParams<{ name?: string; pageId?: string }>();
  const activeName = params.name;

  return (
    <aside className="sidebar">
      <h1 className="sidebar__title">LVGL Editor</h1>
      <nav className="sidebar__list">
        {projects.map((p) => {
          const isActive = p.name === activeName;
          return (
            <div key={p.name} className="sidebar__group">
              <NavLink
                to={p.hasLvgl ? `/project/${p.name}` : '#'}
                className={({ isActive: navActive }) =>
                  'sidebar__project' +
                  (navActive ? ' sidebar__project--active' : '') +
                  (!p.hasLvgl ? ' sidebar__project--disabled' : '')
                }
                onClick={(e) => { if (!p.hasLvgl) e.preventDefault(); }}
              >
                <span className="sidebar__name">{p.name}</span>
                {!p.hasLvgl && <span className="sidebar__badge">no LVGL</span>}
              </NavLink>
              {isActive && activeProject?.pages?.length ? (
                <ul className="sidebar__pages">
                  {activeProject.pages.map((page) => (
                    <li key={page.id}>
                      <NavLink
                        to={`/project/${p.name}/page/${page.id}`}
                        className={({ isActive: pageActive }) =>
                          'sidebar__page' + (pageActive ? ' sidebar__page--active' : '')
                        }
                      >
                        <span>{page.id}</span>
                        {page.skip && <span className="sidebar__skip">skip</span>}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
