import { put, list, del } from "@vercel/blob";

const INDEX_PATHNAME = "index.json";

/**
 * The index is a single small JSON blob listing every photo currently on
 * the wall. Reading/writing it is a simple read-modify-write, which is
 * fine at friends-and-family scale (not built for heavy concurrent
 * writes, but uploads are infrequent human actions).
 */

async function findIndexBlob() {
  const { blobs } = await list({ prefix: INDEX_PATHNAME, limit: 1 });
  return blobs.find((b) => b.pathname === INDEX_PATHNAME) || null;
}

export async function readIndex() {
  const existing = await findIndexBlob();
  if (!existing) return [];
  const res = await fetch(existing.url, { cache: "no-store" });
  if (!res.ok) return [];
  try {
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function writeIndex(entries) {
  await put(INDEX_PATHNAME, JSON.stringify(entries), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 0,
  });
}

export async function addPhoto(entry) {
  const entries = await readIndex();
  entries.push(entry);
  await writeIndex(entries);
  return entries;
}

export async function removePhoto(id) {
  const entries = await readIndex();
  const target = entries.find((e) => e.id === id);
  const remaining = entries.filter((e) => e.id !== id);
  if (target) {
    try {
      await del(target.url);
    } catch {
      // best-effort; still update the index even if the blob is already gone
    }
  }
  await writeIndex(remaining);
  return remaining;
}

export async function clearAll() {
  const entries = await readIndex();
  await Promise.all(
    entries.map((e) =>
      del(e.url).catch(() => {
        // best-effort
      })
    )
  );
  await writeIndex([]);
  return [];
}
