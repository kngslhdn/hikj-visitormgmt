import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Content-Type": "application/json",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: corsHeaders });
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(supabaseUrl, serviceRoleKey);

async function requireAdmin(req: Request) {
  const auth = req.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw new Error("Unauthorized");
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) throw new Error("Unauthorized");
  const { data: profile, error: profileError } = await sb.from("admin_profiles").select("user_id,active,role").eq("user_id", data.user.id).eq("active", true).maybeSingle();
  const role = String(profile?.role || "").toUpperCase();
  if (profileError || !profile || !["ADMIN", "MANAGER", "SUPERADMIN"].includes(role)) throw new Error("Forbidden");
  return data.user;
}

function isUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  try {
    await requireAdmin(req);

    if (req.method === "GET") {
      const url = new URL(req.url);
      const q = (url.searchParams.get("q") || "").trim();
      let query = sb.from("package_registrations")
        .select("id,submission_id,courier_name,phone,company_name,item_type,item_count,recipient_type,recipient_name,security_officer_name,created_at")
        .order("created_at", { ascending: false }).limit(100);

      const { data: distributed, error: de } = await sb.from("package_distributions").select("package_registration_id");
      if (de) throw de;
      const distributedIds = (distributed || []).map((r) => r.package_registration_id);
      if (distributedIds.length) query = query.not("id", "in", `(${distributedIds.join(",")})`);

      if (isUuid(q)) {
        const { data: exact } = await sb.from("package_registrations")
          .select("id,submission_id,courier_name,phone,company_name,item_type,item_count,recipient_type,recipient_name,security_officer_name,created_at")
          .eq("submission_id", q).maybeSingle();
        if (exact && !distributedIds.includes(exact.id)) {
          const { data: sub } = await sb.from("submissions").select("submission_id").eq("id", exact.submission_id).maybeSingle();
          const publicId = sub?.submission_id || exact.submission_id;
          return json({ packages: [{ ...exact, submission_id: publicId, package_number: publicId, status: "READY FOR DISTRIBUTION" }] });
        }
      }

      const { data, error } = await query;
      if (error) return json({ error: error.message }, 400);
      const rows = data || [];
      const submissionIds = rows.map((p) => p.submission_id).filter(Boolean);
      const publicMap = new Map<string, string>();
      if (submissionIds.length) {
        const { data: subs, error: se } = await sb.from("submissions").select("id,submission_id").in("id", submissionIds);
        if (se) return json({ error: se.message }, 400);
        for (const s of subs || []) publicMap.set(s.id, s.submission_id);
      }

      const term = q.toLowerCase();
      const filtered = (data || []).filter((p) => {
        if (!term) return true;
        const searchText = [
          p.recipient_name,
          p.courier_name,
          p.company_name,
          p.item_type,
          p.recipient_type,
          publicMap.get(p.submission_id) || p.submission_id,
        ].join(" ").toLowerCase();
        return searchText.includes(term);
      });
      return json({ packages: filtered.map((p) => ({ ...p, submission_id: publicMap.get(p.submission_id) || p.submission_id, package_number: publicMap.get(p.submission_id) || p.submission_id, status: "READY FOR DISTRIBUTION" })) });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const packageRegistrationId = String(body.package_registration_id || "").trim();
      const securityHandOver = String(body.security_hand_over || "").trim();
      const recipientName = String(body.recipient_name || "").trim();
      if (!packageRegistrationId) return json({ error: "Package not found." }, 404);
      if (!securityHandOver) return json({ error: "Please enter Security Hand Over." }, 400);
      if (!recipientName) return json({ error: "Please enter Recipient / Representative Name." }, 400);

      const { data: pkg, error: pkgError } = await sb.from("package_registrations").select("id,submission_id,recipient_name").eq("id", packageRegistrationId).maybeSingle();
      if (pkgError || !pkg) return json({ error: "Package not found." }, 404);
      const { data: existing } = await sb.from("package_distributions").select("id").eq("package_registration_id", packageRegistrationId).maybeSingle();
      if (existing) return json({ error: "Package has already been distributed." }, 409);

      const { data: pkgSubmission, error: pkgSubmissionError } = await sb.from("submissions").select("submission_id").eq("id", pkg.submission_id).maybeSingle();
      if (pkgSubmissionError || !pkgSubmission) return json({ error: "Package submission record not found." }, 500);
      const { data: distribution, error: insertError } = await sb.from("package_distributions").insert({
        package_registration_id: pkg.id,
        package_number: pkgSubmission.submission_id,
        registered_recipient_name: pkg.recipient_name,
        recipient_name: recipientName,
        security_hand_over: securityHandOver,
        distributed_at: new Date().toISOString(),
        status: "DISTRIBUTED",
      }).select("id,package_number,recipient_name,security_hand_over,distributed_at,status").single();
      if (insertError) {
        if (insertError.code === "23505") return json({ error: "Package has already been distributed." }, 409);
        return json({ error: "Unable to complete package distribution. Please try again." }, 500);
      }
      return json({ success: true, message: "Package successfully distributed.", distribution });
    }
    return json({ error: "Method not allowed." }, 405);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return json({ error: message === "Forbidden" ? "Forbidden" : "Unauthorized" }, message === "Forbidden" ? 403 : 401);
  }
});
