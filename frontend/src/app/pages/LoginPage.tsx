import React, { useState } from "react";
import { useAuth } from "../AuthContext";
import { useNavigate } from "react-router";

type Mode = "login" | "register";

export function LoginPage() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "register") {
        await register(name, email, password);
      } else {
        await login(email, password);
      }
      navigate("/");
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 14px",
    border: "1px solid #E5E7EB",
    borderRadius: 10,
    fontSize: 14,
    fontFamily: "'DM Sans', sans-serif",
    color: "#0D0F12",
    outline: "none",
    backgroundColor: "#FAFBFC",
    boxSizing: "border-box",
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ backgroundColor: "#F8F9FA", fontFamily: "'DM Sans', sans-serif" }}
    >
      <div
        style={{
          maxWidth: 420,
          width: "100%",
          padding: 36,
          backgroundColor: "#FFFFFF",
          borderRadius: 20,
          border: "1px solid #E5E7EB",
          boxShadow: "0px 4px 24px rgba(0,0,0,0.08)",
        }}
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="w-12 h-12 flex items-center justify-center mb-4"
            style={{ backgroundColor: "#1A1A2E", borderRadius: 14 }}
          >
            <span style={{ fontWeight: 700, fontSize: 22, color: "#FFFFFF" }}>C</span>
          </div>
          <h1 style={{ fontWeight: 700, fontSize: 22, color: "#0D0F12", margin: 0 }}>
            {mode === "login" ? "Sign in to BizChat" : "Create your account"}
          </h1>
          <p style={{ color: "#6B7280", fontSize: 14, marginTop: 6, marginBottom: 0, textAlign: "center" }}>
            {mode === "login"
              ? "Enter your credentials to continue"
              : "Start managing orders with AI"}
          </p>
        </div>

        {/* Toggle */}
        <div
          className="flex mb-6"
          style={{
            backgroundColor: "#F3F4F6",
            borderRadius: 10,
            padding: 4,
          }}
        >
          {(["login", "register"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(null); }}
              style={{
                flex: 1,
                padding: "8px 0",
                borderRadius: 8,
                border: "none",
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 14,
                fontWeight: mode === m ? 600 : 400,
                color: mode === m ? "#0D0F12" : "#6B7280",
                backgroundColor: mode === m ? "#FFFFFF" : "transparent",
                cursor: "pointer",
                boxShadow: mode === m ? "0px 1px 4px rgba(0,0,0,0.1)" : "none",
                transition: "all 0.15s",
              }}
            >
              {m === "login" ? "Sign In" : "Register"}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {mode === "register" && (
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, color: "#374151", display: "block", marginBottom: 6 }}>
                Full Name
              </label>
              <input
                type="text"
                placeholder="HOLA AMIGO"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required={mode === "register"}
                style={inputStyle}
              />
            </div>
          )}

          <div>
            <label style={{ fontSize: 13, fontWeight: 500, color: "#374151", display: "block", marginBottom: 6 }}>
              Email
            </label>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={inputStyle}
            />
          </div>

          <div>
            <label style={{ fontSize: 13, fontWeight: 500, color: "#374151", display: "block", marginBottom: 6 }}>
              Password
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={inputStyle}
            />
          </div>

          {error && (
            <div
              style={{
                padding: "10px 14px",
                backgroundColor: "rgba(211,47,47,0.06)",
                border: "1px solid rgba(211,47,47,0.2)",
                borderRadius: 8,
                fontSize: 13,
                color: "#D32F2F",
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "12px 0",
              marginTop: 4,
              backgroundColor: loading ? "#6B7280" : "#1A1A2E",
              color: "#FFFFFF",
              border: "none",
              borderRadius: 10,
              fontSize: 15,
              fontWeight: 600,
              fontFamily: "'DM Sans', sans-serif",
              cursor: loading ? "not-allowed" : "pointer",
              transition: "background-color 0.15s",
            }}
          >
            {loading
              ? "Please wait…"
              : mode === "login"
                ? "Sign In"
                : "Create Account"}
          </button>
        </form>

        {/* Dev bypass */}
        {window.location.hostname === "localhost" && (
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #F3F4F6" }}>
            <button
              onClick={async () => {
                setLoading(true);
                try {
                  await login("local@example.com", "dev-bypass");
                  navigate("/");
                } catch {
                  // dev bypass may set token directly
                }
                setLoading(false);
              }}
              style={{
                width: "100%",
                padding: "10px 0",
                backgroundColor: "transparent",
                color: "#6B7280",
                border: "1px dashed #D1D5DB",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 500,
                fontFamily: "'DM Sans', sans-serif",
                cursor: "pointer",
              }}
            >
              🛠 Dev bypass (local-org)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
