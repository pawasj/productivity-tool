import { createServiceRoleClient } from "@/lib/supabase-server";
import { notFound } from "next/navigation";
import PrintButton from "@/components/research/PrintButton";

export default async function ResearchReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const service = createServiceRoleClient();
  const { data: report } = await service
    .from("research_reports")
    .select("*, creator:profiles!research_reports_created_by_fkey(full_name)")
    .eq("id", id)
    .single();

  if (!report || report.status !== "done") notFound();

  const result = report.result as Record<string, unknown>;
  const date = new Date(report.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

  function g<T>(path: string, fallback: T): T {
    const parts = path.split(".");
    let cur: unknown = result;
    for (const p of parts) {
      if (cur == null || typeof cur !== "object") return fallback;
      cur = (cur as Record<string, unknown>)[p];
    }
    return (cur ?? fallback) as T;
  }

  const types: string[] = report.analysis_types || [];
  const hasComp = types.includes("competitor_analysis");
  const hasSent = types.includes("sentiment_analysis");
  const hasSocial = types.includes("social_media_listening");
  const hasCamp = types.includes("campaign_ideas");

  const sentPos = g<number>("sentiment_analysis.positive_pct", 0);
  const sentNeu = g<number>("sentiment_analysis.neutral_pct", 0);
  const sentNeg = g<number>("sentiment_analysis.negative_pct", 0);
  const COLORS = ["#7c3aed", "#4f46e5", "#0891b2", "#059669", "#d97706", "#dc2626", "#be185d"];

  const compChartData = JSON.stringify(g<unknown[]>("competitor_analysis.competitors", []));
  const sentChartData = JSON.stringify(g<unknown[]>("sentiment_analysis.platform_sentiment", []));
  const platChartData = JSON.stringify(g<unknown[]>("social_media_listening.platforms", []));
  const colorsJson = JSON.stringify(COLORS);

  const chartScript = `
window.addEventListener('load', function() {
  if (typeof Chart === 'undefined') return;

  var compData = ${compChartData};
  var compEl = document.getElementById('compChart');
  if (compEl && compData.length > 0) {
    new Chart(compEl, {
      type: 'bar',
      data: {
        labels: compData.map(function(c){ return c.name; }),
        datasets: [{ label: 'Relative Position', data: compData.map(function(_,i){ return Math.max(30, 95 - i * 12); }),
          backgroundColor: ${colorsJson}.slice(0, compData.length).map(function(c){ return c + 'cc'; }),
          borderRadius: 8, borderSkipped: false }]
      },
      options: { plugins: { legend: { display: false } }, scales: { y: { max: 100, grid: { color: '#f1f5f9' } }, x: { grid: { display: false } } }, animation: { duration: 0 } }
    });
  }

  var sentData = ${sentChartData};
  var sentEl = document.getElementById('sentChart');
  if (sentEl && sentData.length > 0) {
    new Chart(sentEl, {
      type: 'bar',
      data: {
        labels: sentData.map(function(p){ return p.platform; }),
        datasets: [{ label: 'Sentiment Score', data: sentData.map(function(p){ return p.score; }),
          backgroundColor: sentData.map(function(p){ return p.score >= 70 ? '#05966980' : p.score >= 50 ? '#d9780680' : '#dc262680'; }),
          borderRadius: 8, borderSkipped: false }]
      },
      options: { plugins: { legend: { display: false } }, scales: { y: { max: 100, grid: { color: '#f1f5f9' } }, x: { grid: { display: false } } }, animation: { duration: 0 } }
    });
  }

  var platData = ${platChartData};
  var socialEl = document.getElementById('socialChart');
  if (socialEl && platData.length > 0) {
    new Chart(socialEl, {
      type: 'doughnut',
      data: {
        labels: platData.map(function(p){ return p.name + ' (' + p.followers + ')'; }),
        datasets: [{ data: platData.map(function(_,i){ return 100 - i * 15; }),
          backgroundColor: ${colorsJson}.slice(0, platData.length), borderWidth: 0, hoverOffset: 4 }]
      },
      options: { plugins: { legend: { position: 'right', labels: { font: { size: 12 } } } }, animation: { duration: 0 } }
    });
  }
});
`;

  const s = (v: unknown) => String(v ?? "");
  const arr = <T,>(v: unknown): T[] => Array.isArray(v) ? v as T[] : [];

  const competitors = arr<Record<string, unknown>>(g("competitor_analysis.competitors", []));
  const praised = arr<{ aspect: string; detail: string }>(g("sentiment_analysis.praised", []));
  const criticized = arr<{ aspect: string; detail: string }>(g("sentiment_analysis.criticized", []));
  const quotes = arr<string>(g("sentiment_analysis.notable_quotes", []));
  const platforms = arr<Record<string, string>>(g("social_media_listening.platforms", []));
  const hashtags = arr<string>(g("social_media_listening.trending_hashtags", []));
  const viralMoments = arr<{ description: string; platform: string; approx_reach: string }>(g("social_media_listening.viral_moments", []));
  const contentGaps = arr<string>(g("social_media_listening.content_gaps", []));
  const compOpps = arr<string>(g("competitor_analysis.opportunities", []));
  const compThreats = arr<string>(g("competitor_analysis.threats", []));
  const compInsights = arr<string>(g("competitor_analysis.market_insights", []));
  const campaignIdeas = arr<Record<string, string>>(g("campaign_ideas.ideas", []));
  const compSummary = g<string>("competitor_analysis.summary", "");
  const sentSummary = g<string>("sentiment_analysis.summary", "");
  const socialSummary = g<string>("social_media_listening.summary", "");
  const campSummary = g<string>("campaign_ideas.summary", "");
  const brandTonality = g<string>("campaign_ideas.brand_tonality", "");
  const calendarSuggestion = g<string>("campaign_ideas.content_calendar_suggestion", "");
  const overallScore = g<number>("sentiment_analysis.overall_score", 0);

  return (
    <html lang="en">
      <head>
        <title>Research Report — {report.brand_name}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js" />
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; color: #1e293b; }
          @media print { body { background: white; } .no-print { display: none !important; } .page-break { page-break-before: always; } }
          .container { max-width: 900px; margin: 0 auto; padding: 32px 24px; }
          .card { background: white; border-radius: 16px; border: 1px solid #e2e8f0; padding: 28px; margin-bottom: 24px; }
          .section-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #94a3b8; margin-bottom: 18px; }
          .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
          .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
          @media (max-width: 640px) { .grid2, .grid3 { grid-template-columns: 1fr; } }
          .stat-box { background: #f8fafc; border-radius: 12px; padding: 16px; border: 1px solid #f1f5f9; text-align: center; }
          .stat-value { font-size: 28px; font-weight: 800; }
          .stat-label { font-size: 12px; color: #94a3b8; font-weight: 500; margin-top: 2px; }
          .comp-card { border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 12px; }
          .insight-item { display: flex; align-items: flex-start; gap: 10px; padding: 7px 0; border-bottom: 1px solid #f8fafc; }
          .insight-dot { width: 6px; height: 6px; min-width: 6px; border-radius: 50%; background: #7c3aed; margin-top: 7px; }
          .sentiment-bar { height: 20px; border-radius: 10px; overflow: hidden; display: flex; margin: 12px 0; }
          .platform-row { display: flex; align-items: center; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #f1f5f9; }
          .campaign-card { border: 1px solid #e2e8f0; border-radius: 14px; padding: 20px; margin-bottom: 14px; border-left: 4px solid #7c3aed; }
          .badge { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 20px; font-size: 12px; font-weight: 600; margin: 2px; }
          .header-gradient { background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%); color: white; border-radius: 20px; padding: 36px; margin-bottom: 28px; }
          .type-tag { background: rgba(255,255,255,0.2); color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; display: inline-block; margin: 3px; }
          .quote-block { border-left: 3px solid #e2e8f0; padding-left: 12px; margin-bottom: 10px; font-style: italic; color: #64748b; font-size: 13px; }
          .viral-block { padding: 12px; background: #faf5ff; border-radius: 10px; margin-bottom: 8px; border-left: 3px solid #7c3aed; }
          .cal-block { padding: 14px; background: #f8fafc; border-radius: 12px; border-left: 3px solid #4f46e5; font-size: 14px; color: #475569; margin-top: 12px; }
        `}</style>
      </head>
      <body>
        <div className="container">
          {/* Header */}
          <div className="header-gradient">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
              <div>
                <div style={{ fontSize: "12px", fontWeight: 600, opacity: 0.7, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>Research Report · BCC Media Network</div>
                <div style={{ fontSize: "36px", fontWeight: 900, color: "white", marginBottom: "8px" }}>{report.brand_name}</div>
                <div style={{ color: "rgba(255,255,255,0.75)", fontSize: "14px" }}>
                  Generated {date}{report.creator?.full_name && ` · by ${report.creator.full_name}`}
                </div>
              </div>
              <div style={{ alignSelf: "flex-end" }}>
                {types.map((t: string) => (
                  <span key={t} className="type-tag">
                    {t === "competitor_analysis" ? "🏆 Competitor" : t === "sentiment_analysis" ? "💬 Sentiment" : t === "social_media_listening" ? "📡 Social Listening" : "✨ Campaign Ideas"}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Reference links */}
          {(report.links as string[] || []).length > 0 && (
            <div className="card">
              <div className="section-title">🔗 Reference Links</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {(report.links as string[]).map((l: string, i: number) => (
                  <a key={i} href={l} target="_blank" rel="noopener noreferrer" style={{ fontSize: "13px", background: "#f1f5f9", padding: "4px 12px", borderRadius: "8px", color: "#4f46e5" }}>{l}</a>
                ))}
              </div>
            </div>
          )}

          {/* ── COMPETITOR ANALYSIS ── */}
          {hasComp && !!result.competitor_analysis && (
            <div className="card page-break">
              <div className="section-title">🏆 Competitor Analysis</div>
              {compSummary && <p style={{ marginBottom: "20px", fontSize: "15px", lineHeight: 1.6 }}>{compSummary}</p>}

              {competitors.map((comp, i) => (
                <div key={i} className="comp-card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "8px" }}>
                    <div>
                      <div style={{ fontSize: "16px", fontWeight: 700 }}>{s(comp.name)}</div>
                      {!!comp.tagline && <div style={{ fontSize: "13px", color: "#94a3b8", marginTop: "2px" }}>{s(comp.tagline)}</div>}
                    </div>
                    {!!comp.market_position && (
                      <span className="badge" style={{ background: COLORS[i % COLORS.length] + "20", color: COLORS[i % COLORS.length] }}>
                        {s(comp.market_position)}
                      </span>
                    )}
                  </div>
                  {!!comp.recent_news && (
                    <div style={{ marginTop: "10px", padding: "8px 12px", background: "#fafafa", borderRadius: "8px", fontSize: "13px", color: "#64748b" }}>
                      📰 {s(comp.recent_news)}
                    </div>
                  )}
                  <div className="grid2" style={{ marginTop: "12px" }}>
                    {arr<string>(comp.strengths).length > 0 && (
                      <div>
                        <div style={{ fontSize: "11px", fontWeight: 700, color: "#059669", marginBottom: "6px" }}>STRENGTHS</div>
                        {arr<string>(comp.strengths).map((str, j) => (
                          <div key={j} className="insight-item"><div className="insight-dot" style={{ background: "#059669" }} /><span style={{ fontSize: "13px" }}>{str}</span></div>
                        ))}
                      </div>
                    )}
                    {arr<string>(comp.weaknesses).length > 0 && (
                      <div>
                        <div style={{ fontSize: "11px", fontWeight: 700, color: "#dc2626", marginBottom: "6px" }}>WEAKNESSES</div>
                        {arr<string>(comp.weaknesses).map((w, j) => (
                          <div key={j} className="insight-item"><div className="insight-dot" style={{ background: "#dc2626" }} /><span style={{ fontSize: "13px" }}>{w}</span></div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              <div className="grid2" style={{ marginTop: "8px" }}>
                {compOpps.length > 0 && (
                  <div className="stat-box" style={{ textAlign: "left", borderLeft: "3px solid #059669" }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#059669", marginBottom: "10px" }}>OPPORTUNITIES</div>
                    {compOpps.map((o, i) => <div key={i} className="insight-item"><div className="insight-dot" style={{ background: "#059669" }} /><span style={{ fontSize: "13px" }}>{o}</span></div>)}
                  </div>
                )}
                {compThreats.length > 0 && (
                  <div className="stat-box" style={{ textAlign: "left", borderLeft: "3px solid #dc2626" }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#dc2626", marginBottom: "10px" }}>THREATS</div>
                    {compThreats.map((t, i) => <div key={i} className="insight-item"><div className="insight-dot" style={{ background: "#dc2626" }} /><span style={{ fontSize: "13px" }}>{t}</span></div>)}
                  </div>
                )}
              </div>

              {compInsights.length > 0 && (
                <div style={{ marginTop: "16px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", marginBottom: "10px" }}>MARKET INSIGHTS</div>
                  {compInsights.map((ins, i) => (
                    <div key={i} className="insight-item"><div className="insight-dot" /><span style={{ fontSize: "14px" }}>{ins}</span></div>
                  ))}
                </div>
              )}

              {competitors.length > 0 && (
                <div style={{ marginTop: "24px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", marginBottom: "12px" }}>COMPETITIVE POSITION MAP</div>
                  <canvas id="compChart" style={{ maxHeight: "200px" }} />
                </div>
              )}
            </div>
          )}

          {/* ── SENTIMENT ANALYSIS ── */}
          {hasSent && !!result.sentiment_analysis && (
            <div className="card page-break">
              <div className="section-title">💬 Sentiment Analysis</div>
              {sentSummary && <p style={{ marginBottom: "20px", fontSize: "15px", lineHeight: 1.6 }}>{sentSummary}</p>}

              <div className="grid3" style={{ marginBottom: "20px" }}>
                <div className="stat-box">
                  <div className="stat-value" style={{ color: overallScore >= 50 ? "#059669" : "#d97706" }}>{overallScore}%</div>
                  <div className="stat-label">Overall Score</div>
                </div>
                <div className="stat-box">
                  <div className="stat-value" style={{ color: "#059669" }}>{sentPos}%</div>
                  <div className="stat-label">Positive</div>
                </div>
                <div className="stat-box">
                  <div className="stat-value" style={{ color: "#dc2626" }}>{sentNeg}%</div>
                  <div className="stat-label">Negative</div>
                </div>
              </div>

              <div className="sentiment-bar">
                <div style={{ width: `${sentPos}%`, background: "#059669" }} />
                <div style={{ width: `${sentNeu}%`, background: "#94a3b8" }} />
                <div style={{ width: `${sentNeg}%`, background: "#dc2626" }} />
              </div>
              <div style={{ display: "flex", gap: "16px", fontSize: "12px", color: "#94a3b8", marginBottom: "20px" }}>
                <span>🟢 {sentPos}% Positive</span>
                <span>⚪ {sentNeu}% Neutral</span>
                <span>🔴 {sentNeg}% Negative</span>
              </div>

              {g<unknown[]>("sentiment_analysis.platform_sentiment", []).length > 0 && (
                <div style={{ marginTop: "8px", marginBottom: "20px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", marginBottom: "12px" }}>PLATFORM SENTIMENT BREAKDOWN</div>
                  <canvas id="sentChart" style={{ maxHeight: "200px" }} />
                </div>
              )}

              <div className="grid2">
                {praised.length > 0 && (
                  <div>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#059669", marginBottom: "10px" }}>WHAT PEOPLE LOVE 👍</div>
                    {praised.map((item, i) => (
                      <div key={i} style={{ marginBottom: "12px" }}>
                        <div style={{ fontWeight: 600, fontSize: "13px" }}>{item.aspect}</div>
                        <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>{item.detail}</div>
                      </div>
                    ))}
                  </div>
                )}
                {criticized.length > 0 && (
                  <div>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#dc2626", marginBottom: "10px" }}>WHAT PEOPLE DON&apos;T LIKE 👎</div>
                    {criticized.map((item, i) => (
                      <div key={i} style={{ marginBottom: "12px" }}>
                        <div style={{ fontWeight: 600, fontSize: "13px" }}>{item.aspect}</div>
                        <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>{item.detail}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {quotes.length > 0 && (
                <div style={{ marginTop: "16px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", marginBottom: "10px" }}>NOTABLE MENTIONS</div>
                  {quotes.map((q, i) => <div key={i} className="quote-block">&ldquo;{q}&rdquo;</div>)}
                </div>
              )}
            </div>
          )}

          {/* ── SOCIAL MEDIA LISTENING ── */}
          {hasSocial && !!result.social_media_listening && (
            <div className="card page-break">
              <div className="section-title">📡 Social Media Listening</div>
              {socialSummary && <p style={{ marginBottom: "20px", fontSize: "15px", lineHeight: 1.6 }}>{socialSummary}</p>}

              {platforms.length > 0 && (
                <>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", marginBottom: "10px" }}>PLATFORM PRESENCE</div>
                  {platforms.map((p, i) => (
                    <div key={i} className="platform-row">
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: COLORS[i % COLORS.length] + "20", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px" }}>
                          {p.name === "Instagram" ? "📸" : p.name === "LinkedIn" ? "💼" : p.name === "YouTube" ? "▶️" : p.name?.includes("X") || p.name?.includes("Twitter") ? "𝕏" : "📱"}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: "14px" }}>{p.name} {p.handle && <span style={{ color: "#94a3b8", fontWeight: 400, fontSize: "12px" }}>{p.handle}</span>}</div>
                          <div style={{ fontSize: "12px", color: "#64748b" }}>{p.content_type} · {p.posting_freq}</div>
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 800, fontSize: "16px", color: COLORS[i % COLORS.length] }}>{p.followers}</div>
                        <div style={{ fontSize: "12px", color: "#94a3b8" }}>Eng: {p.engagement}</div>
                      </div>
                    </div>
                  ))}
                  <div style={{ marginTop: "20px" }}>
                    <canvas id="socialChart" style={{ maxHeight: "220px" }} />
                  </div>
                </>
              )}

              {hashtags.length > 0 && (
                <div style={{ marginTop: "20px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", marginBottom: "10px" }}>TRENDING HASHTAGS</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {hashtags.map((h, i) => (
                      <span key={i} style={{ background: COLORS[i % COLORS.length] + "15", color: COLORS[i % COLORS.length], padding: "4px 12px", borderRadius: "20px", fontSize: "13px", fontWeight: 600 }}>{h}</span>
                    ))}
                  </div>
                </div>
              )}

              {viralMoments.length > 0 && (
                <div style={{ marginTop: "20px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", marginBottom: "10px" }}>VIRAL MOMENTS</div>
                  {viralMoments.map((v, i) => (
                    <div key={i} className="viral-block">
                      <div style={{ fontWeight: 600, fontSize: "13px" }}>{v.description}</div>
                      <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "4px" }}>{v.platform} · {v.approx_reach} reach</div>
                    </div>
                  ))}
                </div>
              )}

              {contentGaps.length > 0 && (
                <div style={{ marginTop: "16px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", marginBottom: "8px" }}>CONTENT GAPS & OPPORTUNITIES</div>
                  {contentGaps.map((gap, i) => <div key={i} className="insight-item"><div className="insight-dot" /><span style={{ fontSize: "14px" }}>{gap}</span></div>)}
                </div>
              )}
            </div>
          )}

          {/* ── CAMPAIGN IDEAS ── */}
          {hasCamp && !!result.campaign_ideas && (
            <div className="card page-break">
              <div className="section-title">✨ Campaign Ideas</div>
              {campSummary && <p style={{ marginBottom: "8px", fontSize: "15px", lineHeight: 1.6 }}>{campSummary}</p>}
              {brandTonality && (
                <div style={{ padding: "8px 14px", background: "#faf5ff", borderRadius: "8px", fontSize: "13px", color: "#7c3aed", marginBottom: "20px" }}>
                  <strong>Brand Voice:</strong> {brandTonality}
                </div>
              )}

              {campaignIdeas.map((idea, i) => {
                const cat = idea.category || "";
                const catColor = cat.includes("Video") ? "#7c3aed" : cat.includes("Content IP") || cat.includes("Series") ? "#0891b2" : cat.includes("Collab") ? "#059669" : "#d97706";
                return (
                  <div key={i} className="campaign-card" style={{ borderLeftColor: COLORS[i % COLORS.length] }}>
                    <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "8px", marginBottom: "10px" }}>
                      <div style={{ fontSize: "18px", fontWeight: 900 }}>
                        <span style={{ color: "#94a3b8", fontSize: "13px", fontWeight: 500 }}>#{i + 1} </span>{idea.title}
                      </div>
                      <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", alignSelf: "flex-start" }}>
                        {idea.format && <span className="badge" style={{ background: "#f1f5f9", color: "#475569" }}>📹 {idea.format}</span>}
                        {idea.platform && <span className="badge" style={{ background: "#eff6ff", color: "#3b82f6" }}>📱 {idea.platform}</span>}
                        {cat && <span className="badge" style={{ background: catColor + "15", color: catColor }}>{cat}</span>}
                      </div>
                    </div>
                    <p style={{ color: "#475569", fontSize: "14px", lineHeight: 1.6 }}>{idea.concept}</p>
                    {idea.tagline && (
                      <div style={{ marginTop: "12px", fontStyle: "italic", fontWeight: 700, fontSize: "15px", color: "#7c3aed" }}>
                        &ldquo;{idea.tagline}&rdquo;
                      </div>
                    )}
                    {idea.viral_hook && (
                      <div style={{ marginTop: "10px", padding: "8px 12px", background: "#fefce8", borderRadius: "8px", fontSize: "13px", color: "#92400e" }}>
                        ⚡ <strong>Viral Hook:</strong> {idea.viral_hook}
                      </div>
                    )}
                  </div>
                );
              })}

              {calendarSuggestion && (
                <div className="cal-block">
                  📅 <strong>Rollout Suggestion:</strong> {calendarSuggestion}
                </div>
              )}
            </div>
          )}

          <div style={{ textAlign: "center", padding: "24px 0", color: "#cbd5e1", fontSize: "12px" }}>
            Generated by BCC Research Hub · {date}
          </div>
        </div>

        <PrintButton />
        <script dangerouslySetInnerHTML={{ __html: chartScript }} />
      </body>
    </html>
  );
}
