import React, { useState, useEffect } from "react";
import {
  Store, Bot, Shield, Save, CheckCircle2,
  Loader2, AlertCircle, IndianRupee, Phone,
  Mail, MapPin, FileText, Percent,
} from "lucide-react";
import { useApiClient } from "@/app/ApiClientContext";

/* ─── Tokens ─── */
const CARD: React.CSSProperties = {
  backgroundColor: "#FFFFFF",
  borderRadius: 16,
  border: "1px solid #E5E7EB",
  boxShadow: "0px 2px 12px rgba(0,0,0,0.07)",
  fontFamily: "'DM Sans', sans-serif",
};
const LABEL: React.CSSProperties = {
  fontWeight: 500, fontSize: 11, color: "#6B7280",
  letterSpacing: "0.06em", textTransform: "uppercase" as const,
  fontFamily: "'DM Sans', sans-serif",
};
const INPUT: React.CSSProperties = {
  width: "100%",
  border: "1px solid #E5E7EB",
  borderRadius: 10,
  padding: "10px 12px",
  fontFamily: "'DM Sans', sans-serif",
  fontSize: 14,
  color: "#0D0F12",
  outline: "none",
  transition: "border-color 0.2s, box-shadow 0.2s",
  backgroundColor: "#FFFFFF",
  boxSizing: "border-box" as const,
};

/* ─── Field component ─── */
function Field({
  label, value, onChange, placeholder, icon, type = "text", hint,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; icon?: React.ReactNode; type?: string; hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label style={LABEL}>{label}</label>
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2" style={{ pointerEvents: "none" }}>
            {icon}
          </div>
        )}
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={{ ...INPUT, paddingLeft: icon ? 36 : 12 }}
          onFocus={e => { e.currentTarget.style.borderColor = "#1A1A2E"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(26,26,46,0.06)"; }}
          onBlur={e => { e.currentTarget.style.borderColor = "#E5E7EB"; e.currentTarget.style.boxShadow = "none"; }}
        />
      </div>
      {hint && <span className="text-[11px]" style={{ color: "#9CA3AF" }}>{hint}</span>}
    </div>
  );
}

/* ─── Section header ─── */
function SectionHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3 px-6 py-4" style={{ borderBottom: "1px solid #E5E7EB" }}>
      <div className="w-[36px] h-[36px] flex items-center justify-center rounded-xl" style={{ backgroundColor: "#F8F9FA", border: "1px solid #E5E7EB" }}>
        {icon}
      </div>
      <div>
        <span style={{ fontWeight: 600, fontSize: 15, color: "#0D0F12", display: "block" }}>{title}</span>
        <span className="text-[12px]" style={{ color: "#6B7280" }}>{subtitle}</span>
      </div>
    </div>
  );
}

/* ─── Business Profile Form ─── */
interface Profile {
  businessName: string;
  gstNumber: string;
  address: string;
  phone: string;
  email: string;
  taxRate: string;
}

export function SettingsPage() {
  const client = useApiClient();
  const [profile, setProfile] = useState<Profile>({
    businessName: "", gstNumber: "", address: "", phone: "", email: "", taxRate: "18",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  /* Load existing settings */
  useEffect(() => {
    setLoading(true);
    client.request<any>("/api/settings")
      .then(data => {
        setProfile({
          businessName: data.businessName ?? "",
          gstNumber: data.gstNumber ?? "",
          address: data.address ?? "",
          phone: data.phone ?? "",
          email: data.email ?? "",
          taxRate: String(data.taxRate ?? "18"),
        });
      })
      .catch(() => {}) // silently fall back to empty form
      .finally(() => setLoading(false));
  }, []);

  const set = (key: keyof Profile) => (v: string) => setProfile(p => ({ ...p, [key]: v }));

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus("idle");
    setErrorMsg("");
    try {
      await client.request("/api/settings", {
        method: "PUT",
        body: JSON.stringify({
          businessName: profile.businessName,
          gstNumber: profile.gstNumber,
          address: profile.address || null,
          phone: profile.phone || null,
          email: profile.email || null,
          taxRate: parseFloat(profile.taxRate) || 18,
        }),
      });
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch (err: any) {
      setSaveStatus("error");
      const status = err?.status ?? 0;
      if (status === 404) {
        setErrorMsg("Settings endpoint not found — please restart the backend server (pnpm dev).");
      } else if (status === 401 || status === 403) {
        setErrorMsg("Not authorised. Please log out and log back in.");
      } else {
        setErrorMsg(err?.message ?? "Failed to save settings. Try again.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 h-full overflow-y-auto" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="m-0" style={{ fontWeight: 700, fontSize: 24, color: "#0D0F12" }}>Settings</h1>
          <p className="m-0 text-[13px] mt-0.5" style={{ color: "#6B7280" }}>
            Manage your store profile — these details appear on every invoice.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || loading}
          className="flex items-center gap-2 px-5 py-2.5 cursor-pointer text-[14px]"
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 600,
            color: "#FFFFFF",
            backgroundColor: saveStatus === "success" ? "#00C853" : "#1A1A2E",
            borderRadius: 10,
            border: "none",
            opacity: saving || loading ? 0.7 : 1,
            transition: "background-color 0.3s",
          }}
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> :
           saveStatus === "success" ? <CheckCircle2 size={16} /> : <Save size={16} />}
          {saving ? "Saving…" : saveStatus === "success" ? "Saved!" : "Save Changes"}
        </button>
      </div>

      {/* Error banner */}
      {saveStatus === "error" && (
        <div className="flex items-center gap-2 px-4 py-3 mb-4 rounded-xl" style={{ backgroundColor: "#FEF2F2", border: "1px solid #FECACA", color: "#D32F2F" }}>
          <AlertCircle size={16} />
          <span className="text-[13px]">{errorMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-5">
        {/* ── Store Profile ── */}
        <div style={CARD} className="overflow-hidden col-span-2">
          <SectionHeader
            icon={<Store size={17} color="#1A1A2E" />}
            title="Store Profile"
            subtitle="This info appears on your GST invoices sent to customers"
          />
          {loading ? (
            <div className="flex items-center justify-center py-12 gap-2">
              <Loader2 size={20} className="animate-spin" color="#6B7280" />
              <span className="text-[13px]" style={{ color: "#6B7280" }}>Loading settings…</span>
            </div>
          ) : (
            <div className="p-6 grid grid-cols-2 gap-5">
              <Field
                label="Business / Store Name"
                value={profile.businessName}
                onChange={set("businessName")}
                placeholder="e.g. Sharma's Kirana Store"
                icon={<Store size={14} color="#9E9E9E" />}
                hint="Printed at the top of every invoice"
              />
              <Field
                label="GSTIN Number"
                value={profile.gstNumber}
                onChange={set("gstNumber")}
                placeholder="e.g. 07AXXPK1234R1Z5"
                icon={<FileText size={14} color="#9E9E9E" />}
                hint="Your GST registration number"
              />
              <Field
                label="Phone Number"
                value={profile.phone}
                onChange={set("phone")}
                placeholder="e.g. +91 98765 43210"
                icon={<Phone size={14} color="#9E9E9E" />}
                type="tel"
              />
              <Field
                label="Email Address"
                value={profile.email}
                onChange={set("email")}
                placeholder="e.g. store@example.com"
                icon={<Mail size={14} color="#9E9E9E" />}
                type="email"
              />
              <div className="col-span-2">
                <Field
                  label="Shop Address"
                  value={profile.address}
                  onChange={set("address")}
                  placeholder="e.g. Shop No. 12, Main Market, Delhi — 110001"
                  icon={<MapPin size={14} color="#9E9E9E" />}
                  hint="Full address printed on invoices"
                />
              </div>
              <div>
                <Field
                  label="Default Tax Rate (%)"
                  value={profile.taxRate}
                  onChange={set("taxRate")}
                  placeholder="18"
                  icon={<Percent size={14} color="#9E9E9E" />}
                  type="number"
                  hint="Split equally as CGST + SGST (e.g. 18% → 9% + 9%)"
                />
              </div>
            </div>
          )}
        </div>

        {/* ── AI Worker (read-only info) ── */}
        <div style={CARD} className="overflow-hidden">
          <SectionHeader
            icon={<Bot size={17} color="#2979FF" />}
            title="AI Worker"
            subtitle="Order extraction configuration"
          />
          <div className="p-5 flex flex-col gap-4">
            {[
              { label: "Status", value: "Online", color: "#00C853" },
              { label: "Language", value: "Hindi + English (Hinglish)" },
              { label: "Min Confidence", value: "40%" },
              { label: "Buffer Delay", value: "10 seconds" },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between py-1" style={{ borderBottom: "1px solid #F9FAFB" }}>
                <span style={LABEL}>{row.label}</span>
                <span className="text-[13px]" style={{ fontWeight: 500, color: row.color ?? "#0D0F12" }}>
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Security (read-only info) ── */}
        <div style={CARD} className="overflow-hidden">
          <SectionHeader
            icon={<Shield size={17} color="#00C853" />}
            title="Privacy & Security"
            subtitle="Data handling and PII protection"
          />
          <div className="p-5 flex flex-col gap-4">
            {[
              { label: "PII Masking", value: "Always On" },
              { label: "Data Storage", value: "Google Firestore" },
              { label: "Data Retention", value: "Unlimited" },
              { label: "Auth", value: "Token-based" },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between py-1" style={{ borderBottom: "1px solid #F9FAFB" }}>
                <span style={LABEL}>{row.label}</span>
                <span className="text-[13px]" style={{ fontWeight: 500, color: "#0D0F12" }}>
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Invoice preview hint */}
      <div className="mt-5 px-5 py-4 rounded-2xl flex items-center gap-3" style={{ backgroundColor: "rgba(41,121,255,0.04)", border: "1px solid rgba(41,121,255,0.12)" }}>
        <FileText size={18} color="#2979FF" />
        <span className="text-[13px]" style={{ color: "#374151" }}>
          <strong style={{ color: "#1A1A2E" }}>Tip:</strong> After saving, go to <strong>Orders</strong> → mark an order as Paid → click <strong>Generate Invoice</strong> to see your new business name and GST number on the invoice.
        </span>
      </div>
    </div>
  );
}
