import { NextRequest, NextResponse } from "next/server";
import { getValidGoogleToken } from "@/lib/google-token";

export async function POST(req: NextRequest) {
  try {
    const tokenData = await getValidGoogleToken();
    if (!tokenData) {
      return NextResponse.json({ error: "Google account not connected. Please connect your Google account in Profile settings." }, { status: 401 });
    }
    const { access_token } = tokenData;

    const { brand_name, rows, margin, num_pages, num_deliverables } = await req.json() as {
      brand_name: string;
      margin: number;
      num_pages?: string | number;
      num_deliverables?: string | number;
      campaign_objective?: string;
      rows: Array<{
        handle_name: string; channel_link?: string; platform: string; category: string; followers: string;
        deliverable_type: string; quantity: number; rate: number; total_cost: number;
        client_rate: number; client_total: number;
      }>;
    };

    const title = `${brand_name || "Media Plan"} — Media Plan ${new Date().toLocaleDateString("en-IN")}`;

    // Create spreadsheet via Sheets API
    const createRes = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
      method: "POST",
      headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ properties: { title } }),
    });
    if (!createRes.ok) throw new Error(`Sheets API error: ${await createRes.text()}`);
    const sheet = await createRes.json() as { spreadsheetId: string; spreadsheetUrl: string };
    const spreadsheetId = sheet.spreadsheetId;

    // Plan facts: prefer the brief's numbers, fall back to what's in the plan
    const uniquePages = new Set(rows.map(r => (r.handle_name || "").toLowerCase().trim())).size;
    const totalDeliverables = rows.reduce((s, r) => s + (Number(r.quantity) || 1), 0);
    const pagesVal = Number(num_pages) || uniquePages;
    const deliverablesVal = Number(num_deliverables) || totalDeliverables;

    // ── Client-facing summary block ─────────────────────────────────────────
    const summaryRows: (string | number)[][] = [
      [`${brand_name || "Campaign"} — Media Plan`],
      [`Prepared by BCC Media Network · ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}`],
      [],
      ["Client", brand_name || "—"],
      ["Number of Pages / Handles", pagesVal],
      ["Total Deliverables", deliverablesVal],
      ["Expected Reach", ""],   // intentionally blank — filled in by the team
      [],
    ];
    const headerRowIndex = summaryRows.length; // 0-based index of the table header row

    const header = [
      "Handle / Page", "Channel Link", "Platform", "Category", "Followers",
      "Deliverable", "Qty", "Agency Rate (₹)", "Agency Total (₹)",
      `Client Rate (₹) +${margin}%`, `Client Total (₹) +${margin}%`,
    ];
    const dataRows = rows.map(r => [
      r.handle_name, r.channel_link || "", r.platform, r.category, r.followers,
      r.deliverable_type, r.quantity, r.rate, r.total_cost,
      r.client_rate, r.client_total,
    ]);
    const totalsRow = [
      "TOTAL", "", "", "", "", "", "",
      "", rows.reduce((s, r) => s + (r.total_cost || 0), 0),
      "", rows.reduce((s, r) => s + (r.client_total || 0), 0),
    ];

    const values = [...summaryRows, header, ...dataRows, totalsRow];

    // Write data
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1?valueInputOption=USER_ENTERED`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values }),
    });

    // Format
    const lastRow = values.length;
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          // Big title
          { repeatCell: { range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 16 } } }, fields: "userEnteredFormat.textFormat" } },
          // Subtitle grey italic
          { repeatCell: { range: { sheetId: 0, startRowIndex: 1, endRowIndex: 2 }, cell: { userEnteredFormat: { textFormat: { italic: true, fontSize: 9, foregroundColor: { red: 0.45, green: 0.45, blue: 0.45 } } } }, fields: "userEnteredFormat.textFormat" } },
          // Summary labels bold (col A, rows 4-7)
          { repeatCell: { range: { sheetId: 0, startRowIndex: 3, endRowIndex: 7, startColumnIndex: 0, endColumnIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: "userEnteredFormat.textFormat" } },
          // Summary block light background
          { repeatCell: { range: { sheetId: 0, startRowIndex: 3, endRowIndex: 7, startColumnIndex: 0, endColumnIndex: 2 }, cell: { userEnteredFormat: { backgroundColor: { red: 0.95, green: 0.96, blue: 1 } } }, fields: "userEnteredFormat.backgroundColor" } },
          // Table header: blue bg, white bold text
          { repeatCell: { range: { sheetId: 0, startRowIndex: headerRowIndex, endRowIndex: headerRowIndex + 1 }, cell: { userEnteredFormat: { textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }, backgroundColor: { red: 0.18, green: 0.40, blue: 0.93 } } }, fields: "userEnteredFormat(textFormat,backgroundColor)" } },
          // Bold totals row
          { repeatCell: { range: { sheetId: 0, startRowIndex: lastRow - 1, endRowIndex: lastRow }, cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.95, green: 0.95, blue: 0.95 } } }, fields: "userEnteredFormat(textFormat,backgroundColor)" } },
          // Freeze everything through the table header
          { updateSheetProperties: { properties: { sheetId: 0, gridProperties: { frozenRowCount: headerRowIndex + 1 } }, fields: "gridProperties.frozenRowCount" } },
          // Auto-resize columns
          { autoResizeDimensions: { dimensions: { sheetId: 0, dimension: "COLUMNS", startIndex: 0, endIndex: 11 } } },
        ],
      }),
    });

    return NextResponse.json({ url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit` });
  } catch (err) {
    console.error("export-google-sheet error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
