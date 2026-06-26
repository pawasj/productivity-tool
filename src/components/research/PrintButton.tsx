"use client";
export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="no-print"
      style={{
        position: "fixed", bottom: "24px", right: "24px",
        background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
        color: "white", border: "none", padding: "12px 24px",
        borderRadius: "50px", fontWeight: 700, fontSize: "14px",
        cursor: "pointer", boxShadow: "0 4px 20px rgba(124,58,237,0.4)", zIndex: 100,
      }}>
      🖨️ Save as PDF
    </button>
  );
}
