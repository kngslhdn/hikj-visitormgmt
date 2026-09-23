import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { SmtpClient, createMessage } from "jsr:@dreamer/email@1.1.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization,apikey,content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};
const json = (x: unknown, status = 200) =>
  new Response(JSON.stringify(x), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

const url = Deno.env.get("SUPABASE_URL")!;
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(url, key);

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  }[c] ?? c));

function smtpConfigured() {
  const host = Deno.env.get("SMTP_HOST");
  const from = Deno.env.get("SMTP_FROM");
  const user = Deno.env.get("SMTP_USER");
  const pass = Deno.env.get("SMTP_PASS");
  return Boolean(host && from && ((!user && !pass) || (user && pass)));
}

function smtpConfig() {
  return {
    host: Deno.env.get("SMTP_HOST")!,
    port: Number(Deno.env.get("SMTP_PORT") || "587"),
    secure: Deno.env.get("SMTP_SECURE") === "true",
    timeout: Number(Deno.env.get("SMTP_TIMEOUT") || "30000"),
    ...(Deno.env.get("SMTP_USER") && Deno.env.get("SMTP_PASS")
      ? { auth: { user: Deno.env.get("SMTP_USER")!, password: Deno.env.get("SMTP_PASS")! } }
      : {}),
  };
}

async function auth(req: Request) {
  const h = req.headers.get("Authorization") || "";
  if (!h.startsWith("Bearer ")) throw new Error("Missing authorization");
  const token = h.slice(7);
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) throw new Error("Unauthorized");
  const { data: profile } = await admin
    .from("admin_profiles")
    .select("user_id,full_name,role,active")
    .eq("user_id", user.id)
    .single();
  if (!profile?.active) throw new Error("Active admin profile required");
  return { user, profile };
}

async function selectedGroups(groupIds: string[]) {
  if (!groupIds.length) return [];
  const { data, error } = await admin
    .from("emergency_contact_groups")
    .select("*")
    .in("id", groupIds)
    .eq("active", true);
  if (error) throw error;
  if ((data || []).length !== groupIds.length) {
    throw new Error("One or more selected recipient groups are inactive or unavailable.");
  }
  return data || [];
}

async function resolveRecipients(groupIds: string[], contactIds: string[]) {
  const groups = await selectedGroups(groupIds);
  const ids = new Set(contactIds);

  if (groupIds.length) {
    const { data, error } = await admin
      .from("emergency_group_members")
      .select("group_id,contact_id,emergency_contacts(*)")
      .in("group_id", groupIds);
    if (error) throw error;
    for (const row of data || []) ids.add(row.contact_id);
  }

  const allIds = [...ids];
  if (!allIds.length) return { groups, contacts: [] };

  const { data: contacts, error } = await admin
    .from("emergency_contacts")
    .select("*")
    .in("id", allIds)
    .eq("active", true);
  if (error) throw error;
  if ((contacts || []).length !== allIds.length) {
    throw new Error("One or more selected emergency contacts are inactive or unavailable.");
  }
  return { groups, contacts: contacts || [] };
}

async function sendEmail(recipients: string[], incident: any) {
  if (!smtpConfigured()) return { status: "PENDING", error: "SMTP provider is not configured." };
  const client = new SmtpClient(smtpConfig());
  const subjectPrefix = incident.test_mode ? "[TEST / DRILL] " : "[HIKJ EMERGENCY] ";
  const text = [
    "HIKJ EMERGENCY NOTIFICATION",
    "",
    `Incident: ${incident.incident_id}`,
    `Severity: ${incident.severity}`,
    `Title: ${incident.title}`,
    `Location: ${incident.location || "-"}`,
    `Time: ${new Date(incident.created_at).toLocaleString("en-GB", { timeZone: "Asia/Jakarta" })}`,
    "",
    incident.description,
    "",
    incident.test_mode ? "This is a TEST / DRILL notification." : "THIS IS A PRODUCTION EMERGENCY.",
  ].join("\n");
  const html = `<div style="font-family:Arial,sans-serif;max-width:680px">
    <h2 style="color:#071a30">HIKJ EMERGENCY NOTIFICATION</h2>
    <p><b>Incident:</b> ${esc(incident.incident_id)}</p>
    <p><b>Severity:</b> ${esc(incident.severity)}</p>
    <p><b>Title:</b> ${esc(incident.title)}</p>
    <p><b>Location:</b> ${esc(incident.location || "-")}</p>
    <p><b>Time:</b> ${esc(new Date(incident.created_at).toLocaleString("en-GB", { timeZone: "Asia/Jakarta" }))}</p>
    <hr><p>${esc(incident.description).replace(/\n/g, "<br>")}</p>
    <p><b>${incident.test_mode ? "TEST / DRILL" : "PRODUCTION EMERGENCY"}</b></p>
  </div>`;
  try {
    await client.send(createMessage({
      from: Deno.env.get("SMTP_FROM")!,
      to: Deno.env.get("SMTP_FROM")!,
      bcc: recipients,
      subject: subjectPrefix + incident.title,
      text,
      html,
      priority: incident.severity === "URGENT" ? "high" : "normal",
    }));
    await client.close();
    return { status: "SENT" };
  } catch (e) {
    try { await client.close(); } catch (_) {}
    return { status: "FAILED", error: e?.message || String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { user, profile } = await auth(req);
    const u = new URL(req.url);
    const action = u.searchParams.get("action") || "dashboard";

    if (action === "me") return json({ profile });

    if (action === "bootstrap") {
      const [a, b, c, d] = await Promise.all([
        admin.from("emergency_incident_types").select("*").eq("active", true).order("name"),
        admin.from("emergency_message_templates").select("*").eq("active", true).order("name"),
        admin.from("emergency_contacts").select("*").eq("active", true).order("priority").order("full_name"),
        admin.from("emergency_contact_groups").select("*").eq("active", true).order("name"),
      ]);
      return json({
        types: a.data || [],
        templates: b.data || [],
        contacts: c.data || [],
        groups: d.data || [],
        smtp_configured: smtpConfigured(),
        production_ready: smtpConfigured() && (d.data || []).some((g: any) => g.whatsapp_group_url),
      });
    }

    if (action === "dashboard") {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const [inc, not, ack, groups] = await Promise.all([
        admin.from("emergency_incidents").select("*").order("created_at", { ascending: false }).limit(30),
        admin.from("emergency_notifications").select("id,status,created_at:queued_at", { count: "exact" }).gte("queued_at", start.toISOString()),
        admin.from("emergency_incident_recipients").select("id,emergency_incidents!inner(status),emergency_acknowledgements!left(id)", { count: "exact" }).in("emergency_incidents.status", ["ACTIVE", "MONITORING"]),
        admin.from("emergency_contact_groups").select("id,name,whatsapp_group_url").eq("active", true),
      ]);
      const active = (inc.data || []).filter((x: any) => ["ACTIVE", "MONITORING"].includes(x.status));
      return json({
        stats: {
          active: active.length,
          urgent: active.filter((x: any) => x.severity === "URGENT").length,
          notifications_today: not.count || 0,
          pending_ack: Math.max(0, (ack.data || []).filter((x: any) => !x.emergency_acknowledgements).length),
        },
        incidents: inc.data || [],
        smtp_configured: smtpConfigured(),
        production_ready: smtpConfigured() && (groups.data || []).some((g: any) => g.whatsapp_group_url),
      });
    }

    if (action === "incident_detail") {
      const id = u.searchParams.get("incident_id");
      if (!id) throw new Error("incident_id required");
      const [i, n, up] = await Promise.all([
        admin.from("emergency_incidents").select("*,emergency_incident_types(name)").eq("id", id).single(),
        admin.from("emergency_notifications").select("*,emergency_incident_recipients(contact_id,emergency_contacts(full_name)),emergency_contact_groups(name)").eq("incident_id", id).order("queued_at"),
        admin.from("emergency_incident_updates").select("*").eq("incident_id", id).order("created_at", { ascending: true }),
      ]);
      const notifications = (n.data || []).map((x: any) => ({
        id: x.id,
        channel: x.channel,
        status: x.status,
        name: x.emergency_contact_groups?.name || x.emergency_incident_recipients?.emergency_contacts?.full_name || "Group",
        error_message: x.error_message || null,
      }));
      return json({ incident: i.data, notifications, updates: up.data || [] });
    }

    if (action === "create_incident" && req.method === "POST") {
      const b = await req.json();
      const groupIds: string[] = Array.isArray(b.group_ids) ? b.group_ids : [];
      const directContactIds: string[] = Array.isArray(b.contact_ids) ? b.contact_ids : [];
      if (!b.title || !b.description || (!groupIds.length && !directContactIds.length)) {
        throw new Error("Title, message and at least one recipient group/contact are required.");
      }

      const { groups, contacts } = await resolveRecipients(groupIds, directContactIds);
      const whatsappGroups = groups.filter((g: any) => g.whatsapp_group_url);
      const productionReady = smtpConfigured() && whatsappGroups.length > 0;

      if (b.test_mode === false && !productionReady) {
        throw new Error("PRODUCTION EMERGENCY BLOCKED: SMTP and an ERT WhatsApp group must be configured first.");
      }

      const { data: incident, error } = await admin.from("emergency_incidents").insert({
        incident_type_id: b.incident_type_id || null,
        severity: b.severity || "URGENT",
        title: b.title,
        location: b.location || null,
        description: b.description,
        status: "ACTIVE",
        test_mode: b.test_mode !== false,
        created_by: user.id,
      }).select().single();
      if (error) throw error;

      const recipientRows: any[] = [];
      for (const contact of contacts) {
        const matchingGroup = groups.find((g: any) => groupIds.includes(g.id));
        recipientRows.push({ incident_id: incident.id, contact_id: contact.id, group_id: matchingGroup?.id || null });
      }
      let recips: any[] = [];
      if (recipientRows.length) {
        const r = await admin.from("emergency_incident_recipients").insert(recipientRows).select("id,contact_id,group_id,emergency_contacts(*)");
        if (r.error) throw r.error;
        recips = r.data || [];
      }

      await admin.from("emergency_incident_updates").insert({
        incident_id: incident.id,
        status: "ACTIVE",
        title: "Incident Created",
        message: b.description,
        created_by: user.id,
      });

      const emailContacts = contacts.filter((c: any) => c.email).map((c: any) => c.email);
      const uniqueEmails = [...new Set(emailContacts)];
      const emailResult = uniqueEmails.length
        ? await sendEmail(uniqueEmails, incident)
        : { status: "PENDING", error: "No email recipients configured." };

      if (uniqueEmails.length) {
        const { data: n } = await admin.from("emergency_notifications").insert({
          incident_id: incident.id,
          recipient_id: recips.find((r: any) => r.emergency_contacts?.email)?.id || null,
          channel: "EMAIL",
          status: emailResult.status,
          error_message: emailResult.error || null,
          sent_at: emailResult.status === "SENT" ? new Date().toISOString() : null,
        }).select().single();
      }

      for (const g of groups) {
        if (g.whatsapp_group_url) {
          await admin.from("emergency_notifications").insert({
            incident_id: incident.id,
            group_id: g.id,
            channel: "WHATSAPP",
            status: "PENDING",
            error_message: "Manual dispatch: open the configured ERT WhatsApp group and press Send.",
          });
        }
      }

      const smsContacts = contacts.filter((c: any) => c.phone_number);
      for (const r of recips.filter((r: any) => r.emergency_contacts?.phone_number)) {
        await admin.from("emergency_notifications").insert({
          incident_id: incident.id,
          recipient_id: r.id,
          channel: "SMS",
          status: "PENDING",
          error_message: "SMS provider is intentionally not configured.",
        });
      }

      await admin.from("audit_logs").insert({
        user_id: user.id,
        user_name: profile.full_name || user.email,
        module: "EMERGENCY",
        action: "CREATE_INCIDENT",
        target: incident.incident_id,
        description: `Created ${incident.severity} incident; groups=${groupIds.length}; contacts=${contacts.length}; test_mode=${incident.test_mode}`,
      });

      const dispatches = whatsappGroups.map((g: any) => ({
        group_id: g.id,
        group_name: g.name,
        url: g.whatsapp_group_url,
        message: [
          incident.test_mode ? "🧪 HIKJ EMERGENCY TEST / DRILL" : "🚨 HIKJ EMERGENCY",
          "",
          `Incident: ${incident.incident_id}`,
          `Severity: ${incident.severity}`,
          `Title: ${incident.title}`,
          `Location: ${incident.location || "-"}`,
          "",
          incident.description,
          "",
          `Time: ${new Date(incident.created_at).toLocaleString("en-GB", { timeZone: "Asia/Jakarta" })}`,
        ].join("\n"),
      }));

      return json({
        ok: true,
        incident,
        email: { status: emailResult.status, recipients: uniqueEmails.length },
        sms: { configured: false, pending: smsContacts.length },
        whatsapp: { manual: true, dispatches },
        production_ready: productionReady,
      });
    }

    throw new Error("Unknown action");
  } catch (e) {
    return json({ error: e?.message || String(e) }, 400);
  }
});
