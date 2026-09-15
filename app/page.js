"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const POLL_MS = 5000;
const PASSCODE_STORAGE_KEY = "photo-wall-upload-passcode";

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

  // The wall always fills the whole screen: photos are arranged into rows
  // so that, together, they cover 100% of the viewport. 1 photo fills the
  // page (1:1), 2 photos split it exactly in half (1:2), 3 split it into
  // thirds (1:3) — and as more get added, they pack into more rows,
  // shrinking each photo further, all the way down toward 1px.
  useEffect(() => {
    function recompute() {
      const count = photos.length;
      if (count === 0) {
        setRowCounts([]);
        return;
      }
      const aspect = window.innerWidth / Math.max(window.innerHeight, 1);
      let rows = Math.round(Math.sqrt(count / aspect));
      rows = Math.max(1, Math.min(rows, count));
      const base = Math.floor(count / rows);
      const extra = count % rows;
      const counts = [];
      for (let i = 0; i < rows; i++) {
        counts.push(base + (i < extra ? 1 : 0));
      }
      setRowCounts(counts);
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
          display: "flex",
          flexDirection: "column",
          width: "100vw",
          height: "100vh",
        }}
      >
        {(() => {
          let idx = 0;
          return rowCounts.map((rowCount, rowIndex) => {
            const rowPhotos = photos.slice(idx, idx + rowCount);
            idx += rowCount;
            return (
              <div
                key={rowIndex}
                style={{
                  display: "flex",
                  flex: 1,
                  minHeight: 0,
                }}
              >
                {rowPhotos.map((photo) => (
                  <div
                    key={photo.id}
                    onClick={() => setSelectedId(photo.id)}
                    style={{
                      flex: 1,
                      minWidth: 0,
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
