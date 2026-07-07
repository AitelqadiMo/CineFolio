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

export async function readPdf(file, maxPages = 6) {
  const pdfjs = window.pdfjsLib;
  if (!pdfjs) throw new Error("The reader is warming up. Give it a second and drop the resume again.");
  pdfjs.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  let text = "";
  for (let i = 1; i <= Math.min(doc.numPages, maxPages); i++) {
    const page = await doc.getPage(i);
    const tcn = await page.getTextContent();
    let last = null;
    for (const it of tcn.items) {
      if (last !== null && Math.abs(it.transform[5] - last) > 4) text += "\n";
      text += it.str + " ";
      last = it.transform[5];
    }
    text += "\n";
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
