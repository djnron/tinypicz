"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const POLL_MS = 5000;
const PASSCODE_STORAGE_KEY = "photo-wall-upload-passcode";

// How elongated a single photo may get before we'd rather leave a slot or
// two empty than render slivers. 2.5 means a photo never gets more than
// 2.5x wider than it is tall, or vice versa.
const MAX_SKEW = Math.log(2.5);

// Pick the grid for `count` photos, given that it must have at least
// `minSlots` cells. Every cell is the same size, so whatever this returns,
// all photos render identically.
function bestGrid(count, minSlots, vw, vh) {
  const need = Math.max(count, minSlots, 1);

  // Preferred: use every slot exactly, wasting no space.
  let exact = null;
  for (let rows = 1; rows <= need; rows++) {
    if (need % rows !== 0) continue;
    const cols = need / rows;
    const skew = Math.abs(Math.log(vw / cols / (vh / rows)));
    if (!exact || skew < exact.skew) exact = { rows, cols, skew };
  }
  if (exact && exact.skew <= MAX_SKEW) {
    return { cols: exact.cols, rows: exact.rows };
  }

  // Fallback for counts like 7 or 13, where an exact fit would mean very
  // thin photos: the best-shaped grid that still holds them all.
  let best = null;
  for (let rows = 1; rows <= need; rows++) {
    const cols = Math.ceil(need / rows);
    const cw = vw / cols;
    const ch = vh / rows;
    const score = (cw * ch) / (1 + Math.abs(Math.log(cw / ch)));
    if (!best || score > best.score) best = { rows, cols, score };
  }
  return { cols: best.cols, rows: best.rows };
}

// Walk up from 1 photo to `count`, never letting the grid give back slots.
// Without this, a count that happens to factor tidily (14 = 7x2) would make
// every photo grow compared to the count before it (13), which reads as a
// glitch: adding a photo should only ever take space away.
function computeGrid(count, vw, vh) {
  if (count <= 0) return { cols: 1, rows: 1 };
  let slots = 1;
  let chosen = { cols: 1, rows: 1 };
  for (let n = 1; n <= count; n++) {
    chosen = bestGrid(n, slots, vw, vh);
    slots = chosen.cols * chosen.rows;
  }
  return chosen;
}

export default function WallPage() {
  const [photos, setPhotos] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [grid, setGrid] = useState({ cols: 1, rows: 1 });
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
      setGrid(
        computeGrid(
          photos.length,
          window.innerWidth,
          Math.max(window.innerHeight, 1)
        )
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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${grid.cols}, 1fr)`,
          gridTemplateRows: `repeat(${grid.rows}, 1fr)`,
          width: "100vw",
          height: "100vh",
        }}
      >
        {/* A grid with all-equal cells can't always hold exactly as many
            photos as there are: 5 photos sit on a 3x2 wall, and the slot
            count never shrinks as photos arrive. Rather than leave those
            cells blank, fill them by cycling back through the photos. Every
            cell stays the same size, nothing gets elongated, and the wall is
            full at every count — a photo just appears twice until the next
            upload takes the slot for real. Cycling from the start keeps a
            repeat as far from its original as the reading order allows. */}
        {Array.from({ length: photos.length ? grid.cols * grid.rows : 0 }, (_, slot) => {
          const photo = photos[slot % photos.length];
          return (
          <div
            key={`${photo.id}-${slot}`}
            onClick={() => setSelectedId(photo.id)}
            style={{
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
          );
        })}
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
