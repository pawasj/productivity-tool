import { NextRequest, NextResponse } from "next/server";
import { getValidGoogleToken } from "@/lib/google-token";

function markdownToDocRequests(markdown: string, brandName: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const requests: any[] = [];
  let index = 1; // Docs API uses 1-based index

  function insert(text: string) {
    requests.push({ insertText: { location: { index }, text } });
    index += text.length;
  }

  function formatRange(startIndex: number, endIndex: number, bold?: boolean, italic?: boolean, fontSize?: number, foregroundColor?: { red: number; green: number; blue: number }) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fields: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const textStyle: any = {};
    if (bold !== undefined) { textStyle.bold = bold; fields.push("bold"); }
    if (italic !== undefined) { textStyle.italic = italic; fields.push("italic"); }
    if (fontSize !== undefined) { textStyle.fontSize = { magnitude: fontSize, unit: "PT" }; fields.push("fontSize"); }
    if (foregroundColor) { textStyle.foregroundColor = { color: { rgbColor: foregroundColor } }; fields.push("foregroundColor"); }
    if (fields.length === 0) return;
    requests.push({ updateTextStyle: { range: { startIndex, endIndex }, textStyle, fields: fields.join(",") } });
  }

  function setParagraphStyle(startIndex: number, endIndex: number, namedStyleType: string) {
    requests.push({
      updateParagraphStyle: {
        range: { startIndex, endIndex },
        paragraphStyle: { namedStyleType },
        fields: "namedStyleType",
      },
    });
  }

  // Title
  const titleText = `${brandName} — Campaign Narrative\n`;
  insert(titleText);
  setParagraphStyle(1, index, "TITLE");

  // Date line
  const dateText = `Generated on ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}\n`;
  const dateStart = index;
  insert(dateText);
  formatRange(dateStart, index - 1, false, true, 10, { red: 0.4, green: 0.4, blue: 0.4 });

  insert("\n");

  const lines = markdown.split("\n");
  for (const raw of lines) {
    const line = raw.trimEnd();

    if (line.startsWith("### ")) {
      const text = line.replace(/^### /, "") + "\n";
      const s = index;
      insert(text);
      setParagraphStyle(s, index, "HEADING_3");
    } else if (line.startsWith("## ")) {
      const text = line.replace(/^## /, "") + "\n";
      const s = index;
      insert(text);
      setParagraphStyle(s, index, "HEADING_2");
    } else if (line.startsWith("# ")) {
      const text = line.replace(/^# /, "") + "\n";
      const s = index;
      insert(text);
      setParagraphStyle(s, index, "HEADING_1");
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      const text = line.replace(/^[-*] /, "") + "\n";
      const s = index;
      insert(text);
      requests.push({ createParagraphBullets: { range: { startIndex: s, endIndex: index }, bulletPreset: "BULLET_DISC_CIRCLE_SQUARE" } });
    } else if (line.trim() === "") {
      insert("\n");
    } else {
      // Inline bold: **text**
      const boldParts = line.split(/(\*\*[^*]+\*\*)/);
      const lineStart = index;
      let hasInlineBold = false;
      const boldRanges: Array<{ start: number; end: number }> = [];
      for (const part of boldParts) {
        if (part.startsWith("**") && part.endsWith("**")) {
          const inner = part.slice(2, -2);
          const s = index;
          insert(inner);
          boldRanges.push({ start: s, end: index });
          hasInlineBold = true;
        } else {
          insert(part);
        }
      }
      insert("\n");
      if (hasInlineBold) {
        for (const r of boldRanges) formatRange(r.start, r.end, true);
      }
      void lineStart;
    }
  }

  return requests;
}

export async function POST(req: NextRequest) {
  try {
    const tokenData = await getValidGoogleToken();
    if (!tokenData) {
      return NextResponse.json({ error: "Google account not connected. Please connect your Google account in Profile settings." }, { status: 401 });
    }
    const { access_token } = tokenData;

    const { brand_name, narrative } = await req.json() as { brand_name: string; narrative: string };

    const title = `${brand_name || "Campaign"} — Narrative ${new Date().toLocaleDateString("en-IN")}`;

    // Create blank document
    const createRes = await fetch("https://docs.googleapis.com/v1/documents", {
      method: "POST",
      headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!createRes.ok) throw new Error(`Docs API error: ${await createRes.text()}`);
    const doc = await createRes.json() as { documentId: string };
    const documentId = doc.documentId;

    // Build batch update requests from markdown
    const requests = markdownToDocRequests(narrative, brand_name || "Campaign");

    if (requests.length > 0) {
      await fetch(`https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ requests }),
      });
    }

    return NextResponse.json({ url: `https://docs.google.com/document/d/${documentId}/edit` });
  } catch (err) {
    console.error("export-google-doc error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
