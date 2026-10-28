// app/api/resume/route.js
// Downloads one of your CVs: /api/resume?cv=backend
// Only keys listed in config/cvMapping.json work, so no other file can be
// requested.

import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { CV_CATEGORIES, DEFAULT_CV_KEY } from "../../../lib/cvs.js";

export async function GET(request) {
  const cv = new URL(request.url).searchParams.get("cv") || DEFAULT_CV_KEY;
  const fileName = Object.hasOwn(CV_CATEGORIES, cv)
    ? CV_CATEGORIES[cv].resumeFile
    : null;
  if (!fileName) {
    return NextResponse.json({ error: "Unknown CV" }, { status: 400 });
  }

  const filePath = path.join(process.cwd(), "resumes", fileName);
  if (!fs.existsSync(filePath)) {
    return NextResponse.json(
      { error: "Resume file not found" },
      { status: 404 },
    );
  }

  const data = fs.readFileSync(filePath);
  return new NextResponse(data, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
