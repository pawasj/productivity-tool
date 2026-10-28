import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function parseFollowers(s: string): number {
  if (!s) return 0;
  const u = s.toString().trim().toUpperCase();
  if (u.endsWith("M")) return Math.round(parseFloat(u) * 1_000_000);
  if (u.endsWith("K")) return Math.round(parseFloat(u) * 1_000);
  return parseInt(u.replace(/[^0-9]/g, "")) || 0;
}

const MAX_BYTES = 5 * 1024 * 1024;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const UPI_RE = /^[\w.\-]{2,256}@[a-zA-Z][a-zA-Z0-9.\-]{1,64}$/;

// Identify the file by its bytes — the browser-supplied type is trivially faked
function sniff(buf: Uint8Array): { ext: string; mime: string } | null {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return { ext: "png", mime: "image/png" };
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return { ext: "pdf", mime: "application/pdf" };
  if (String.fromCharCode(...buf.slice(0, 4)) === "RIFF" && String.fromCharCode(...buf.slice(8, 12)) === "WEBP") {
    return { ext: "webp", mime: "image/webp" };
  }
  return null;
}

async function readDoc(f: FormDataEntryValue | null, label: string) {
  if (!f || typeof f === "string") throw new Error(`${label} is required`);
  if (f.size > MAX_BYTES) throw new Error(`${label} must be under 5 MB`);
  const buf = new Uint8Array(await f.arrayBuffer());
  const kind = sniff(buf);
  if (!kind) throw new Error(`${label} must be a JPG, PNG, WEBP or PDF`);
  return { buf, ...kind, name: f.name.slice(0, 200) };
}

class BadRequest extends Error {}

export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  let submissionId: string | null = null;
  const uploaded: string[] = [];

  try {
    const form = await req.formData();
    const body = JSON.parse(String(form.get("payload") || "{}"));
    const { influencer_type, person_name, contact_no, email, location, state, category, notes, platforms } = body;
    const k = body.kyc || {};

    // ── KYC validation, repeated server-side ──
    const pan = String(k.pan_number || "").trim().toUpperCase();
    const acct = String(k.account_number || "").replace(/\s/g, "");
    const ifsc = String(k.ifsc_code || "").trim().toUpperCase();
    const upi = String(k.upi_id || "").trim();
    if (!PAN_RE.test(pan)) throw new BadRequest("Invalid PAN number");
    if (!acct && !upi) throw new BadRequest("Bank account or UPI ID is required");
    if (acct && !/^\d{9,18}$/.test(acct)) throw new BadRequest("Invalid bank account number");
    if (acct && !IFSC_RE.test(ifsc)) throw new BadRequest("Invalid IFSC code");
    if (upi && !UPI_RE.test(upi)) throw new BadRequest("Invalid UPI ID");

    let aadhaar, panDoc;
    try {
      aadhaar = await readDoc(form.get("aadhaar"), "Aadhaar card");
      panDoc = await readDoc(form.get("pan"), "PAN card");
    } catch (e) {
      throw new BadRequest((e as Error).message);
    }

    if (!influencer_type || !platforms?.length || !platforms[0]?.handle_name) {
      throw new BadRequest("Missing required fields");
    }

    const primary = platforms[0];
    const additional = platforms.slice(1);

    const { data: sub, error } = await supabase.from("influencer_submissions").insert({
      influencer_type,
      person_name: person_name || null,
      contact_no: contact_no || null,
      email: email || null,
      location: location || null,
      state: state || null,
      category: category || null,
      notes: notes || null,
      handle_name: primary.handle_name.trim(),
      channel_link: primary.channel_link || null,
      platform: primary.platform,
      followers: primary.followers ? parseFollowers(primary.followers) : null,
      rate_post: primary.rate_post ? parseFloat(primary.rate_post) : null,
      rate_reel: primary.rate_reel ? parseFloat(primary.rate_reel) : null,
      rate_story: primary.rate_story ? parseFloat(primary.rate_story) : null,
      rate_carousel: primary.rate_carousel ? parseFloat(primary.rate_carousel) : null,
      rate_collab_post: primary.rate_collab_post ? parseFloat(primary.rate_collab_post) : null,
      rate_combo: primary.rate_combo ? parseFloat(primary.rate_combo) : null,
      additional_platforms: additional.map((p: Record<string, string>) => ({
        platform: p.platform,
        handle_name: p.handle_name,
        channel_link: p.channel_link || null,
        followers: p.followers ? parseFollowers(p.followers) : null,
        rate_post: p.rate_post ? parseFloat(p.rate_post) : null,
        rate_reel: p.rate_reel ? parseFloat(p.rate_reel) : null,
        rate_story: p.rate_story ? parseFloat(p.rate_story) : null,
        rate_carousel: p.rate_carousel ? parseFloat(p.rate_carousel) : null,
        rate_collab_post: p.rate_collab_post ? parseFloat(p.rate_collab_post) : null,
        rate_combo: p.rate_combo ? parseFloat(p.rate_combo) : null,
      })),
      status: "pending",
    }).select("id").single();

    if (error || !sub) throw error || new Error("Submission failed");
    submissionId = sub.id;

    // ── KYC documents: private bucket, keyed by submission ──
    const store = async (doc: { buf: Uint8Array; ext: string; mime: string }, kind: string) => {
      const path = `${submissionId}/${kind}.${doc.ext}`;
      const { error: upErr } = await supabase.storage.from("kyc-docs")
        .upload(path, doc.buf, { contentType: doc.mime, upsert: true });
      if (upErr) throw new Error(`Couldn't store ${kind}: ${upErr.message}`);
      uploaded.push(path);
      return path;
    };
    const aadhaarPath = await store(aadhaar, "aadhaar");
    const panPath = await store(panDoc, "pan");

    const { error: kycErr } = await supabase.from("influencer_kyc").insert({
      submission_id: submissionId,
      handle_name: primary.handle_name.trim(),
      platform: primary.platform,
      person_name: person_name || null,
      aadhaar_path: aadhaarPath,
      aadhaar_file_name: aadhaar.name,
      pan_path: panPath,
      pan_file_name: panDoc.name,
      pan_number: pan,
      account_holder_name: String(k.account_holder_name || "").trim() || null,
      bank_name: String(k.bank_name || "").trim() || null,
      account_number: acct || null,
      ifsc_code: acct ? ifsc : null,
      upi_id: upi || null,
    });
    if (kycErr) throw kycErr;

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    // All or nothing: never leave a submission without its KYC, or orphaned files
    if (uploaded.length) await supabase.storage.from("kyc-docs").remove(uploaded).catch(() => {});
    if (submissionId) await supabase.from("influencer_submissions").delete().eq("id", submissionId);

    if (err instanceof BadRequest) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("join submission error:", err);
    // Don't echo internals to a public form
    return NextResponse.json({ error: "Something went wrong saving your registration. Please try again." }, { status: 500 });
  }
}
