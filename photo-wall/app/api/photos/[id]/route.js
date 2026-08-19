import { NextResponse } from "next/server";
import { removePhoto } from "../../../../lib/blob-index";
import { checkAdminPasscode } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

export async function DELETE(request, { params }) {
  if (!checkAdminPasscode(request)) {
    return NextResponse.json({ error: "Invalid admin passcode" }, { status: 401 });
  }

  const { id } = await params;
  const entries = await removePhoto(id);
  return NextResponse.json({ photos: entries });
}
