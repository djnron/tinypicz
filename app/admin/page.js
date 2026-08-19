"use client";

import { useCallback, useEffect, useState } from "react";

const PASSCODE_STORAGE_KEY = "photo-wall-admin-passcode";

export default function AdminPage() {
  const [passcode, setPasscode] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(PASSCODE_STORAGE_KEY);
      if (stored) {
        setPasscode(stored);
        setUnlocked(true);
      }
    } catch {
      // ignore
    }
  }, []);

  const fetchPhotos = useCallback(async () => {
    const res = await fetch("/api/photos", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setPhotos(data.photos || []);
  }, []);

  useEffect(() => {
    if (unlocked) fetchPhotos();
  }, [unlocked, fetchPhotos]);

  function handleUnlock(e) {
    e.preventDefault();
    setUnlocked(true);
    try {
      sessionStorage.setItem(PASSCODE_STORAGE_KEY, passcode);
    } catch {
      // ignore
    }
  }

  async function handleDelete(id) {
    setBusyId(id);
    setError("");
    try {
      const res = await fetch(`/api/photos/${id}`, {
        method: "DELETE",
        headers: { "x-admin-passcode": passcode },
      });
      if (res.status === 401) {
        setUnlocked(false);
        setError("Admin passcode was rejected. Enter it again.");
        return;
      }
      if (!res.ok) {
        setError("Could not delete that photo.");
        return;
      }
      await fetchPhotos();
    } finally {
      setBusyId(null);
    }
  }

  async function handleClearAll() {
    if (!window.confirm("Remove every photo from the wall? This can't be undone.")) return;
    setClearing(true);
    setError("");
    try {
      const res = await fetch("/api/admin/clear", {
        method: "POST",
        headers: { "x-admin-passcode": passcode },
      });
      if (res.status === 401) {
        setUnlocked(false);
        setError("Admin passcode was rejected. Enter it again.");
        return;
      }
      if (!res.ok) {
        setError("Could not clear the wall.");
        return;
      }
      await fetchPhotos();
    } finally {
      setClearing(false);
    }
  }

  if (!unlocked) {
    return (
      <main style={{ maxWidth: 360, margin: "80px auto", padding: 24 }}>
        <h1 style={{ fontSize: 20, marginBottom: 16 }}>Admin</h1>
        <form onSubmit={handleUnlock}>
          <input
            type="password"
            placeholder="Admin passcode"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            style={{
              width: "100%",
              padding: 10,
              borderRadius: 6,
              border: "1px solid #444",
              background: "#1a1a1c",
              color: "#fff",
              marginBottom: 12,
            }}
          />
          <button
            type="submit"
            style={{
              width: "100%",
              padding: 10,
              borderRadius: 6,
              border: "none",
              background: "#fff",
              color: "#111",
              cursor: "pointer",
            }}
          >
            Enter
          </button>
        </form>
        {error && <p style={{ color: "#e74c3c", marginTop: 12 }}>{error}</p>}
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ fontSize: 20 }}>Admin — {photos.length} photo{photos.length === 1 ? "" : "s"}</h1>
        <button
          onClick={handleClearAll}
          disabled={clearing || photos.length === 0}
          style={{
            padding: "8px 14px",
            borderRadius: 6,
            border: "1px solid #c0392b",
            background: "transparent",
            color: "#e74c3c",
            cursor: photos.length === 0 ? "default" : "pointer",
          }}
        >
          {clearing ? "Clearing…" : "Clear entire wall"}
        </button>
      </div>

      {error && <p style={{ color: "#e74c3c", marginBottom: 12 }}>{error}</p>}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
          gap: 12,
        }}
      >
        {photos.map((photo) => (
          <div key={photo.id} style={{ position: "relative" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.url}
              alt=""
              style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover", borderRadius: 6, display: "block" }}
            />
            <button
              onClick={() => handleDelete(photo.id)}
              disabled={busyId === photo.id}
              style={{
                position: "absolute",
                top: 6,
                right: 6,
                border: "none",
                borderRadius: 4,
                background: "rgba(0,0,0,0.7)",
                color: "#fff",
                padding: "4px 8px",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {busyId === photo.id ? "…" : "Delete"}
            </button>
          </div>
        ))}
      </div>

      {photos.length === 0 && <p style={{ color: "#888" }}>No photos on the wall.</p>}
    </main>
  );
}
