import { NextResponse } from "next/server";
import { clearAll } from "../../../../lib/blob-index";
import { checkAdminPasscode } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request) {
  if (!checkAdminPasscode(request)) {
    return NextResponse.json({ error: "Invalid admin passcode" }, { status: 401 });
  }

  const entries = await clearAll();
  return NextResponse.json({ photos: entries });
}
