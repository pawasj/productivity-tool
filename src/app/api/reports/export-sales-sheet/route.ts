import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getValidGoogleToken } from "@/lib/google-token";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tokenData = await getValidGoogleToken();
    if (!tokenData) return NextResponse.json({ error: "Google account not connected. Please connect in Settings." }, { status: 401 });

    const { month, monthLabel, rows, totalRevenue, totalMRR } = await req.json() as {
      month: string; monthLabel: string;
      rows: Record<string, string | number>[];
      totalRevenue: number; totalMRR: number;
    };

    function fmt(n: number) { if (!n) return "₹0"; if (n >= 1e7) return `₹${(n/1e7).toFixed(1)}Cr`; if (n >= 1e5) return `₹${(n/1e5).toFixed(1)}L`; return `₹${n.toLocaleString("en-IN")}`; }

    const headers = rows.length > 0 ? Object.keys(rows[0]) : ["Company", "Contact", "Vertical", "POC", "Type", "Revenue (₹)", "Month"];
    const numCols = headers.length;

    // Create spreadsheet
    const createRes = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenData.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ properties: { title: `Sales Report — ${monthLabel}` }, sheets: [{ properties: { title: "Sales Report" } }] }),
    });
    if (!createRes.ok) {
      const err = await createRes.json();
      return NextResponse.json({ error: `Sheets API error: ${JSON.stringify(err)}` }, { status: 500 });
    }
    const sheet = await createRes.json();
    const spreadsheetId = sheet.spreadsheetId;
    const sheetId = sheet.sheets[0].properties.sheetId;

    // Build rows: summary header, blank, column headers, data, blank, totals
    const summaryRow = [`BCC Media Network — Sales Report: ${monthLabel}`];
    const metaRow = [`Total Revenue: ${fmt(totalRevenue)}`, `MRR: ${fmt(totalMRR)}`, `Deals: ${rows.length}`];
    const blankRow: string[] = [];
    const headerRow = headers;
    const dataRows = rows.map(r => headers.map(h => r[h] ?? ""));
    const totalsRow = headers.map((h, i) => i === 0 ? "TOTAL" : (h === "Revenue (₹)" ? totalRevenue : ""));

    const allRows = [summaryRow, metaRow, blankRow, headerRow, ...dataRows, blankRow, totalsRow];

    const valuesRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sales%20Report!A1?valueInputOption=USER_ENTERED`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${tokenData.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ range: "Sales Report!A1", majorDimension: "ROWS", values: allRows }),
      }
    );
    if (!valuesRes.ok) {
      const err = await valuesRes.json();
      return NextResponse.json({ error: `Values error: ${JSON.stringify(err)}` }, { status: 500 });
    }

    // Formatting requests
    const headerRowIdx = 3; // 0-indexed: summary=0, meta=1, blank=2, header=3
    const totalsRowIdx = 4 + rows.length + 1;

    const fmtRequests = [
      // Freeze first 4 rows and col A
      { updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 4, frozenColumnCount: 1 } }, fields: "gridProperties.frozenRowCount,gridProperties.frozenColumnCount" } },
      // Title row bold, large
      { repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: numCols }, cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 14 }, backgroundColor: { red: 0.067, green: 0.227, blue: 0.42 } } }, fields: "userEnteredFormat(textFormat,backgroundColor)" } },
      // Meta row
      { repeatCell: { range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: numCols }, cell: { userEnteredFormat: { textFormat: { bold: true, foregroundColor: { red: 0.2, green: 0.5, blue: 0.2 } } } }, fields: "userEnteredFormat(textFormat)" } },
      // Header row blue
      { repeatCell: { range: { sheetId, startRowIndex: headerRowIdx, endRowIndex: headerRowIdx + 1, startColumnIndex: 0, endColumnIndex: numCols }, cell: { userEnteredFormat: { textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }, backgroundColor: { red: 0.067, green: 0.227, blue: 0.42 } } }, fields: "userEnteredFormat(textFormat,backgroundColor)" } },
      // Totals row bold green
      { repeatCell: { range: { sheetId, startRowIndex: totalsRowIdx, endRowIndex: totalsRowIdx + 1, startColumnIndex: 0, endColumnIndex: numCols }, cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.85, green: 0.95, blue: 0.85 } } }, fields: "userEnteredFormat(textFormat,backgroundColor)" } },
      // Auto resize
      { autoResizeDimensions: { dimensions: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: numCols } } },
    ];

    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenData.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ requests: fmtRequests }),
    });

    return NextResponse.json({ url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit` });
  } catch (err) {
    console.error("export-sales-sheet error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
