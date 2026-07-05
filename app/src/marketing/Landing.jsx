// Landing — the full cinematic marketing site (ported 1:1 from index.html),
// mounted as a React island: markup + CSS are verbatim, effects.js drives it,
// cleanup on unmount keeps the console SPA untouched.
import { useEffect, useRef } from "react";
import { LANDING_HTML } from "./markup.js";
import { initLanding } from "./effects.js";
import "./landing.css";

export default function Landing({ onEnter }) {
  const ref = useRef(null);
  useEffect(() => {
    const cleanup = initLanding(ref.current, { onEnter });
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div className="mkt" ref={ref} dangerouslySetInnerHTML={{ __html: LANDING_HTML }} />;
}
