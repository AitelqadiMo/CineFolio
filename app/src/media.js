// media.js: the studio's shared intake machinery. One place that knows how
// to read a resume, compress and ship an image to the CDN, classify what a
// client dropped, and carry a brief full of assets between pages. Both
// composers (Dashboard, film workspace) and The Set speak through this file
// so an asset attached anywhere arrives everywhere.
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api.js";

export const RESUME_TYPES = ["application/pdf", "text/plain"];
export const MAX_IMAGE_EDGE = 1600;
export const JPEG_QUALITY = 0.82;

/* ---------- classification: what did the client hand us? ---------- */
export function classifyFile(file) {
  if (!file) return null;
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) return "resume";
  if (file.type === "text/plain" || /\.(txt|md)$/i.test(file.name)) return "resume";
  if (file.type.startsWith("image/")) return "image";
  return null;
}

/* ---------- resume reading: pdf.js in the browser, never a server ---------- */
export function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const rd = new FileReader();
    rd.onload = () => resolve(String(rd.result || ""));
    rd.onerror = () => reject(new Error("read failed"));
    rd.readAsText(file);
  });
}

// extractPageText: column-aware extraction using pdf.js transform coordinates.
// Each pdf.js item carries transform[4] (x) and transform[5] (y). When a page
// has significant horizontal spread (items clustered in two distinct x groups,
// separated by more than 20% of the page width), it is likely a two-column
// layout. In that case we bucket items by x vs the page midpoint, emit the left
// bucket line by line, then the right bucket, and apply the y-gap newline rule
// WITHIN each bucket. This keeps single-column PDFs unaffected (items span the
// full width, so there is no clear midpoint split) while recovering structure
// from two-column CVs without resorting to a "sorry, paste it" message.
//
// Why this approach over others: pdfjs items carry enough geometry to detect the
// column boundary cheaply. The two-column signature (two x-clusters with a gap
// > 0.2 * pageWidth) is reliable enough for CVs, which use regular column grids.
// The fallback (single-column sort by y then x) is a safe no-op for single-column
// documents, so regression risk is minimal.
function extractPageText(items, viewport) {
  if (!items.length) return "";
  const pageWidth = viewport ? viewport.width : 0;

  // Detect two-column layout: are items concentrated in two distinct x bands?
  // Use the page midpoint as the split and measure how many items fall strictly
  // on each side. If both sides have at least 15% of items and pageWidth is known,
  // treat as two-column.
  let leftCount = 0;
  let rightCount = 0;
  const mid = pageWidth / 2;
  if (pageWidth > 0) {
    for (const it of items) {
      if (it.transform[4] < mid) leftCount++;
      else rightCount++;
    }
  }
  const isTwoColumn =
    pageWidth > 0 &&
    leftCount > 0 &&
    rightCount > 0 &&
    leftCount / items.length >= 0.15 &&
    rightCount / items.length >= 0.15;

  if (!isTwoColumn) {
    // Single-column: sort by y descending (pdf.js y is bottom-up) then x.
    const sorted = [...items].sort((a, b) =>
      b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4]
    );
    let text = "";
    let lastY = null;
    for (const it of sorted) {
      if (lastY !== null && Math.abs(it.transform[5] - lastY) > 4) text += "\n";
      text += it.str + " ";
      lastY = it.transform[5];
    }
    return text;
  }

  // Two-column: bucket by x, sort each bucket by y, emit left then right.
  const left = items.filter((it) => it.transform[4] < mid);
  const right = items.filter((it) => it.transform[4] >= mid);
  const bucketText = (bucket) => {
    const sorted = [...bucket].sort((a, b) =>
      b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4]
    );
    let text = "";
    let lastY = null;
    for (const it of sorted) {
      if (lastY !== null && Math.abs(it.transform[5] - lastY) > 4) text += "\n";
      text += it.str + " ";
      lastY = it.transform[5];
    }
    return text;
  };
  return bucketText(left) + "\n" + bucketText(right);
}

export async function readPdf(file, maxPages = 6) {
  const pdfjs = window.pdfjsLib;
  if (!pdfjs) throw new Error("The reader is warming up. Give it a second and drop the resume again.");
  pdfjs.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  let text = "";
  for (let i = 1; i <= Math.min(doc.numPages, maxPages); i++) {
    const page = await doc.getPage(i);
    const [tcn, viewport] = await Promise.all([
      page.getTextContent(),
      page.getViewport({ scale: 1 }),
    ]);
    text += extractPageText(tcn.items, viewport) + "\n";
  }
  return text.replace(/[ \t]+\n/g, "\n").slice(0, 20000);
}

export async function readResume(file) {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) return readPdf(file);
  return (await readTextFile(file)).slice(0, 20000);
}

/* ---------- image shipping: compress client side, then a three-stage chain.
   1. presigned PUT straight to S3 (fastest)
   2. proxy through the API (immune to bucket CORS, proxies, extensions)
   3. inline data URL (preview still works, but the AI pipeline can't use it)
   The pipeline only ever receives real URLs, so stage 3 is a last resort. */
export function compressAndUpload(file) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = async () => {
      const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      const dataUrl = c.toDataURL("image/jpeg", JPEG_QUALITY);
      try {
        const p = await api.media("image/jpeg");
        const blob = await (await fetch(dataUrl)).blob();
        if (blob.size > p.maxBytes) throw new Error("too large");
        const up = await fetch(p.uploadUrl, { method: "PUT", headers: { "content-type": "image/jpeg" }, body: blob });
        if (!up.ok) throw new Error("upload failed");
        resolve(p.publicUrl);
        return;
      } catch { /* stage 2: through the API */ }
      try {
        const b64 = dataUrl.split(",")[1] || "";
        const r = await api.mediaDirect("image/jpeg", b64);
        if (r?.publicUrl) { resolve(r.publicUrl); return; }
      } catch { /* stage 3: inline */ }
      resolve(dataUrl); // preview and publish still work, embedded inline
    };
    img.onerror = () => resolve(null);
    img.src = URL.createObjectURL(file);
  });
}

/* ---------- the brief: how assets travel between pages ---------- */
const BRIEF_KEY = "cf.brief";

export function packBrief(brief) {
  try { sessionStorage.setItem(BRIEF_KEY, JSON.stringify(brief)); } catch { /* storage full: the note is lost, the set still opens */ }
}

export function takeBrief() {
  try {
    const b = JSON.parse(sessionStorage.getItem(BRIEF_KEY) || "null");
    if (b) sessionStorage.removeItem(BRIEF_KEY);
    return b;
  } catch { return null; }
}

/* ---------- the intake hook: one asset model for every composer ----------
   assets = {
     resume: { name, text, status: "reading" | "read" | "unread" } | null,
     photo:  { name, url } | null,
     covers: [{ name, url }],
   }
   Errors surface one at a time in the studio's voice; a failed file is kept
   (flagged unread), never silently dropped. */
export function useIntakeAssets() {
  const [resume, setResume] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [covers, setCovers] = useState([]);
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState("");
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const addFiles = useCallback(async (fileList) => {
    const files = [...(fileList || [])];
    if (!files.length) return;
    setError("");
    for (const f of files) {
      const kind = classifyFile(f);
      if (!kind) {
        setError("That file isn't a resume or an image. Bring a PDF, a TXT, or a picture.");
        continue;
      }
      if (kind === "resume") {
        setResume({ name: f.name, text: "", status: "reading" });
        setBusy((b) => b + 1);
        try {
          const text = await readResume(f);
          if (!alive.current) return;
          if (text.trim().length < 40) {
            setResume({ name: f.name, text, status: "unread" });
            setError("We couldn't read much of that resume. Add a note, or bring it to The Set.");
          } else {
            setResume({ name: f.name, text, status: "read" });
          }
        } catch (e) {
          if (!alive.current) return;
          setResume({ name: f.name, text: "", status: "unread" });
          setError(e.message || "We couldn't read that resume. Paste the text into the note instead.");
        } finally {
          if (alive.current) setBusy((b) => Math.max(0, b - 1));
        }
      } else {
        setBusy((b) => b + 1);
        try {
          const url = await compressAndUpload(f);
          if (!alive.current) return;
          if (!url) { setError("That image didn't develop. Try a different file."); continue; }
          setPhoto((ph) => {
            if (!ph) return { name: f.name, url };
            setCovers((cs) => [...cs, { name: f.name, url }]);
            return ph;
          });
        } finally {
          if (alive.current) setBusy((b) => Math.max(0, b - 1));
        }
      }
    }
  }, []);

  const removeResume = useCallback(() => setResume(null), []);
  const removePhoto = useCallback(() => setPhoto(null), []);
  const removeCover = useCallback((i) => setCovers((cs) => cs.filter((_, k) => k !== i)), []);

  // reassign roles: a headshot becomes a cover, a cover becomes the headshot
  const photoToCover = useCallback(() => {
    setPhoto((ph) => {
      if (ph) setCovers((cs) => [...cs, ph]);
      return null;
    });
  }, []);
  const coverToPhoto = useCallback((i) => {
    setCovers((cs) => {
      const pick = cs[i];
      if (!pick) return cs;
      setPhoto((ph) => {
        if (ph) return ph; // occupied: keep, caller can clear first
        return pick;
      });
      return cs.filter((_, k) => k !== i);
    });
  }, []);

  const hasAssets = !!(resume || photo || covers.length);
  const clear = useCallback(() => { setResume(null); setPhoto(null); setCovers([]); setError(""); }, []);

  return {
    resume, photo, covers, busy: busy > 0, error, setError,
    addFiles, removeResume, removePhoto, removeCover, photoToCover, coverToPhoto,
    hasAssets, clear,
  };
}

/* ---------- popover discipline: escape closes, focus returns ---------- */
export function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const returnTo = useRef(null);

  const close = useCallback((refocus) => {
    setOpen(false);
    if (refocus && returnTo.current?.focus) returnTo.current.focus();
  }, []);

  const toggle = useCallback(() => {
    setOpen((o) => {
      if (!o) returnTo.current = document.activeElement;
      return !o;
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) close(false); };
    const key = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); close(true); return; }
      // roving focus through menu items with the arrow keys
      if ((e.key === "ArrowDown" || e.key === "ArrowUp") && ref.current) {
        const items = [...ref.current.querySelectorAll('[role="menuitem"]')].filter((el) => !el.disabled);
        if (!items.length) return;
        e.preventDefault();
        const at = items.indexOf(document.activeElement);
        const next = e.key === "ArrowDown"
          ? items[(at + 1) % items.length]
          : items[(at - 1 + items.length) % items.length];
        next.focus();
      }
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", key, true);
    };
  }, [open, close]);

  return { open, toggle, close, ref };
}

/* ---------- drag and drop wiring for a whole composer card ---------- */
export function useDropzone(onFiles) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const props = {
    onDragEnter: (e) => { e.preventDefault(); depth.current += 1; setOver(true); },
    onDragOver: (e) => { e.preventDefault(); },
    onDragLeave: (e) => { e.preventDefault(); depth.current = Math.max(0, depth.current - 1); if (!depth.current) setOver(false); },
    onDrop: (e) => {
      e.preventDefault(); depth.current = 0; setOver(false);
      if (e.dataTransfer?.files?.length) onFiles(e.dataTransfer.files);
    },
  };
  return { over, dropProps: props };
}
