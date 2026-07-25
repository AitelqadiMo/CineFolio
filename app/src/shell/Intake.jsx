// Intake.jsx: the shared pieces of the asset-first composers. One chip row
// used by the Dashboard composer and the film workspace change order, so an
// attached asset looks and behaves the same everywhere.

export default function AssetChips({ intake }) {
  const { resume, photo, covers, removeResume, removePhoto, removeCover, photoToCover, coverToPhoto } = intake;
  if (!resume && !photo && !covers.length) return null;
  return (
    <div className="bkassets">
      {resume && (
        <span
          className={`bkasset ${resume.status === "unread" ? "error" : ""}`}
          title={resume.status === "unread"
            ? "We couldn't read this file. Remove it and drop a text-based PDF or TXT, or just type into the note; a resume isn't required to start."
            : undefined}
        >
          <span className="glyph" aria-hidden="true">▤</span>
          <span className="name">{resume.name}</span>
          <span className="tag" style={{ cursor: "default", ...(resume.status === "unread" ? { color: "var(--bk-red)" } : {}) }} aria-hidden={resume.status === "unread" ? undefined : true}>
            {resume.status === "reading" ? "Reading…" : resume.status === "read" ? "Resume ✓" : "Can't read"}
          </span>
          <button className="rm" aria-label={resume.status === "unread" ? `Remove ${resume.name} and try another file` : `Remove ${resume.name}`} onClick={removeResume}>✕</button>
        </span>
      )}
      {photo && (
        <span className="bkasset">
          <img className="thumb" src={photo.url} alt="" />
          <span className="name">{photo.name}</span>
          <button className="tag" title="Use as a project cover instead" onClick={photoToCover}>Headshot</button>
          <button className="rm" aria-label={`Remove ${photo.name}`} onClick={removePhoto}>✕</button>
        </span>
      )}
      {covers.map((c, i) => (
        <span className="bkasset" key={`${c.url}-${i}`}>
          <img className="thumb" src={c.url} alt="" />
          <span className="name">{c.name}</span>
          <button className="tag" title="Use as the headshot instead" disabled={!!photo} onClick={() => coverToPhoto(i)}>Cover {i + 1}</button>
          <button className="rm" aria-label={`Remove ${c.name}`} onClick={() => removeCover(i)}>✕</button>
        </span>
      ))}
    </div>
  );
}
