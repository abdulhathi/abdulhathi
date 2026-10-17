import { hrefFor } from '../lib/route';
import { projectFor, type LearningPath } from '../paths';
import { Markdown } from './Markdown';

/** A portfolio project brief, with a way back to its learning path. */
export function ProjectPage({ path }: { path: LearningPath }) {
  const project = projectFor(path.id);
  if (!project) return <p className="md prose">The project brief for this path is still being written.</p>;
  return (
    <div className="project-page">
      <p className="ch-meta">
        <span>{project.time}</span>
        <span>
          <a href={hrefFor('path', path.id)}>Back to the {path.title} path</a>
        </span>
      </p>
      <Markdown src={project.body} className="md prose" />
    </div>
  );
}
