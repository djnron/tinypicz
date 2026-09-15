"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const POLL_MS = 5000;
const PASSCODE_STORAGE_KEY = "photo-wall-upload-passcode";

// The wall is a fixed amount of space — one screen — divided evenly among
// however many photos are on it. Every photo gets exactly 1/N of the screen,
// so each new upload takes a share away from everyone already there: 1 photo
// fills the page, 2 get half each, 3 a third, and on down toward a pixel.
//
// A single uniform grid can't do that. Its cells come in whole rows and
// columns, so the size only changes when the photo count crosses a
// factorization — 5 and 6 photos would render identically, and so would 13,
// 14 and 15. Sizes would sit still for uploads at a time, and awkward counts
// would leave holes.
//
// Rows of differing heights can. Give a row holding k of the N photos a
// height of k/N of the screen, and each photo in it 1/k of the width: every
// photo comes out at (1/k) x (k/N) = 1/N of the screen, whatever k is. The
// rows tile the page exactly, so there is nothing left blank and nothing has
// to be repeated to fill space.
//
// That leaves only the shape of each photo to choose, which is what the row
// split decides: spreading N photos over more rows makes them wider and
// shorter, fewer rows makes them narrower and taller.
//
// Splits where every row holds the same number of photos are worth more than
// their shape alone: they make every photo identical in both dimensions, not
// merely equal in area — 14 photos as [7,7] is a 7x2 grid. So take the
// best-shaped even split whenever it is not badly out of shape, and only when
// there is none (5, 7, 11, 13 and the other counts that don't factor) settle
// for uneven rows, which still hold the areas exactly equal.
const MAX_GRID_SKEW = Math.log(2.5);

function rowsFor(count, vw, vh) {
  let best = null;
  let bestEven = null;

  for (let rows = 1; rows <= count; rows++) {
    const base = Math.floor(count / rows);
    const extra = count % rows;
    const counts = [];
    for (let i = 0; i < rows; i++) counts.push(base + (i < extra ? 1 : 0));

    // How far from square this split leaves its worst photo, and (to break
    // ties between splits) how far from square it leaves the wall overall.
    let worst = 0;
    let overall = 0;
    for (const k of counts) {
      const skew = Math.abs(Math.log(vw / k / ((vh * k) / count)));
      worst = Math.max(worst, skew);
      overall += skew * k;
    }

    const candidate = { counts, worst, overall };
    const better = (a, b) =>
      !b || a.worst < b.worst - 1e-9 || (Math.abs(a.worst - b.worst) < 1e-9 && a.overall < b.overall);

    if (better(candidate, best)) best = candidate;
    if (extra === 0 && better(candidate, bestEven)) bestEven = candidate;
  }

  return bestEven && bestEven.worst <= MAX_GRID_SKEW ? bestEven.counts : best.counts;
}

export default function WallPage() {
  const [photos, setPhotos] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [rowCounts, setRowCounts] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  const fetchPhotos = useCallback(async () => {
    try {
      const res = await fetch("/api/photos", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setPhotos(data.photos || []);
    } catch {
      // ignore transient network errors, next poll will retry
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    fetchPhotos();
    const interval = setInterval(fetchPhotos, POLL_MS);
    return () => clearInterval(interval);
  }, [fetchPhotos]);

  useEffect(() => {
    function recompute() {
      setRowCounts(
        photos.length
          ? rowsFor(photos.length, window.innerWidth, Math.max(window.innerHeight, 1))
          : []
      );
    }
    recompute();
    window.addEventListener("resize", recompute);
    return () => window.removeEventListener("resize", recompute);
  }, [photos.length]);

  function getStoredPasscode() {
    try {
      return sessionStorage.getItem(PASSCODE_STORAGE_KEY) || "";
    } catch {
      return "";
    }
  }

  function storePasscode(value) {
    try {
      sessionStorage.setItem(PASSCODE_STORAGE_KEY, value);
    } catch {
      // ignore
    }
  }

  async function handleFileChosen(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;

    let passcode = getStoredPasscode();
    if (!passcode) {
      passcode = window.prompt("Enter the passcode to upload a photo:") || "";
      if (!passcode) return;
      storePasscode(passcode);
    }

    setUploading(true);
    setError("");

    const formData = new FormData();
    formData.append("photo", file);

    try {
      const res = await fetch("/api/photos", {
        method: "POST",
        headers: { "x-upload-passcode": passcode },
        body: formData,
      });

      if (res.status === 401) {
        storePasscode("");
        setError("Wrong passcode. Try uploading again.");
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Upload failed. Try again.");
        return;
      }

      await fetchPhotos();
    } catch {
      setError("Upload failed. Check your connection and try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", position: "relative" }}>
      {photos.length === 0 && loaded && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: 12,
            padding: 24,
            textAlign: "center",
            color: "#888",
          }}
        >
          <div style={{ fontSize: 20 }}>The wall is empty.</div>
          <div style={{ fontSize: 14 }}>Be the first to add a photo.</div>
        </div>
      )}

      <div style={{ width: "100vw", height: "100vh" }}>
        {(() => {
          let taken = 0;
          return rowCounts.map((rowCount, rowIndex) => {
            const rowPhotos = photos.slice(taken, taken + rowCount);
            taken += rowCount;
            return (
              <div
                key={rowIndex}
                style={{
                  display: "flex",
                  // The row's share of the screen is its share of the photos,
                  // which is what makes every photo the same size.
                  height: `${(rowCount / photos.length) * 100}%`,
                }}
              >
                {rowPhotos.map((photo) => (
                  <div
                    key={photo.id}
                    onClick={() => setSelectedId(photo.id)}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      minHeight: 0,
                      overflow: "hidden",
                      position: "relative",
                      background: "#1a1a1c",
                      cursor: "pointer",
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.url}
                      alt=""
                      loading="lazy"
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        display: "block",
                      }}
                    />
                  </div>
                ))}
              </div>
            );
          });
        })()}
      </div>

      {selectedId &&
        (() => {
          const photo = photos.find((p) => p.id === selectedId);
          if (!photo) return null;
          return (
            <div
              onClick={() => setSelectedId(null)}
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.85)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1000,
                cursor: "pointer",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url}
                alt=""
                style={{
                  maxWidth: "92vw",
                  maxHeight: "92vh",
                  objectFit: "contain",
                  boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
                }}
              />
            </div>
          );
        })()}

      <button
        onClick={() => fileInputRef.current && fileInputRef.current.click()}
        disabled={uploading}
        aria-label="Add a photo"
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          width: 56,
          height: 56,
          borderRadius: "50%",
          border: "none",
          background: uploading ? "#555" : "#fff",
          color: "#111",
          fontSize: 28,
          lineHeight: "56px",
          textAlign: "center",
          cursor: uploading ? "default" : "pointer",
          boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
          zIndex: 1100,
        }}
      >
        {uploading ? "…" : "+"}
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChosen}
        style={{ display: "none" }}
      />

      {error && (
        <div
          style={{
            position: "fixed",
            bottom: 92,
            right: 24,
            background: "#c0392b",
            color: "#fff",
            padding: "10px 14px",
            borderRadius: 8,
            fontSize: 14,
            maxWidth: 260,
            zIndex: 1100,
          }}
        >
          {error}
        </div>
      )}
    </main>
  );
}
