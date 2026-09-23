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

function smtpConfig(cfg: any) {
  return {
    host: cfg.host!,
    port: Number(cfg.port || 587),
    secure: Boolean(cfg.secure),
    timeout: Number(Deno.env.get("SMTP_TIMEOUT") || "30000"),
    ...(cfg.user && cfg.pass ? { auth: { user: cfg.user, password: cfg.pass } } : {}),
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

function canConfigure(profile: any) {
  return ["ADMIN", "MANAGER", "SUPERADMIN"].includes(profile?.role);
}

function isSuperAdmin(profile: any) {
  return profile?.role === "SUPERADMIN";
}

async function settingsMap() {
  const { data, error } = await admin
    .from("emergency_settings")
    .select("setting_key,setting_value,description,active")
    .eq("active", true)
    .order("setting_key");
  if (error) throw error;
  const out: Record<string, any> = {};
  for (const row of data || []) {
    out[row.setting_key] = row.setting_value;
  }
  return out;
}

async function smtpSettings() {
  const s = await settingsMap();
  const host = s.smtp_host ?? Deno.env.get("SMTP_HOST");
  const port = Number(s.smtp_port ?? Deno.env.get("SMTP_PORT") ?? "587");
  const secure = Boolean(s.smtp_secure ?? (Deno.env.get("SMTP_SECURE") === "true"));
  const from = s.smtp_from ?? Deno.env.get("SMTP_FROM");
  const fromName = s.smtp_from_name ?? Deno.env.get("SMTP_FROM_NAME") ?? "HIKJ Emergency Response";
  const replyTo = s.smtp_reply_to ?? Deno.env.get("SMTP_REPLY_TO") ?? "";
  let vaultUser = "";
  let vaultPass = "";
  try {
    const [u, p] = await Promise.all([
      admin.rpc("emergency_get_smtp_secret", { p_name: "hikj_emergency_smtp_username" }),
      admin.rpc("emergency_get_smtp_secret", { p_name: "hikj_emergency_smtp_password" }),
    ]);
    vaultUser = u.data || "";
    vaultPass = p.data || "";
  } catch (_) {
    // Fall back to Edge Function secrets for backward compatibility.
  }
  const user = vaultUser || Deno.env.get("SMTP_USER") || "";
  const pass = vaultPass || Deno.env.get("SMTP_PASS") || "";
  return {
    host, port, secure, from, fromName, replyTo, user, pass,
    configured: Boolean(host && from && user && pass),
    username_configured: Boolean(user),
    password_configured: Boolean(pass),
  };
}

async function audit(user: any, profile: any, action: string, target: string, description: string) {
  await admin.from("audit_logs").insert({
    user_id: user.id,
    user_name: profile.full_name || user.email,
    module: "EMERGENCY",
    action,
    target,
    description,
  });
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
  let memberships: Array<{group_id:string;contact_id:string}> = [];

  if (groupIds.length) {
    const { data, error } = await admin
      .from("emergency_group_members")
      .select("group_id,contact_id")
      .in("group_id", groupIds);
    if (error) throw error;
    memberships = (data || []).map((row:any) => ({group_id:row.group_id,contact_id:row.contact_id}));
    for (const row of memberships) ids.add(row.contact_id);
  }

  const allIds = [...ids];
  if (!allIds.length) return { groups, contacts: [], memberships };

  const { data: contacts, error } = await admin
    .from("emergency_contacts")
    .select("*")
    .in("id", allIds)
    .eq("active", true);
  if (error) throw error;
  if ((contacts || []).length !== allIds.length) {
    throw new Error("One or more selected emergency contacts are inactive or unavailable.");
  }
  return { groups, contacts: contacts || [], memberships };
}

async function sendEmail(recipients: string[], incident: any, cfg: any) {
  if (!cfg.configured) return { status: "PENDING", error: "SMTP provider is not configured." };
  const client = new SmtpClient(smtpConfig(cfg));
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
      from: cfg.from!,
      to: cfg.from!,
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
    if (action === "settings_bootstrap") {
      if (!canConfigure(profile)) throw new Error("Emergency Settings access requires ADMIN, MANAGER or SUPERADMIN.");
      const [types, templates, groups, contacts, members, settings, auditRows] = await Promise.all([
        admin.from("emergency_incident_types").select("*").order("priority").order("name"),
        admin.from("emergency_message_templates").select("*").order("name"),
        admin.from("emergency_contact_groups").select("*").order("name"),
        admin.from("emergency_contacts").select("*").order("priority").order("full_name"),
        admin.from("emergency_group_members").select("group_id,contact_id"),
        admin.from("emergency_settings").select("setting_key,setting_value,description,active,updated_at").order("setting_key"),
        admin.from("audit_logs").select("*").eq("module","EMERGENCY").order("created_at",{ascending:false}).limit(100),
      ]);
      for (const x of [types,templates,groups,contacts,members,settings,auditRows]) if (x.error) throw x.error;
      const smtp = await smtpSettings();
      return json({
        profile,
        types: types.data || [],
        templates: templates.data || [],
        groups: groups.data || [],
        contacts: contacts.data || [],
        members: members.data || [],
        settings: settings.data || [],
        audit: auditRows.data || [],
        smtp: {
          configured: smtp.configured,
          username_configured: smtp.username_configured,
          password_configured: smtp.password_configured,
          username: smtp.user || "",
          host: smtp.host || "",
          port: smtp.port,
          secure: smtp.secure,
          from: smtp.from || "",
          from_name: smtp.fromName || "",
          reply_to: smtp.replyTo || "",
        }
      });
    }

    if (action === "settings_mutation" && req.method === "POST") {
      if (!canConfigure(profile)) throw new Error("Emergency Settings modification requires ADMIN, MANAGER or SUPERADMIN.");
      const b = await req.json();
      const resource = b.resource;
      const op = b.op;
      const d = b.data || {};
      if (!resource || !op) throw new Error("resource and op are required.");

      if (resource === "smtp" && !isSuperAdmin(profile)) {
        throw new Error("SMTP configuration changes require SUPERADMIN.");
      }

      if (resource === "smtp_secret") {
        if (!isSuperAdmin(profile)) throw new Error("SMTP credentials require SUPERADMIN.");
        const name = d.name;
        if (!["hikj_emergency_smtp_username","hikj_emergency_smtp_password"].includes(name)) {
          throw new Error("Unsupported SMTP credential.");
        }
        const value = String(d.value || "").trim();
        if (!value) throw new Error("SMTP credential value is required.");
        const r = await admin.rpc("emergency_set_smtp_secret", { p_name: name, p_secret: value });
        if (r.error) throw r.error;
        await audit(user, profile, "UPDATE", name, "Updated protected SMTP credential.");
        return json({ ok: true });
      }

      if (resource === "incident_type") {
        if (!d.code || !d.name) throw new Error("Incident type code and name are required.");
        const payload = {
          code: String(d.code).trim().toUpperCase(),
          name: String(d.name).trim(),
          description: d.description || null,
          default_severity: d.default_severity || "URGENT",
          priority: Number(d.priority ?? 100),
          active: d.active !== false,
        };
        const q = d.id
          ? admin.from("emergency_incident_types").update(payload).eq("id", d.id).select().single()
          : admin.from("emergency_incident_types").insert(payload).select().single();
        const r = await q;
        if (r.error) throw r.error;
        await audit(user, profile, d.id ? "UPDATE" : "CREATE", payload.code, "Updated incident type configuration.");
        return json({ ok: true, row: r.data });
      }

      if (resource === "template") {
        if (!d.code || !d.name || !d.title_template || !d.message_template) throw new Error("Template code, name, title and message are required.");
        const payload = {
          code: String(d.code).trim().toUpperCase(),
          name: String(d.name).trim(),
          incident_type_code: d.incident_type_code || null,
          severity: d.severity || "URGENT",
          title_template: d.title_template,
          message_template: d.message_template,
          active: d.active !== false,
        };
        const q = d.id
          ? admin.from("emergency_message_templates").update(payload).eq("id", d.id).select().single()
          : admin.from("emergency_message_templates").insert(payload).select().single();
        const r = await q;
        if (r.error) throw r.error;
        await audit(user, profile, d.id ? "UPDATE" : "CREATE", payload.code, "Updated emergency message template.");
        return json({ ok: true, row: r.data });
      }

      if (resource === "group") {
        if (!d.code || !d.name) throw new Error("Group code and name are required.");
        const payload = {
          code: String(d.code).trim().toUpperCase(),
          name: String(d.name).trim(),
          description: d.description || null,
          whatsapp_group_url: d.whatsapp_group_url || null,
          active: d.active !== false,
        };
        const q = d.id
          ? admin.from("emergency_contact_groups").update(payload).eq("id", d.id).select().single()
          : admin.from("emergency_contact_groups").insert(payload).select().single();
        const r = await q;
        if (r.error) throw r.error;
        await audit(user, profile, d.id ? "UPDATE" : "CREATE", payload.code, "Updated emergency contact group.");
        return json({ ok: true, row: r.data });
      }

      if (resource === "contact") {
        if (!d.full_name) throw new Error("Contact name is required.");

        const email = String(d.email || "").trim().toLowerCase() || null;
        const whatsapp = String(d.whatsapp_number || "").replace(/[^0-9]+/g, "") || null;
        const phone = String(d.phone_number || "").trim() || null;

        const duplicateErrors: string[] = [];

        if (email) {
          let q = admin.from("emergency_contacts").select("id").eq("email", email).limit(1);
          if (d.id) q = q.neq("id", d.id);
          const r = await q.maybeSingle();
          if (r.error) throw r.error;
          if (r.data) duplicateErrors.push("Email address is already registered.");
        }

        if (whatsapp) {
          const all = await admin.from("emergency_contacts").select("id,whatsapp_number");
          if (all.error) throw all.error;
          const duplicate = (all.data || []).some((row:any) =>
            row.id !== d.id &&
            String(row.whatsapp_number || "").replace(/[^0-9]+/g, "") === whatsapp
          );
          if (duplicate) duplicateErrors.push("WhatsApp number is already registered.");
        }

        if (duplicateErrors.length) {
          throw new Error(duplicateErrors.join(" "));
        }

        const payload = {
          full_name: String(d.full_name).trim(),
          position: d.position || null,
          department: d.department || null,
          phone_number: phone,
          email,
          whatsapp_number: whatsapp,
          priority: Number(d.priority ?? 100),
          active: d.active !== false,
        };

        const q = d.id
          ? admin.from("emergency_contacts").update(payload).eq("id", d.id).select().single()
          : admin.from("emergency_contacts").insert(payload).select().single();
        const r = await q;

        if (r.error) {
          if (r.error.code === "23505") {
            const message = String(r.error.message || "");
            if (message.includes("emergency_contacts_email_unique_idx")) {
              throw new Error("Email address is already registered.");
            }
            if (message.includes("emergency_contacts_whatsapp_unique_idx")) {
              throw new Error("WhatsApp number is already registered.");
            }
          }
          throw r.error;
        }

        await audit(user, profile, d.id ? "UPDATE" : "CREATE", payload.full_name, "Updated emergency contact.");
        return json({ ok: true, row: r.data });
      }

      if (resource === "members") {
        if (!d.group_id) throw new Error("group_id is required.");
        const group = await admin.from("emergency_contact_groups").select("id").eq("id", d.group_id).eq("active", true).maybeSingle();
        if (group.error) throw group.error;
        if (!group.data) throw new Error("Selected group is inactive or unavailable.");
        const contactIds = Array.isArray(d.contact_ids) ? [...new Set(d.contact_ids)] : [];
        if (contactIds.length) {
          const valid = await admin.from("emergency_contacts").select("id").in("id", contactIds).eq("active", true);
          if (valid.error) throw valid.error;
          if ((valid.data || []).length !== contactIds.length) throw new Error("One or more selected contacts are inactive or unavailable.");
        }
        const del = await admin.from("emergency_group_members").delete().eq("group_id", d.group_id);
        if (del.error) throw del.error;
        if (contactIds.length) {
          const ins = await admin.from("emergency_group_members").insert(contactIds.map((contact_id: string) => ({group_id:d.group_id,contact_id})));
          if (ins.error) throw ins.error;
        }
        await audit(user, profile, "UPDATE", d.group_id, "Updated emergency group membership.");
        return json({ ok: true });
      }

      if (resource === "setting") {
        const allowed = new Set([
          "default_severity","default_incident_type_code","default_location","timezone","incident_id_prefix",
          "production_enabled","require_production_confirmation","require_recipient_selection",
          "notification_retry_count","acknowledgement_timeout_minutes","auto_refresh_seconds","retention_days",
          "smtp_host","smtp_port","smtp_secure","smtp_username","smtp_from","smtp_from_name","smtp_reply_to"
        ]);
        if (!allowed.has(d.setting_key)) throw new Error("Unsupported setting.");
        if (d.setting_key.startsWith("smtp_") && !isSuperAdmin(profile)) throw new Error("SMTP settings require SUPERADMIN.");
        const payload = {
          setting_key: d.setting_key,
          setting_value: d.setting_value,
          description: d.description || null,
          active: true,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        };
        const r = await admin.from("emergency_settings").upsert(payload,{onConflict:"setting_key"}).select().single();
        if (r.error) throw r.error;
        await audit(user, profile, "UPDATE", d.setting_key, "Updated emergency system setting.");
        return json({ ok: true, row: r.data });
      }

      throw new Error("Unknown settings resource.");
    }


        if (action === "bootstrap") {
      const [a, b, c, d, settings] = await Promise.all([
        admin.from("emergency_incident_types").select("*").eq("active", true).order("priority").order("name"),
        admin.from("emergency_message_templates").select("*").eq("active", true).order("name"),
        admin.from("emergency_contacts").select("*").eq("active", true).order("priority").order("full_name"),
        admin.from("emergency_contact_groups").select("*").eq("active", true).order("name"),
        admin.from("emergency_settings").select("setting_key,setting_value").eq("active", true).order("setting_key"),
      ]);
      for (const x of [a,b,c,d,settings]) if (x.error) throw x.error;
      const smtp = await smtpSettings();
      return json({
        types: a.data || [],
        templates: b.data || [],
        contacts: c.data || [],
        groups: d.data || [],
        settings: settings.data || [],
        smtp_configured: smtp.configured,
        production_ready: smtp.configured && (d.data || []).some((g: any) => g.whatsapp_group_url)
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
      const smtp = await smtpSettings();
      const settingRows = await admin.from("emergency_settings").select("setting_key,setting_value").eq("active",true);
      if (settingRows.error) throw settingRows.error;
      const settingMap: Record<string, any> = {};
      for (const row of settingRows.data || []) settingMap[row.setting_key] = row.setting_value;
      return json({
        stats: {
          active: active.length,
          urgent: active.filter((x: any) => x.severity === "URGENT").length,
          notifications_today: not.count || 0,
          pending_ack: Math.max(0, (ack.data || []).filter((x: any) => !x.emergency_acknowledgements).length),
        },
        incidents: inc.data || [],
        smtp_configured: smtp.configured,
        production_ready: Boolean(settingMap.production_enabled !== false) && smtp.configured && (groups.data || []).some((g: any) => g.whatsapp_group_url),
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

    
    if (action === "smtp_test" && req.method === "POST") {
      if (!isSuperAdmin(profile)) throw new Error("SMTP test requires SUPERADMIN.");
      const cfg = await smtpSettings();
      if (!cfg.configured) throw new Error("SMTP is not fully configured. Check host, From address and SMTP secrets.");
      const result = await sendEmail(
        [user.email!],
        {
          incident_id: "SMTP-TEST",
          severity: "INFORMATION",
          title: "HIKJ Emergency SMTP Test",
          location: "Emergency Settings",
          created_at: new Date().toISOString(),
          description: "This is a test email from the HIKJ Emergency Response System.",
          test_mode: true,
        },
        cfg
      );
      await audit(user, profile, "TEST", "SMTP", "Executed SMTP test email.");
      if (result.status !== "SENT") throw new Error(result.error || "SMTP test failed.");
      return json({ ok: true, status: result.status, recipient: user.email });
    }

    if (action === "create_incident" && req.method === "POST") {
      const b = await req.json();
      const groupIds: string[] = Array.isArray(b.group_ids) ? b.group_ids : [];
      const directContactIds: string[] = Array.isArray(b.contact_ids) ? b.contact_ids : [];
      if (!b.title || !b.description || (!groupIds.length && !directContactIds.length)) {
        throw new Error("Title, message and at least one recipient group/contact are required.");
      }

      const { groups, contacts, memberships } = await resolveRecipients(groupIds, directContactIds);
      const whatsappGroups = groups.filter((g: any) => g.whatsapp_group_url);
      const smtp = await smtpSettings();
      const systemSettings = await settingsMap();
      const productionEnabled = systemSettings.production_enabled !== false;
      const productionReady = productionEnabled && smtp.configured && whatsappGroups.length > 0;

      if (b.test_mode === false && !productionEnabled) {
        throw new Error("PRODUCTION EMERGENCY BLOCKED: Production Emergency is disabled in System Settings.");
      }
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
        const matchingGroup = memberships.find((m:any) => m.contact_id === contact.id);
        recipientRows.push({ incident_id: incident.id, contact_id: contact.id, group_id: matchingGroup?.group_id || null });
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
        ? await sendEmail(uniqueEmails, incident, smtp)
        : { status: "PENDING", error: "No email recipients configured." };

      if (uniqueEmails.length) {
        for (const r of recips.filter((r:any) => r.emergency_contacts?.email)) {
          await admin.from("emergency_notifications").insert({
            incident_id: incident.id,
            recipient_id: r.id,
            channel: "EMAIL",
            status: emailResult.status,
            error_message: emailResult.error || null,
            sent_at: emailResult.status === "SENT" ? new Date().toISOString() : null,
          });
        }
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
