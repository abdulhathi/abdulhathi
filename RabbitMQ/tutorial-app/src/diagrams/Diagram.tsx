import { useRef, useState, type ReactNode } from 'react';
import { DiagramSvg } from './DiagramSvg';
import { DiagramViewer } from './DiagramViewer';
import type { DiagramSpec } from './geometry';

export function Diagram({ spec, caption }: { spec: DiagramSpec; caption?: ReactNode }) {
  const [zoomed, setZoomed] = useState(false);
  const button = useRef<HTMLButtonElement>(null);

  return (
    <figure className="diagram">
      <div className="dg-frame">
        <div className="dg-scroll" onClick={() => setZoomed(true)}>
          <DiagramSvg spec={spec} />
        </div>
        <button ref={button} type="button" className="chip-btn dg-zoom" onClick={() => setZoomed(true)} aria-label="Zoom diagram">
          Zoom
        </button>
      </div>
      {caption && <figcaption>{caption}</figcaption>}
      {zoomed && (
        <DiagramViewer
          spec={spec}
          caption={caption}
          onClose={() => {
            setZoomed(false);
            button.current?.focus();
          }}
        />
      )}
    </figure>
  );
}
