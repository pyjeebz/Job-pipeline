// app/api/kit/route.js
// Returns config/applyKit.json for the dashboard's Apply kit. The file is
// read on every request, so edits show up on the next refresh.

import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { cvLabels, DEFAULT_CV_KEY } from "../../../lib/cvs.js";

// Read the file on every request, so edits show without a rebuild.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const file = path.join(process.cwd(), "config", "applyKit.json");
    const kit = JSON.parse(fs.readFileSync(file, "utf-8"));
    return NextResponse.json({
      success: true,
      kit: { ...kit, cvLabels: cvLabels(), defaultCv: DEFAULT_CV_KEY },
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}
