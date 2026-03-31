import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import {
  Truck, Upload, FileText, CheckCircle, AlertCircle, Loader2,
  RefreshCw, ChevronDown, MapPin, Clock, User, Activity,
  X, Send, Eye, Package, Zap, Info, RotateCcw,
  Sun, Moon
} from "lucide-react";

const API = import.meta.env.VITE_API_BASE_URL ? `${import.meta.env.VITE_API_BASE_URL}/tracking` : "http://localhost:5000/api/tracking";

/* ─── helpers ─────────────────────────────────────────────────────────── */
const STATUS_MAP = {
  D1: { label: "Delivered",      color: "#00f2fe", bg: "rgba(0, 242, 254, 0.12)", border: "rgba(0, 242, 254, 0.4)",  glow: "#00f2fe55" },
  X1: { label: "In Transit",     color: "#f9d423", bg: "rgba(249, 212, 35, 0.12)",  border: "rgba(249, 212, 35, 0.4)",  glow: "#f9d42355" },
  P1: { label: "Picked Up",      color: "#4 facfe", bg: "rgba(79, 172, 254, 0.12)", border: "rgba(79, 172, 254, 0.4)", glow: "#4facfe55" },
  A1: { label: "Arrived",        color: "#c471ed", bg: "rgba(196, 113, 237, 0.12)", border: "rgba(196, 113, 237, 0.4)", glow: "#c471ed55" },
  C1: { label: "Cancelled",      color: "#f5576c", bg: "rgba(245, 87, 108, 0.12)", border: "rgba(245, 87, 108, 0.4)", glow: "#f5576c55" },
  U1: { label: "Unknown",        color: "#9ca3af", bg: "rgba(156, 163, 175, 0.12)", border: "rgba(156, 163, 175, 0.3)", glow: "transparent" },
};

const TIMEZONES = [
  "Asia/Kolkata", "US/Pacific", "US/Eastern", "US/Central", "US/Mountain",
  "Europe/London", "Europe/Berlin", "Asia/Singapore", "Asia/Shanghai",
  "Asia/Tokyo", "Australia/Sydney", "Africa/Nairobi", "UTC",
];

const now_iso = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const hh = pad(Math.floor(Math.abs(off) / 60));
  const mm = pad(Math.abs(off) % 60);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${hh}:${mm}`;
};

function Toast({ toasts }) {
  return (
    <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, display: "flex", flexDirection: "column", gap: 10 }}>
      {toasts.map((t) => (
        <div key={t.id} style={{
          background: t.type === "success" ? "#052e16" : "#450a0a",
          color: t.type === "success" ? "#86efac" : "#fca5a5",
          border: `1px solid ${t.type === "success" ? "#166534" : "#991b1b"}`,
          borderRadius: 10, padding: "12px 18px", display: "flex", alignItems: "center",
          gap: 10, fontSize: 14, fontWeight: 600, minWidth: 280,
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          animation: "slideIn 0.3s ease",
        }}>
          {t.type === "success" ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          {t.message}
        </div>
      ))}
    </div>
  );
}

function Timeline({ events, darkMode }) {
  if (!events.length) {
    return (
      <div style={{ textAlign: "center", padding: "60px 0", color: "#6b7280", fontSize: 14 }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(99, 102, 241, 0.05)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
           <Activity size={32} style={{ opacity: 0.3, color: "#6366f1" }} />
        </div>
        <p style={{ fontWeight: 600, color: darkMode ? "#9ca3af" : "#64748b" }}>No tracking records yet</p>
        <p style={{ fontSize: 12, marginTop: 4 }}>New events will appear here in real-time.</p>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", paddingLeft: 8 }}>
      <div style={{
        position: "absolute", left: 19, top: 0, bottom: 0, width: 2,
        background: "linear-gradient(to bottom, #6366f1 0%, #a855f7 50%, rgba(168, 85, 247, 0) 100%)",
        opacity: 0.2
      }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {events.map((ev, idx) => {
          const code   = ev.statusCodeGid?.split(".")?.pop() || ev.statusCodeGid || "U1";
          const status = STATUS_MAP[code] || STATUS_MAP.U1;
          const date   = ev.eventDate?.value || ev.eventReceivedDate?.value || "";
          const fmt    = date ? new Date(date).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : "—";

          return (
            <div key={idx} className="timeline-item" style={{ display: "flex", gap: 20, paddingBottom: 32, position: "relative" }}>
              <div style={{
                width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
                background: `linear-gradient(135deg, ${status.color}, #fff)`, border: `3px solid ${darkMode ? '#0f172a' : '#fff'}`,
                shadow: `0 0 15px ${status.color}`,
                boxShadow: `0 0 20px ${status.glow}`,
                zIndex: 1, position: "relative", marginTop: 4,
                transition: "transform 0.2s ease"
              }}>
                 <div className="pulse-ring" style={{ border: `2px solid ${status.color}` }}></div>
              </div>

              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{
                    color: status.color, fontSize: 13, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.5,
                    textShadow: `0 0 10px ${status.glow}`
                  }}>{status.label}</span>
                  <span style={{ color: "#64748b", fontSize: 11, fontWeight: 700 }}>{fmt}</span>
                </div>
                
                <div style={{
                  background: status.bg, border: `1px solid ${status.border}`,
                  borderRadius: 16, padding: "12px 14px", transition: "all 0.3s ease",
                  boxShadow: `0 8px 16px -4px rgba(0,0,0,0.2)`
                }} className="event-details">
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 16, color: darkMode ? "#fff" : "#1e293b", fontSize: 12, opacity: 0.9 }}>
                    {ev.shipmentGid && (
                      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <Truck size={12} color={status.color} /> <b style={{ color: darkMode ? "#fff" : "#0f172a" }}>{ev.shipmentGid?.split('.').pop()}</b>
                      </span>
                    )}
                    {ev.responsiblePartyGid && (
                      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <User size={12} color={status.color} /> {ev.responsiblePartyGid}
                      </span>
                    )}
                    {(ev.statusReasonCodeGid) && (
                      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <Info size={12} color={status.color} /> {ev.statusReasonCodeGid}
                      </span>
                    )}
                  </div>
                  {ev.remarks && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${status.border}`, color: darkMode ? "#e2e8f0" : "#334155", fontSize: 11, fontStyle: "italic", opacity: 0.8 }}>
                      "{ev.remarks}"
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── main component ───────────────────────────────────────────────────── */
export default function ShipmentTracking() {
  const [darkMode,      setDarkMode]      = useState(false);
  const [toasts,        setToasts]        = useState([]);
  const [shipments,     setShipments]     = useState([]);
  const [shipsLoading,  setShipsLoading]  = useState(false);
  const [selectedShip,  setSelectedShip]  = useState("");
  const [history,       setHistory]       = useState([]);
  const [docs,          setDocs]          = useState([]);
  const [loading,       setLoading]       = useState(false);

  const [podFile,       setPodFile]       = useState(null);
  const [formData,      setFormData]      = useState(null);
  const [extracting,    setExtracting]    = useState(false);
  const [submitting,    setSubmitting]    = useState(false);
  const [previewOpen,   setPreviewOpen]   = useState(false);
  const [successData,   setSuccessData]   = useState(null);

  const toastId = useRef(0);
  const fileInputRef = useRef();

  const addToast = (message, type = "success") => {
    const id = ++toastId.current;
    setToasts((p) => [...p, { id, message, type }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 4500);
  };

  /* removed auto-fetch shipments due to OTM 403 perms on /shipments */
  useEffect(() => {
    // optional: could load a recent list if supported later
  }, []);

  /* fetch events and documents when shipment changes */
  const loadShipmentData = useCallback(async (shipGid) => {
    if (!shipGid) { setHistory([]); setDocs([]); return; }
    setLoading(true);
    try {
      const hRes = await axios.get(`${API}/tracking-events`, { params: { shipmentGid: shipGid } });
      setHistory(hRes.data.events || []);
      
      const dRes = await axios.get(`${API}/shipment-documents/${shipGid}`);
      setDocs(dRes.data.documents || []);
    } catch (err) {
      addToast("Failed to load shipment data", "error");
      console.error("Load error:", err);
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  const handleShipmentChange = (gid) => {
    setSelectedShip(gid);
    loadShipmentData(gid);
    setFormData(null);
    setPodFile(null);
  };

  /* ── OCR extraction ── */
  const handleExtract = async () => {
    if (!podFile) return;
    setExtracting(true);
    const fd = new FormData();
    fd.append("file", podFile);
    try {
      const r = await axios.post(`${API}/pod/extract-ocr`, fd, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      const d = r.data.extracted_data;
      setFormData({
        shipmentGid:         selectedShip || d.shipmentGid || "",
        statusCodeGid:       d.statusCodeGid || "D1",
        statusReasonCodeGid: d.statusReasonCodeGid || "NS",
        responsiblePartyGid: d.responsiblePartyGid || "CARRIER",
        eventDate:           d.eventDate || now_iso(),
        timeZoneGid:         d.timeZoneGid || "Asia/Kolkata",
        remarks:             d.remarks || "",
        _document_path:      d._document_path,
        _document_filename:  d._document_filename,
        _document_mimetype:  d._document_mimetype,
        _raw_ocr_text:       d._raw_ocr_text,
      });
      addToast("POD extracted successfully! Review fields below.", "success");
    } catch (err) {
      addToast(err.response?.data?.error || "OCR extraction failed", "error");
    } finally {
      setExtracting(false);
    }
  };

  /* ── Submit tracking event ── */
  const handleSubmit = async () => {
    if (!formData?.shipmentGid) { addToast("Shipment GID is required", "error"); return; }
    if (!formData?.eventDate)   { addToast("Event date is required", "error"); return; }
    setSubmitting(true);
    try {
      const res = await axios.post(`${API}/tracking-events`, formData);
      const evId = res.data.eventGid?.split('.').pop() || res.data.eventGid || "Success";
      
      setSuccessData({
        eventGid: res.data.eventGid,
        docGid: res.data.docGid,
        docXid: res.data.docXid,
        prettyFilename: res.data.prettyFilename,
      });

      addToast(`Event #${evId} created!`, "success");
      setFormData(null);
      setPodFile(null);
      setTimeout(() => loadShipmentData(formData.shipmentGid || selectedShip), 1500);
    } catch (err) {
      const detail = err.response?.data?.detail;
      const msg    = err.response?.data?.error || "Failed to create tracking event";
      addToast(`${msg}${detail ? `: ${JSON.stringify(detail).slice(0, 120)}` : ""}`, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const field = (label, key, type = "text", opts = null) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: 10, fontWeight: 900, color: darkMode ? "#a5b4fc" : "#4338ca", textTransform: "uppercase", letterSpacing: 1 }}>
        {label}
      </label>
      {opts ? (
        <select
          value={formData[key] || ""}
          onChange={(e) => setFormData((p) => ({ ...p, [key]: e.target.value }))}
          style={inputStyle}
        >
          {opts.map((o) => (
            <option key={o.value || o} value={o.value || o}>{o.label || o}</option>
          ))}
        </select>
      ) : (
        <input
          type={type}
          value={formData[key] || ""}
          onChange={(e) => setFormData((p) => ({ ...p, [key]: e.target.value }))}
          style={inputStyle}
        />
      )}
    </div>
  );

  /* ── styles ── */
  const card = {
    background: darkMode ? "rgba(15, 23, 42, 0.7)" : "rgba(255, 255, 255, 0.8)",
    backdropFilter: "blur(24px) saturate(180%)",
    WebkitBackdropFilter: "blur(24px) saturate(180%)",
    border: darkMode ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid rgba(148, 163, 184, 0.3)",
    borderRadius: 28,
    padding: "24px",
    boxShadow: darkMode ? "0 20px 50px rgba(0, 0, 0, 0.4), inset 0 1px 1px rgba(255,255,255,0.05)" : "0 20px 50px rgba(0, 0, 0, 0.05), inset 0 1px 1px rgba(255,255,255,0.4)",
    transition: "all 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
  };

  const inputStyle = {
    background: darkMode ? "rgba(0, 0, 0, 0.2)" : "rgba(255, 255, 255, 0.8)",
    border: darkMode ? "1px solid rgba(255, 255, 255, 0.1)" : "1px solid rgba(148, 163, 184, 0.4)",
    borderRadius: 14,
    padding: "12px 16px",
    color: darkMode ? "#fff" : "#0f172a",
    fontSize: 14,
    fontWeight: 500,
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
    transition: "all 0.3s ease",
    boxShadow: darkMode ? "inset 0 2px 4px rgba(0,0,0,0.3)" : "inset 0 2px 4px rgba(0,0,0,0.05)",
  };

  const btnPrimary = {
    background: "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)",
    color: "#fff",
    border: "none",
    borderRadius: 14,
    padding: "12px 24px",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 10,
    boxShadow: "0 8px 20px -4px rgba(99, 102, 241, 0.4)",
    transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
  };

  const btnSecondary = {
    background: darkMode ? "rgba(255, 255, 255, 0.05)" : "rgba(255, 255, 255, 0.8)",
    color: darkMode ? "#94a3b8" : "#475569",
    border: darkMode ? "1px solid rgba(255, 255, 255, 0.1)" : "1px solid rgba(148, 163, 184, 0.4)",
    borderRadius: 16,
    padding: "12px 24px",
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 12,
    transition: "all 0.3s ease",
    boxShadow: darkMode ? "none" : "0 2px 4px rgba(0,0,0,0.03)"
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; padding: 0; }
        
        @keyframes slideIn { from { transform: translateX(60px); opacity:0; } to { transform: translateX(0); opacity:1; } }
        @keyframes fadeUp  { from { opacity:0; transform:translateY(40px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse { 0% { transform: scale(1); opacity: 0.5; } 100% { transform: scale(2.5); opacity: 0; } }
        @keyframes glow { 0%, 100% { box-shadow: 0 0 20px rgba(99, 102, 241, 0.3); } 50% { box-shadow: 0 0 40px rgba(99, 102, 241, 0.6); } }
        
        .timeline-item:hover { transform: scale(1.02); }
        .timeline-item:hover .event-details { background: rgba(255, 255, 255, 0.08) !important; border-color: rgba(255, 255, 255, 0.2) !important; }
        .timeline-item:hover .pulse-ring { animation: pulse 1.5s cubic-bezier(0.24, 0, 0.38, 1) infinite; }
        
        .pulse-ring {
          position: absolute; top: -4px; left: -4px; width: 32px; height: 32px;
          border-radius: 50%; opacity: 0; pointer-events: none;
        }

        .input-focus:focus { border-color: #6366f1 !important; background: rgba(255,255,255,0.06) !important; box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1); }
        .btn-hover:hover { transform: translateY(-4px) scale(1.02); filter: brightness(1.2); box-shadow: 0 20px 40px -10px rgba(79, 70, 229, 0.6); }
        .btn-hover:active { transform: translateY(0) scale(0.98); }

        .track-page select, .track-page input { color-scheme: ${darkMode ? 'dark' : 'light'}; }
        .track-page select option { background: ${darkMode ? '#0f172a' : '#fff'}; color: ${darkMode ? '#fff' : '#0f172a'}; padding: 12px; }
        
        .track-page ::-webkit-scrollbar { width: 4px; }
        .track-page ::-webkit-scrollbar-track { background: transparent; }
        .track-page ::-webkit-scrollbar-thumb { background: ${darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(148, 163, 184, 0.3)'}; border-radius: 10px; }
        .track-page ::-webkit-scrollbar-thumb:hover { background: ${darkMode ? 'rgba(255, 255, 255, 0.3)' : 'rgba(148, 163, 184, 0.5)'}; }

        .mesh-gradient {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: -1;
          background-color: ${darkMode ? '#020617' : '#f8fafc'};
          background-image: ${darkMode ? `
            radial-gradient(at 0% 0%, hsla(243, 75%, 12%, 1) 0, transparent 55%), 
            radial-gradient(at 50% 0%, hsla(263, 70%, 15%, 1) 0, transparent 50%), 
            radial-gradient(at 100% 0%, hsla(280, 75%, 12%, 1) 0, transparent 55%), 
            radial-gradient(at 100% 100%, hsla(263, 70%, 10%, 1) 0, transparent 50%), 
            radial-gradient(at 20% 80%, hsla(243, 75%, 10%, 1) 0, transparent 50%),
            radial-gradient(at 0% 100%, hsla(223, 75%, 12%, 1) 0, transparent 55%)`
          : `
            radial-gradient(at 0% 0%, hsla(243, 75%, 95%, 1) 0, transparent 55%), 
            radial-gradient(at 50% 0%, hsla(263, 70%, 93%, 1) 0, transparent 50%), 
            radial-gradient(at 100% 0%, hsla(280, 75%, 95%, 1) 0, transparent 55%), 
            radial-gradient(at 100% 100%, hsla(263, 70%, 92%, 1) 0, transparent 50%), 
            radial-gradient(at 20% 80%, hsla(243, 75%, 95%, 1) 0, transparent 50%),
            radial-gradient(at 0% 100%, hsla(223, 75%, 95%, 1) 0, transparent 55%)`};
        }

        .modal-overlay {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(2, 6, 23, 0.9); backdrop-filter: blur(20px);
          display: flex; align-items: center; justify-content: center; z-index: 10000;
          animation: fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
      
      <div className="mesh-gradient" />

      <Toast toasts={toasts} />

      <div className="track-page" style={{
        minHeight: "100vh",
        fontFamily: "'Outfit', sans-serif",
        padding: "64px 32px",
        color: darkMode ? "#f1f5f9" : "#334155",
        transition: "color 0.4s ease"
      }}>

        {successData && (
          <div className="modal-overlay" onClick={() => setSuccessData(null)}>
            <div style={{ ...card, maxWidth: 500, width: "90%", position: "relative" }} onClick={e => e.stopPropagation()}>
              <button onClick={() => setSuccessData(null)} style={{ position: "absolute", right: 16, top: 16, border: "none", background: "none", color: "#4338ca", cursor: "pointer" }}>
                <X size={20} />
              </button>
              <div style={{ textAlign: "center", marginBottom: 24 }}>
                <CheckCircle size={48} color="#22c55e" style={{ margin: "0 auto 16px" }} />
                <h2 style={{ color: "#fff", margin: 0, fontSize: 22, fontWeight: 900 }}>Update Successful!</h2>
                <p style={{ color: "#a5b4fc", fontSize: 14 }}>Tracking event created & document attached</p>
              </div>
              
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {[
                  { label: "Event ID", val: successData.eventGid },
                  { label: "Doc Record", val: successData.docXid },
                  { label: "File Name", val: successData.prettyFilename },
                ].map(item => (
                  <div key={item.label} style={{ background: "rgba(99,102,241,0.1)", padding: "12px", borderRadius: 10, border: "1px solid #312e81" }}>
                    <div style={{ fontSize: 10, fontWeight: 900, color: "#818cf8", textTransform: "uppercase", marginBottom: 4 }}>{item.label}</div>
                    <code style={{ fontSize: 13, color: "#e0e7ff", fontWeight: 700 }}>{item.val || "—"}</code>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 24, display: "flex", gap: 10 }}>
                <button onClick={() => setSuccessData(null)} style={{ ...btnSecondary, flex: 1, justifyContent: "center" }}>Close</button>
                <button 
                  onClick={() => window.open(`${API}/view-document/${successData.docGid}`, "_blank")}
                  style={{ ...btnPrimary, flex: 1, justifyContent: "center" }}
                >
                  <Eye size={16} /> Verify Doc
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── header ── */}
        <div style={{ maxWidth: 1400, margin: "0 auto 64px", animation: "fadeUp .8s cubic-bezier(0.16, 1, 0.3, 1)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
              <div style={{
                width: 72, height: 72, borderRadius: 24,
                background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 20px 40px -10px rgba(99,102,241,0.6)",
                position: "relative", overflow: "hidden"
              }}>
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: "linear-gradient(45deg, transparent, rgba(255,255,255,0.3), transparent)" }} />
                <Activity size={36} color="#fff" />
              </div>
              <div>
                <h1 style={{ 
                  color: darkMode ? "transparent" : "#1e293b", fontSize: 48, fontWeight: 900, margin: 0, letterSpacing: "-0.04em",
                  background: darkMode ? "linear-gradient(to right, #fff, #818cf8, #c084fc)" : "none", 
                  WebkitBackgroundClip: darkMode ? "text" : "border-box", WebkitTextFillColor: darkMode ? "transparent" : "initial",
                  filter: darkMode ? "drop-shadow(0 0 20px rgba(99, 102, 241, 0.3))" : "none"
                }}>
                  Shipment Tracking
                </h1>
                <p style={{ color: darkMode ? "#94a3b8" : "#64748b", fontSize: 16, margin: "6px 0 0", fontWeight: 600, letterSpacing: "0.02em" }}>
                  Real-time <span style={{ color: darkMode ? "#a5b4fc" : "#4338ca" }}>orchestration</span> &amp; POD verify system
                </p>
              </div>
            </div>
            {/* Dark Mode Toggle */}
            <button
              onClick={() => setDarkMode(!darkMode)}
              className={darkMode
                ? "flex items-center gap-2 bg-slate-800 border border-slate-700 px-4 py-2 rounded-xl hover:bg-slate-700 transition !text-white"
                : "flex items-center gap-2 bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition text-slate-800"}
              style={{
                fontFamily: "'Outfit', sans-serif", fontSize: 14, fontWeight: 600, cursor: "pointer",
                background: darkMode ? "rgba(30, 41, 59, 0.7)" : "#ffffff",
                border: darkMode ? "1px solid rgba(255,255,255,0.1)" : "1px solid #e2e8f0",
                color: darkMode ? "#fff" : "#1e293b",
                padding: "8px 16px", borderRadius: "12px",
                display: "flex", alignItems: "center", gap: "8px", backdropFilter: "blur(10px)"
              }}
            >
              {darkMode ? <Sun size={18} color="#facc15" /> : <Moon size={18} color="#4f46e5" />}
              <span>{darkMode ? "Light Mode" : "Dark Mode"}</span>
            </button>
          </div>
        </div>

        <div style={{ 
          display: "grid", 
          gridTemplateColumns: "minmax(350px, 1fr) minmax(400px, 1.2fr) minmax(350px, 0.8fr)", 
          gap: 24, 
          maxWidth: 1600, 
          margin: "0 auto",
          alignItems: "start"
        }}>

          {/* ── COLUMN 1: ACTIONS (Selection & Upload) ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Shipment Selection */}
            <div style={{ ...card, animation: "fadeUp .5s ease .1s both" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                <div style={{ padding: 8, borderRadius: 8, background: darkMode ? "rgba(99, 102, 241, 0.1)" : "rgba(99, 102, 241, 0.05)" }}>
                  <Truck size={18} color="#818cf8" />
                </div>
                <h2 style={{ color: darkMode ? "#fff" : "#0f172a", fontWeight: 700, fontSize: 16, margin: 0 }}>
                  Active Shipment
                </h2>
                {shipsLoading && <Loader2 size={14} color="#818cf8" className="animate-spin" />}
              </div>

              <form onSubmit={(e) => { e.preventDefault(); handleShipmentChange(selectedShip); }}>
                <div style={{ position: "relative" }}>
                  <input
                    type="text"
                    placeholder="Enter Shipment GID"
                    value={selectedShip}
                    onChange={(e) => setSelectedShip(e.target.value.toUpperCase())}
                    onKeyPress={(e) => { if (e.key === 'Enter') handleShipmentChange(selectedShip); }}
                    onBlur={(e) => { if (e.target.value) handleShipmentChange(e.target.value); }}
                    style={{ ...inputStyle, paddingRight: 40, fontSize: 14 }}
                  />
                  <button type="submit" style={{ position: "absolute", right: 8, top: 8, background: "none", border: "none", color: "#818cf8", cursor: "pointer" }}>
                    <RotateCcw size={16} />
                  </button>
                </div>
              </form>

              {selectedShip && (
                <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: "50%",
                    background: "#22c55e", boxShadow: "0 0 8px #22c55e"
                  }} />
                  <span style={{ color: "#86efac", fontSize: 12, fontWeight: 700 }}>
                    {selectedShip} selected
                  </span>
                  <button
                    onClick={() => loadShipmentData(selectedShip)}
                    style={{ marginLeft: "auto", ...btnSecondary, padding: "5px 12px", fontSize: 11 }}
                  >
                    <RefreshCw size={12} /> Refresh
                  </button>
                </div>
              )}
            </div>

            {/* POD Upload */}
            <div style={{ ...card, animation: "fadeUp .5s ease .2s both" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
                <Upload size={18} color="#818cf8" />
                <h2 style={{ color: darkMode ? "#e0e7ff" : "#1e1b4b", fontWeight: 800, fontSize: 15, margin: 0 }}>
                  POD Upload
                </h2>
                <span style={{ fontSize: 10, color: "#6366f1", background: "rgba(99,102,241,0.15)", padding: "2px 8px", borderRadius: 20, fontWeight: 700 }}>
                  PDF / Image
                </span>
              </div>

              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${podFile ? "#6366f1" : (darkMode ? "#312e81" : "#cbd5e1")}`,
                  borderRadius: 12,
                  padding: "24px 16px",
                  textAlign: "center",
                  cursor: "pointer",
                  transition: "all .2s",
                  background: podFile ? "rgba(99,102,241,0.08)" : (darkMode ? "transparent" : "rgba(255,255,255,0.5)"),
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files[0];
                  if (f) { setPodFile(f); setFormData(null); }
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,image/*"
                  style={{ display: "none" }}
                  onChange={(e) => { setPodFile(e.target.files[0]); setFormData(null); }}
                />
                {podFile ? (
                  <div>
                    <FileText size={28} color="#6366f1" style={{ margin: "0 auto 8px" }} />
                    <p style={{ color: "#a5b4fc", fontWeight: 700, margin: "0 0 4px", fontSize: 13 }}>{podFile.name}</p>
                    <p style={{ color: "#6b7280", fontSize: 11 }}>
                      {(podFile.size / 1024).toFixed(1)} KB — click to change
                    </p>
                  </div>
                ) : (
                  <div>
                    <Upload size={28} color="#4338ca" style={{ margin: "0 auto 10px", opacity: 0.6 }} />
                    <p style={{ color: "#818cf8", fontWeight: 600, margin: 0, fontSize: 13 }}>
                      Drop POD documents here
                    </p>
                    <p style={{ color: "#4338ca", fontSize: 11, marginTop: 4 }}>PDF, JPG, PNG supported</p>
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                {podFile && (
                  <button
                    onClick={() => { setPodFile(null); setFormData(null); }}
                    style={{ ...btnSecondary, padding: "10px 16px" }}
                  >
                    <X size={14} />
                  </button>
                )}
                <button
                  className="btn-hover"
                  onClick={handleExtract}
                  disabled={!podFile || extracting}
                  style={{
                    ...btnPrimary, flex: 1,
                    opacity: (!podFile || extracting) ? (darkMode ? 0.5 : 0.8) : 1,
                    justifyContent: "center",
                    padding: "10px 20px",
                    fontSize: 14
                  }}
                >
                  {extracting
                    ? <><Loader2 size={16} className="animate-spin" /> Analyzing…</>
                    : <><Zap size={16} /> Auto-Extract</>}
                </button>
              </div>
            </div>

            {/* Tracking Event Form (shown after OCR) */}
            {formData && (
              <div style={{ ...card, animation: "fadeUp .4s ease both" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <MapPin size={18} color="#818cf8" />
                    <h2 style={{ color: darkMode ? "#e0e7ff" : "#1e1b4b", fontWeight: 800, fontSize: 15, margin: 0 }}>
                      Event Details
                    </h2>
                  </div>
                  <button onClick={() => setFormData(null)} style={{ background: "none", border: "none", color: "#4338ca", cursor: "pointer" }}>
                    <X size={18} />
                  </button>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {field("Shipment GID", "shipmentGid")}
                  {field("Status Code", "statusCodeGid", "text", [
                    { value: "D1", label: "D1 – Delivered" },
                    { value: "X1", label: "X1 – In Transit" },
                    { value: "P1", label: "P1 – Picked Up" },
                    { value: "A1", label: "A1 – Arrived" },
                    { value: "C1", label: "C1 – Cancelled" },
                  ])}
                  {field("Responsible Party", "responsiblePartyGid", "text", ["CARRIER", "SHIPPER", "RECEIVER"])}
                  {field("Event Date", "eventDate")}
                </div>

                <div style={{ marginTop: 14 }}>
                  <label style={{ fontSize: 10, fontWeight: 900, color: darkMode ? "#a5b4fc" : "#4338ca", textTransform: "uppercase", letterSpacing: 1 }}>
                    Remarks
                  </label>
                  <textarea
                    value={formData.remarks || ""}
                    onChange={(e) => setFormData((p) => ({ ...p, remarks: e.target.value }))}
                    rows={2}
                    style={{ ...inputStyle, marginTop: 4, resize: "none", fontSize: 13 }}
                  />
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
                  <button
                    onClick={() => setPreviewOpen(!previewOpen)}
                    style={{ ...btnSecondary, padding: "12px", height: 44 }}
                  >
                    <Eye size={16} />
                  </button>
                  <button
                    className="btn-hover"
                    onClick={handleSubmit}
                    disabled={submitting}
                    style={{
                      ...btnPrimary, flex: 1, justifyContent: "center",
                      opacity: submitting ? (darkMode ? 0.6 : 0.8) : 1,
                      padding: "12px", fontSize: 14, height: 44
                    }}
                  >
                    {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    Submit Event
                  </button>
                </div>

                {previewOpen && (
                  <div style={{
                    marginTop: 14, borderRadius: 10,
                    background: "#0d0a26", border: "1px solid #312e81",
                    padding: "12px 14px", overflow: "auto", maxHeight: 200
                  }}>
                    <pre style={{ color: "#a5b4fc", fontSize: 10, margin: 0, lineHeight: 1.4 }}>
                      {JSON.stringify({
                        shipmentGid: formData.shipmentGid,
                        statusCodeGid: formData.statusCodeGid,
                        responsiblePartyGid: formData.responsiblePartyGid,
                        eventDate: { value: formData.eventDate, timeZoneGid: formData.timeZoneGid || "Asia/Kolkata" },
                        remarks: formData.remarks
                      }, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── COLUMN 2: TIMELINE ── */}
          <div style={{ ...card, animation: "fadeUp .5s ease .3s both", display: "flex", flexDirection: "column", height: "calc(100vh - 180px)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Clock size={18} color="#818cf8" />
                <h2 style={{ color: darkMode ? "#e0e7ff" : "#1e1b4b", fontWeight: 800, fontSize: 15, margin: 0 }}>
                  Timeline
                </h2>
                {history.length > 0 && (
                  <span style={{
                    background: "rgba(99,102,241,0.2)", color: "#a5b4fc",
                    borderRadius: 20, padding: "2px 8px", fontSize: 11, fontWeight: 800
                  }}>
                    {history.length}
                  </span>
                )}
              </div>
              {selectedShip && (
                <button onClick={() => loadShipmentData(selectedShip)} style={{ ...btnSecondary, padding: "6px 14px", height: 32 }}>
                  <RefreshCw size={13} />
                </button>
              )}
            </div>

            <div style={{ flex: 1, overflowY: "auto", paddingRight: 4 }}>
              {loading ? (
                <div style={{ textAlign: "center", padding: "60px 0", color: "#818cf8" }}>
                  <Loader2 size={32} style={{ margin: "0 auto 10px", animation: "spin 1s linear infinite" }} />
                  <p style={{ fontSize: 13 }}>Loading history…</p>
                </div>
              ) : history.length === 0 ? (
                <div style={{ textAlign: "center", padding: "60px 0", color: darkMode ? "#4338ca" : "#6366f1" }}>
                  <Package size={48} style={{ margin: "0 auto 12px", opacity: 0.5 }} />
                  <p style={{ fontSize: 14, fontWeight: 600 }}>{selectedShip ? "Empty records" : "Select shipment"}</p>
                </div>
              ) : (
                <Timeline events={history} darkMode={darkMode} />
              )}
            </div>
          </div>

          {/* ── COLUMN 3: DOCUMENTS ── */}
          <div style={{ ...card, animation: "fadeUp .5s ease .4s both", display: "flex", flexDirection: "column", height: "calc(100vh - 180px)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <FileText size={18} color="#818cf8" />
              <h2 style={{ color: darkMode ? "#e0e7ff" : "#1e1b4b", fontWeight: 800, fontSize: 15, margin: 0 }}>
                Documents
              </h2>
              <span style={{
                background: "rgba(99,102,241,0.2)", color: "#a5b4fc",
                borderRadius: 20, padding: "2px 8px", fontSize: 11, fontWeight: 800
              }}>
                {docs.length}
              </span>
            </div>
            
            <div style={{ flex: 1, overflowY: "auto", paddingRight: 4 }}>
              {loading ? (
                 <div style={{ textAlign: "center", padding: "40px 0" }}>
                   <Loader2 size={24} className="animate-spin" style={{ margin: "auto", color: "#6366f1" }} />
                 </div>
              ) : docs.length === 0 ? (
                <div style={{ textAlign: "center", padding: "32px 0", color: darkMode ? "#64748b" : "#475569", border: darkMode ? "1px dashed rgba(255,255,255,0.05)" : "1px dashed rgba(148,163,184,0.4)", borderRadius: 16 }}>
                  <p style={{ fontSize: 13, margin: 0 }}>No attachments</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {docs.map(doc => (
                    <div key={doc.docGid} style={{ 
                      background: "rgba(99, 102, 241, 0.04)", padding: 12, borderRadius: 12, border: "1px solid rgba(99, 102, 241, 0.15)",
                      display: "flex", alignItems: "center", justifyContent: "space-between", transition: "all 0.3s ease",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.1)"
                    }} className="timeline-item">
                      <div style={{ overflow: "hidden", display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ 
                          width: 36, height: 36, borderRadius: 10, 
                          background: "linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(168, 85, 247, 0.2))", 
                          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                          border: "1px solid rgba(99, 102, 241, 0.3)"
                        }}>
                           <FileText size={16} color="#c084fc" />
                        </div>
                        <div style={{ overflow: "hidden" }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: darkMode ? "#f1f5f9" : "#0f172a", whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
                            {doc.filename || "Attachment"}
                          </div>
                          <div style={{ fontSize: 10, color: "#818cf8", fontWeight: 600 }}>{doc.docXid?.split('_').pop()}</div>
                        </div>
                      </div>
                      <button 
                        className="btn-hover"
                        onClick={() => window.open(`${API}/view-document/${doc.docGid}`, "_blank")}
                        style={{ 
                          ...btnSecondary, 
                          padding: "6px 14px", 
                          height: 32, 
                          fontSize: 11, 
                          background: darkMode ? "rgba(99, 102, 241, 0.1)" : "rgba(99, 102, 241, 0.15)",
                          color: darkMode ? "#a5b4fc" : "#4f46e5",
                          border: darkMode ? "1px solid rgba(99, 102, 241, 0.2)" : "1px solid rgba(99, 102, 241, 0.3)"
                        }}
                      >
                        Verify
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}
