import { NextRequest, NextResponse } from "next/server";
import { getValidGoogleToken } from "@/lib/google-token";

export async function POST(req: NextRequest) {
  try {
    const tokenData = await getValidGoogleToken();
    if (!tokenData) {
      return NextResponse.json({ error: "Google account not connected. Please connect your Google account in Profile settings." }, { status: 401 });
    }
    const { access_token } = tokenData;

    const { brand_name, rows, margin } = await req.json() as {
      brand_name: string;
      margin: number;
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

    // Build rows: header + data + totals
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

    const values = [header, ...dataRows, totalsRow];

    // Write data
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1?valueInputOption=USER_ENTERED`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values }),
    });

    // Format: bold header, bold totals, freeze row 1
    const lastRow = values.length;
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          // Bold header row
          { repeatCell: { range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.18, green: 0.40, blue: 0.93 } } }, fields: "userEnteredFormat(textFormat,backgroundColor)" } },
          // White text on header
          { repeatCell: { range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } } } }, fields: "userEnteredFormat.textFormat" } },
          // Bold totals row
          { repeatCell: { range: { sheetId: 0, startRowIndex: lastRow - 1, endRowIndex: lastRow }, cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.95, green: 0.95, blue: 0.95 } } }, fields: "userEnteredFormat(textFormat,backgroundColor)" } },
          // Freeze header
          { updateSheetProperties: { properties: { sheetId: 0, gridProperties: { frozenRowCount: 1 } }, fields: "gridProperties.frozenRowCount" } },
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
