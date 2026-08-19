import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { readIndex, addPhoto } from "../../../lib/blob-index";
import { checkUploadPasscode } from "../../../lib/auth";

export const dynamic = "force-dynamic";

const MAX_BYTES = 15 * 1024 * 1024; // 15MB per photo
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic"]);

export async function GET() {
  const entries = await readIndex();
  // newest first
  entries.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  return NextResponse.json({ photos: entries });
}

export async function POST(request) {
  if (!checkUploadPasscode(request)) {
    return NextResponse.json({ error: "Invalid passcode" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("photo");

  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "No photo provided" }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Photo is too large (15MB max)" }, { status: 400 });
  }

  if (file.type && !ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
  }

  const id = crypto.randomUUID();
  const ext = (file.name && file.name.includes(".")) ? file.name.split(".").pop().slice(0, 8) : "jpg";
  const pathname = `photos/${id}.${ext}`;

  const blob = await put(pathname, file, {
    access: "public",
    contentType: file.type || "image/jpeg",
    addRandomSuffix: false,
  });

  const entry = {
    id,
    url: blob.url,
    uploadedAt: new Date().toISOString(),
  };

  const entries = await addPhoto(entry);

  return NextResponse.json({ photo: entry, count: entries.length }, { status: 201 });
}
