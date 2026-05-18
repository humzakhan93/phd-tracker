import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";

// ─── Constants ────────────────────────────────────────────────────────────────
const OPERATORS = ["Uber", "Bolt", "Airport Transfer", "Local Operator", "Other"]; // legacy fallback only
const EXPENSE_CATS = ["Car Wash", "Insurance", "Phone", "TfL Licence", "Maintenance", "Parking", "Card Machine Fee", "Other"];
const PAYMENT_METHODS = ["Via Operator", "Cash", "Card (my machine)"];
const PAYMENT_ICONS = { "Via Operator": "🏢", "Cash": "💵", "Card (my machine)": "💳" };

// Quick-add operator presets for new users
const OPERATOR_PRESETS = [
  { name: "Uber", color: "#16A34A", commissionModel: "net", commissionPct: 0, hasConfigFee: false, defaultPayment: "Via Operator", notes: "Uber pays net — fare shown is what you keep" },
  { name: "Bolt", color: "#00C853", commissionModel: "net", commissionPct: 0, hasConfigFee: false, defaultPayment: "Via Operator", notes: "Bolt pays net — fare shown is what you keep" },
];
const HMRC_RATE_1 = 0.45;
const HMRC_RATE_2 = 0.25;
const HMRC_THRESHOLD = 10000;
const TAX_YEAR_START = "2025-04-06";

const PRESET_CHARGES = [
  { id: "luton_drop", label: "Luton Airport Drop-off", amount: 7.00 },
  { id: "luton_pickup", label: "Luton Airport Pick-up", amount: 7.00 },
  { id: "heathrow", label: "Heathrow Drop-off", amount: 7.00 },
  { id: "gatwick", label: "Gatwick Drop-off", amount: 10.00 },
  { id: "stansted", label: "Stansted Drop-off", amount: 10.00 },
  { id: "london_city", label: "London City Drop-off", amount: 8.00 },
  { id: "ulez", label: "ULEZ Charge", amount: 12.50 },
  { id: "congestion", label: "Congestion Charge", amount: 15.00 },
  { id: "dart", label: "Dart Charge", amount: 3.50 },
  { id: "m6", label: "M6 Toll (full route)", amount: 11.60 },
];

// ─── Draft autosave keys ──────────────────────────────────────────────────────
const DRAFT_JOB_KEY = "dl_draft_job";
const DRAFT_DAY_KEY = "dl_draft_day";
const QUICK_LOG_KEY = "dl_quick_log";

const fmt = (n) => `£${Math.abs(Number(n || 0)).toFixed(2)}`;
const today = () => new Date().toISOString().slice(0, 10);
const timeStr = (ts) => new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const dateStr = (ts) => new Date(ts).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const minsToHHMM = (m) => `${Math.floor(m / 60)}h ${Math.round(m % 60)}m`;

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function save(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }
function clearDraft(key) { try { localStorage.removeItem(key); } catch {} }

// ─── Google Fonts ─────────────────────────────────────────────────────────────
const fontLink = document.createElement("link");
fontLink.rel = "stylesheet";
fontLink.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap";
document.head.appendChild(fontLink);

// ─── Colours ──────────────────────────────────────────────────────────────────
const C = {
  bg: "#F4F6FA", surface: "#FFFFFF", card: "#FFFFFF", border: "#E8ECF2",
  accent: "#F5A623", accentDark: "#D4891A",
  green: "#16A34A", greenBg: "#F0FDF4", greenBorder: "#BBF7D0",
  red: "#DC2626", redBg: "#FFF5F5", redBorder: "#FECACA",
  blue: "#2563EB", blueBg: "#EFF6FF", blueBorder: "#BFDBFE",
  orange: "#EA580C", orangeBg: "#FFF7ED",
  text: "#111827", sub: "#6B7280", muted: "#9CA3AF", light: "#F9FAFB",
};
const FONT = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif";
const OP_COLOR = { Uber: C.green, Bolt: "#16A34A", "Airport Transfer": C.blue, "Local Operator": C.orange, Other: "#6B7280" };

// ─── Shared UI ────────────────────────────────────────────────────────────────
const inputStyle = {
  width: "100%", background: "#F9FAFB", border: `1.5px solid ${C.border}`,
  color: C.text, padding: "12px 14px", fontSize: "15px",
  fontFamily: FONT, borderRadius: "10px", boxSizing: "border-box", outline: "none",
  fontWeight: "500",
};
const selectStyle = { ...inputStyle, appearance: "none" };

function Pill({ label, color = C.accent }) {
  const bgMap = { [C.green]: C.greenBg, [C.blue]: C.blueBg, [C.orange]: C.orangeBg };
  return (
    <span style={{
      display: "inline-block", background: bgMap[color] || "#F3F4F6", color,
      borderRadius: "20px", padding: "3px 10px", fontSize: "11px",
      fontWeight: "600", fontFamily: FONT,
    }}>{label}</span>
  );
}

function SectionTitle({ children }) {
  return (
    <div style={{
      fontSize: "11px", fontWeight: "700", textTransform: "uppercase",
      letterSpacing: "0.08em", color: C.muted, marginBottom: "12px",
      paddingBottom: "10px", borderBottom: `1px solid ${C.border}`, fontFamily: FONT,
    }}>{children}</div>
  );
}

function Tooltip({ text }) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-block", marginLeft: "6px" }}>
      <button onClick={() => setShow(s => !s)} style={{
        width: "18px", height: "18px", borderRadius: "50%",
        background: C.blue, color: "#fff", border: "none",
        fontSize: "11px", fontWeight: "700", cursor: "pointer",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontFamily: FONT, flexShrink: 0,
      }}>?</button>
      {show && (
        <div style={{
          position: "absolute", bottom: "26px", left: "50%", transform: "translateX(-50%)",
          background: C.text, color: "#fff", borderRadius: "10px", padding: "10px 12px",
          fontSize: "12px", lineHeight: "1.6", width: "220px", zIndex: 50,
          boxShadow: "0 4px 16px rgba(0,0,0,0.2)", fontFamily: FONT,
        }}>
          {text}
          <div style={{ position: "absolute", bottom: "-6px", left: "50%", transform: "translateX(-50%)", width: 0, height: 0, borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderTop: `6px solid ${C.text}` }} />
        </div>
      )}
    </span>
  );
}

function FieldLabel({ label, tooltip }) {
  return (
    <div style={{ fontSize: "13px", fontWeight: "600", color: C.text, marginBottom: "6px", fontFamily: FONT, display: "flex", alignItems: "center" }}>
      {label}
      {tooltip && <Tooltip text={tooltip} />}
    </div>
  );
}

function Field({ label, hint, tooltip, children }) {
  return (
    <div style={{ marginBottom: "14px" }}>
      <FieldLabel label={label} tooltip={tooltip} />
      {hint && <div style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", fontFamily: FONT }}>{hint}</div>}
      {children}
    </div>
  );
}
function Input({ label, hint, tooltip, ...props }) {
  return <Field label={label} hint={hint} tooltip={tooltip}><input style={inputStyle} {...props} /></Field>;
}
function Select({ label, tooltip, options, ...props }) {
  return (
    <Field label={label} tooltip={tooltip}>
      <select style={selectStyle} {...props}>{options.map(o => <option key={o}>{o}</option>)}</select>
    </Field>
  );
}
function Btn({ children, onClick, disabled, color = C.accent, outline, full = true, big }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width: full ? "100%" : "auto",
      background: outline ? "transparent" : disabled ? "#E5E7EB" : color,
      color: outline ? color : disabled ? C.muted : "#fff",
      border: outline ? `2px solid ${color}` : "none",
      padding: big ? "16px" : "13px 16px",
      fontSize: big ? "15px" : "14px", fontWeight: "700", fontFamily: FONT,
      borderRadius: "12px", cursor: disabled ? "not-allowed" : "pointer",
      transition: "all 0.15s", letterSpacing: "0.01em",
      boxShadow: disabled || outline ? "none" : "0 2px 8px rgba(0,0,0,0.12)",
    }}>{children}</button>
  );
}
function StatCard({ label, value, sub, color = C.accent }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "16px", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
      <div style={{ fontSize: "11px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.06em", color: C.sub, fontFamily: FONT }}>{label}</div>
      <div style={{ fontSize: "24px", color, fontWeight: "800", marginTop: "6px", lineHeight: 1, fontFamily: FONT }}>{value}</div>
      {sub && <div style={{ fontSize: "11px", color: C.muted, marginTop: "5px", fontFamily: FONT }}>{sub}</div>}
    </div>
  );
}
function Row({ label, value, color = C.text, bold }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${C.border}`, fontFamily: FONT }}>
      <span style={{ fontSize: "14px", color: C.sub }}>{label}</span>
      <span style={{ fontSize: "14px", color, fontWeight: bold ? "700" : "500" }}>{value}</span>
    </div>
  );
}

function TabIntro({ storageKey, icon, title, body }) {
  const [dismissed, setDismissed] = useState(() => load(storageKey, false));
  if (dismissed) return null;
  return (
    <div style={{ background: C.blueBg, border: `1px solid ${C.blueBorder}`, borderRadius: "14px", padding: "16px", marginBottom: "18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ fontSize: "15px", fontWeight: "700", color: C.blue, marginBottom: "6px", fontFamily: FONT }}>{icon} {title}</div>
        <button onClick={() => { setDismissed(true); save(storageKey, true); }} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: "18px", lineHeight: 1, padding: "0 0 0 10px" }}>×</button>
      </div>
      <div style={{ fontSize: "13px", color: C.sub, lineHeight: "1.7", fontFamily: FONT }}>{body}</div>
    </div>
  );
}

function useElapsed(startTs) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!startTs) return;
    const tick = () => setElapsed(Math.floor((Date.now() - startTs) / 1000));
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [startTs]);
  return `${Math.floor(elapsed / 3600)}h ${Math.floor((elapsed % 3600) / 60)}m`;
}

// ─── Start Shift Modal ────────────────────────────────────────────────────────
function StartShiftModal({ onStart, onCancel }) {
  const [mileageMode, setMileageMode] = useState(null);
  const [odometerStart, setOdometerStart] = useState("");

  function confirmStart() {
    onStart({ id: Date.now(), startTs: Date.now(), mileageMode: mileageMode || "skip", startOdometer: mileageMode === "odometer" ? (parseFloat(odometerStart) || null) : null });
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div style={{ background: C.surface, borderRadius: "24px 24px 0 0", padding: "24px 22px 40px", boxShadow: "0 -4px 30px rgba(0,0,0,0.15)" }}>
        <div style={{ fontSize: "12px", color: C.sub, fontWeight: "600", marginBottom: "4px", fontFamily: FONT }}>Starting shift</div>
        <div style={{ fontSize: "28px", fontWeight: "800", color: C.text, marginBottom: "4px", fontFamily: FONT }}>
          {new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
        </div>
        <div style={{ fontSize: "13px", color: C.sub, marginBottom: "24px", fontFamily: FONT }}>{dateStr(Date.now())}</div>
        <div style={{ fontSize: "13px", fontWeight: "600", color: C.text, marginBottom: "12px", fontFamily: FONT }}>How do you want to track mileage?</div>
        <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
          {[
            { id: "trip", label: "📍 Trip Meter", desc: "Enter miles driven at end of shift" },
            { id: "odometer", label: "🔢 Odometer", desc: "Enter total reading now & at end" },
          ].map(opt => (
            <button key={opt.id} onClick={() => setMileageMode(opt.id)} style={{
              flex: 1, padding: "14px 10px", textAlign: "left",
              background: mileageMode === opt.id ? "#FFF7ED" : C.light,
              border: `2px solid ${mileageMode === opt.id ? C.accent : C.border}`,
              borderRadius: "14px", cursor: "pointer", fontFamily: FONT,
            }}>
              <div style={{ fontSize: "13px", fontWeight: "700", marginBottom: "4px", color: mileageMode === opt.id ? C.accent : C.text }}>{opt.label}</div>
              <div style={{ fontSize: "11px", color: C.sub, lineHeight: "1.4" }}>{opt.desc}</div>
            </button>
          ))}
        </div>
        {mileageMode === "odometer" && (
          <Input label="Current odometer reading (miles)" hint="Check your dashboard — total miles on the car" type="number" placeholder="e.g. 48234" value={odometerStart} onChange={e => setOdometerStart(e.target.value)} />
        )}
        <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
          <button onClick={onCancel} style={{ padding: "13px 20px", background: C.light, border: `1px solid ${C.border}`, borderRadius: "12px", color: C.sub, fontFamily: FONT, fontWeight: "600", fontSize: "14px", cursor: "pointer" }}>Cancel</button>
          <div style={{ flex: 1 }}><Btn big onClick={confirmStart} color={C.green}>🟢 Start Shift</Btn></div>
        </div>
        <button onClick={() => onStart({ id: Date.now(), startTs: Date.now(), mileageMode: "skip", startOdometer: null })}
          style={{ background: "none", border: "none", color: C.muted, fontSize: "12px", marginTop: "14px", cursor: "pointer", fontFamily: FONT, width: "100%", textAlign: "center" }}>
          Skip mileage tracking for this shift
        </button>
      </div>
    </div>
  );
}

// ─── End Shift Modal ──────────────────────────────────────────────────────────
function EndShiftModal({ shift, jobs, onComplete, onCancel }) {
  const [step, setStep] = useState("mileage");
  const [tripMiles, setTripMiles] = useState("");
  const [odometerEnd, setOdometerEnd] = useState("");
  const [hasFuel, setHasFuel] = useState(null);
  const [fuelCost, setFuelCost] = useState("");
  const [fuelLitres, setFuelLitres] = useState("");
  const [hasTolls, setHasTolls] = useState(null);
  const [selectedCharges, setSelectedCharges] = useState({});
  const [customChargeAmts, setCustomChargeAmts] = useState({});
  const [hasOther, setHasOther] = useState(null);
  const [otherCat, setOtherCat] = useState(EXPENSE_CATS[0]);
  const [otherAmt, setOtherAmt] = useState("");
  const [otherNote, setOtherNote] = useState("");
  const [extraExpenses, setExtraExpenses] = useState([]);

  const endTs = Date.now();
  const shiftMins = (endTs - shift.startTs) / 60000;
  const shiftJobs = jobs.filter(j => j.shiftId === shift.id);
  const shiftGross = shiftJobs.reduce((s, j) => s + (j.fare || 0), 0);
  const shiftNet = shiftJobs.reduce((s, j) => s + (j.netEarnings || 0), 0);

  const shiftMiles = shift.mileageMode === "trip"
    ? (parseFloat(tripMiles) || null)
    : shift.mileageMode === "odometer" && shift.startOdometer
    ? (parseFloat(odometerEnd) - shift.startOdometer || null)
    : null;

  function toggleCharge(id) { setSelectedCharges(prev => ({ ...prev, [id]: !prev[id] })); }

  function confirmTolls() {
    const tollExpenses = PRESET_CHARGES
      .filter(c => selectedCharges[c.id])
      .map(c => ({ id: Date.now() + Math.random(), category: c.label, amount: parseFloat(customChargeAmts[c.id] || c.amount), date: today(), notes: "End of shift" }));
    setExtraExpenses(prev => [...prev, ...tollExpenses]);
    setStep("other");
  }

  function handleOther(ans) {
    setHasOther(ans);
    if (!ans) setStep("summary");
  }
  function addOther() {
    if (!otherAmt) return;
    setExtraExpenses(prev => [...prev, { id: Date.now(), category: otherCat, amount: parseFloat(otherAmt), date: today(), notes: otherNote }]);
    setOtherAmt(""); setOtherNote("");
    setStep("summary");
  }

  function finish() {
    onComplete({
      endTs, shiftMiles: shiftMiles || 0,
      endOdometer: shift.mileageMode === "odometer" ? parseFloat(odometerEnd) || null : null,
      fuelLog: hasFuel && fuelCost ? { id: Date.now(), date: today(), cost: parseFloat(fuelCost), litres: parseFloat(fuelLitres) || 0, mileage: parseFloat(odometerEnd) || 0, notes: "End of shift fill-up" } : null,
      expenses: extraExpenses,
    });
  }

  const steps = ["mileage", "fuel", "tolls", "other", "summary"];
  const stepIdx = steps.indexOf(step);

  const YesNo = ({ onYes, onNo }) => (
    <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
      <button onClick={onNo} style={{ flex: 1, padding: "16px", background: C.light, border: `1px solid ${C.border}`, borderRadius: "12px", color: C.sub, fontSize: "14px", fontWeight: "600", fontFamily: FONT, cursor: "pointer" }}>No, skip</button>
      <button onClick={onYes} style={{ flex: 1, padding: "16px", background: "#FFF7ED", border: `2px solid ${C.accent}`, borderRadius: "12px", color: C.accent, fontSize: "14px", fontWeight: "700", fontFamily: FONT, cursor: "pointer" }}>Yes, add it</button>
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, overflowY: "auto" }}>
      <div style={{ background: C.surface, margin: "16px", borderRadius: "20px", padding: "22px", marginBottom: "40px", boxShadow: "0 8px 40px rgba(0,0,0,0.15)" }}>
        <div style={{ fontSize: "12px", color: C.sub, fontWeight: "600", marginBottom: "4px", fontFamily: FONT }}>Ending shift</div>
        <div style={{ fontSize: "20px", fontWeight: "800", color: C.red, marginBottom: "16px", fontFamily: FONT }}>
          {step === "summary" ? "Shift Complete" : step === "mileage" ? "Mileage" : step === "fuel" ? "Fuel Fill-Up?" : step === "tolls" ? "Tolls & Charges?" : "Other Expenses?"}
        </div>
        <div style={{ display: "flex", gap: "5px", marginBottom: "22px" }}>
          {steps.map((s, i) => (<div key={s} style={{ flex: 1, height: "4px", borderRadius: "2px", background: i <= stepIdx ? C.accent : C.border }} />))}
        </div>

        {step === "mileage" && (
          <>
            <div style={{ background: C.light, borderRadius: "12px", padding: "14px", marginBottom: "18px", fontSize: "13px", color: C.sub, lineHeight: "1.9", fontFamily: FONT }}>
              <div>Started: <span style={{ color: C.text, fontWeight: "600" }}>{timeStr(shift.startTs)} · {dateStr(shift.startTs)}</span></div>
              <div>Duration: <span style={{ color: C.accent, fontWeight: "700" }}>{minsToHHMM(shiftMins)}</span></div>
              <div>Jobs logged: <span style={{ color: C.text, fontWeight: "600" }}>{shiftJobs.length}</span></div>
            </div>
            {shift.mileageMode === "trip" && (
              <Input label="Miles driven this shift" tooltip="Check your trip meter on the dashboard. Reset it at the start of each shift for easy reading." type="number" placeholder="e.g. 87" value={tripMiles} onChange={e => setTripMiles(e.target.value)} />
            )}
            {shift.mileageMode === "odometer" && (
              <>
                {shift.startOdometer && (
                  <div style={{ background: C.light, borderRadius: "8px", padding: "10px 12px", fontSize: "13px", color: C.sub, marginBottom: "12px", fontFamily: FONT }}>
                    Odometer at start: <span style={{ color: C.text, fontWeight: "700" }}>{shift.startOdometer.toLocaleString()} mi</span>
                  </div>
                )}
                <Input label="Odometer reading now (miles)" tooltip="The total mileage shown on your dashboard — not the trip meter." type="number" placeholder="e.g. 48512" value={odometerEnd} onChange={e => setOdometerEnd(e.target.value)} />
                {odometerEnd && shift.startOdometer && (
                  <div style={{ background: C.greenBg, border: `1px solid ${C.greenBorder}`, borderRadius: "8px", padding: "10px 12px", fontSize: "13px", color: C.green, marginBottom: "12px", fontWeight: "700", fontFamily: FONT }}>
                    Shift miles: {(parseFloat(odometerEnd) - shift.startOdometer).toFixed(0)} mi
                  </div>
                )}
              </>
            )}
            {shift.mileageMode === "skip" && <div style={{ color: C.sub, fontSize: "13px", marginBottom: "16px", fontFamily: FONT }}>Mileage tracking was skipped for this shift.</div>}
            <Btn onClick={() => setStep("fuel")} color={C.accent}>Next →</Btn>
            <button onClick={onCancel} style={{ background: "none", border: "none", color: C.muted, fontSize: "13px", marginTop: "12px", cursor: "pointer", fontFamily: FONT, width: "100%", textAlign: "center" }}>
              Cancel — keep shift open
            </button>
          </>
        )}

        {step === "fuel" && (
          <>
            <div style={{ fontSize: "14px", color: C.sub, marginBottom: "18px", lineHeight: "1.6", fontFamily: FONT }}>Did you fill up with fuel during or at the end of this shift?</div>
            {hasFuel === null && <YesNo onYes={() => setHasFuel(true)} onNo={() => { setHasFuel(false); setStep("tolls"); }} />}
            {hasFuel === true && (
              <>
                <Input label="Total fuel cost (£)" type="number" placeholder="e.g. 68.00" value={fuelCost} onChange={e => setFuelCost(e.target.value)} />
                <Input label="Litres (optional)" type="number" placeholder="e.g. 50" value={fuelLitres} onChange={e => setFuelLitres(e.target.value)} />
                <Btn onClick={() => setStep("tolls")} disabled={!fuelCost}>Save & Next →</Btn>
              </>
            )}
          </>
        )}

        {step === "tolls" && (
          <>
            <div style={{ fontSize: "14px", color: C.sub, marginBottom: "14px", lineHeight: "1.6", fontFamily: FONT }}>
              Select any charges you paid today. Tap to select, amounts are pre-filled but you can edit them.
            </div>
            {PRESET_CHARGES.map(c => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", background: selectedCharges[c.id] ? "#FFF7ED" : C.light, border: `1.5px solid ${selectedCharges[c.id] ? C.accent : C.border}`, borderRadius: "10px", marginBottom: "8px", cursor: "pointer" }} onClick={() => toggleCharge(c.id)}>
                <div style={{ width: "20px", height: "20px", borderRadius: "6px", background: selectedCharges[c.id] ? C.accent : C.border, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {selectedCharges[c.id] && <span style={{ color: "#fff", fontSize: "12px", fontWeight: "700" }}>✓</span>}
                </div>
                <div style={{ flex: 1, fontSize: "13px", fontWeight: "600", color: C.text, fontFamily: FONT }}>{c.label}</div>
                {selectedCharges[c.id] && (
                  <input type="number" value={customChargeAmts[c.id] ?? c.amount} onClick={e => e.stopPropagation()} onChange={e => setCustomChargeAmts(prev => ({ ...prev, [c.id]: e.target.value }))} style={{ ...inputStyle, width: "80px", padding: "6px 10px", fontSize: "14px", textAlign: "right" }} />
                )}
                {!selectedCharges[c.id] && <span style={{ fontSize: "13px", color: C.muted, fontFamily: FONT }}>{fmt(c.amount)}</span>}
              </div>
            ))}
            <div style={{ marginTop: "14px", display: "flex", gap: "10px" }}>
              <button onClick={() => setStep("other")} style={{ flex: 1, padding: "13px", background: C.light, border: `1px solid ${C.border}`, borderRadius: "12px", color: C.sub, fontSize: "14px", fontWeight: "600", fontFamily: FONT, cursor: "pointer" }}>Skip</button>
              <div style={{ flex: 1 }}><Btn onClick={confirmTolls} color={C.accent}>Save & Next →</Btn></div>
            </div>
          </>
        )}

        {step === "other" && (
          <>
            <div style={{ fontSize: "14px", color: C.sub, marginBottom: "18px", lineHeight: "1.6", fontFamily: FONT }}>Any other expenses today? Car wash, phone top-up, anything else?</div>
            {hasOther === null && <YesNo onYes={() => setHasOther(true)} onNo={() => handleOther(false)} />}
            {hasOther === true && (
              <>
                <Select label="Category" options={EXPENSE_CATS} value={otherCat} onChange={e => setOtherCat(e.target.value)} />
                <Input label="Amount (£)" type="number" placeholder="e.g. 12.00" value={otherAmt} onChange={e => setOtherAmt(e.target.value)} />
                <Input label="Notes (optional)" type="text" placeholder="e.g. hand car wash Luton" value={otherNote} onChange={e => setOtherNote(e.target.value)} />
                <Btn onClick={addOther} disabled={!otherAmt}>Save & Next →</Btn>
              </>
            )}
          </>
        )}

        {step === "summary" && (
          <>
            <div style={{ background: C.light, borderRadius: "12px", padding: "16px", marginBottom: "16px" }}>
              <SectionTitle>Shift Summary</SectionTitle>
              <Row label="Date" value={dateStr(shift.startTs)} />
              <Row label="Start time" value={timeStr(shift.startTs)} />
              <Row label="End time" value={timeStr(endTs)} />
              <Row label="Duration" value={minsToHHMM(shiftMins)} />
              {shiftMiles > 0 && <Row label="Miles driven" value={`${shiftMiles.toFixed(0)} mi`} color={C.accent} />}
              <Row label="Jobs" value={shiftJobs.length} />
              <Row label="Gross fares" value={fmt(shiftGross)} />
              <Row label="Net earnings" value={fmt(shiftNet)} color={C.green} bold />
            </div>
            {(hasFuel || extraExpenses.length > 0) && (
              <div style={{ background: C.redBg, border: `1px solid ${C.redBorder}`, borderRadius: "12px", padding: "16px", marginBottom: "16px" }}>
                <SectionTitle>Expenses Added</SectionTitle>
                {hasFuel && fuelCost && <Row label="Fuel" value={`− ${fmt(parseFloat(fuelCost))}`} color={C.red} />}
                {extraExpenses.map((e, i) => <Row key={i} label={e.category} value={`− ${fmt(e.amount)}`} color={C.red} />)}
              </div>
            )}
            <Btn big onClick={finish} color={C.green}>✓ Save & End Shift</Btn>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Auth Screen ──────────────────────────────────────────────────────────────
function AuthScreen({ authMode, setAuthMode }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function handleAuth() {
    setBusy(true); setMessage("");
    const result = authMode === "login"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });
    if (result.error) { setMessage(result.error.message); }
    else if (authMode === "signup") { setMessage("Account created. Please check your email to confirm your account."); }
    setBusy(false);
  }

  async function handleForgotPassword() {
    if (!email) { setMessage("Enter your email address first, then click Forgot password."); return; }
    setBusy(true); setMessage("");
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    if (error) { setMessage(error.message); } else { setMessage("Password reset email sent. Please check your inbox."); }
    setBusy(false);
  }

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", fontFamily: FONT }}>
      <div style={{ width: "100%", maxWidth: "420px", background: C.card, border: `1px solid ${C.border}`, borderRadius: "22px", padding: "26px", boxShadow: "0 18px 45px rgba(15,23,42,0.08)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
          <img src="/logo.png" alt="Driver Ledger" style={{ width: "40px", height: "40px", borderRadius: "10px", objectFit: "contain" }} />
          <div>
            <div style={{ fontSize: "20px", fontWeight: "800", color: C.text, fontFamily: FONT }}>Driver Ledger</div>
            <div style={{ fontSize: "12px", color: C.sub, fontFamily: FONT }}>Private Hire · Business Manager</div>
          </div>
        </div>
        <p style={{ marginTop: "0", marginBottom: "20px", color: C.sub, fontSize: "14px", fontFamily: FONT }}>
          Sign in to securely save your jobs, shifts, expenses and mileage in the cloud.
        </p>
        <div style={{ display: "grid", gap: "12px" }}>
          <input style={inputStyle} type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleAuth(); }} />
          <input style={inputStyle} type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleAuth(); }} />
          <Btn onClick={handleAuth} disabled={busy || !email || !password}>
            {busy ? "Please wait..." : authMode === "login" ? "Log in" : "Create account"}
          </Btn>
          {message && <p style={{ color: C.sub, fontSize: "14px", lineHeight: 1.5, margin: 0, fontFamily: FONT }}>{message}</p>}
          {authMode === "login" && (
            <button onClick={handleForgotPassword} disabled={busy} style={{ background: "none", border: "none", color: C.sub, fontWeight: "600", cursor: busy ? "not-allowed" : "pointer", fontFamily: FONT, marginTop: "4px" }}>
              Forgot password?
            </button>
          )}
          <button onClick={() => setAuthMode(authMode === "login" ? "signup" : "login")} style={{ background: "none", border: "none", color: C.blue, fontWeight: "700", cursor: "pointer", fontFamily: FONT, marginTop: "8px" }}>
            {authMode === "login" ? "Need an account? Create one" : "Already have an account? Log in"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState("login");
  const [tab, setTab] = useState("dashboard");
  const [cloudStatus, setCloudStatus] = useState("Saved to cloud");
  const [cloudLoaded, setCloudLoaded] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef(null);

  const [jobs, setJobs] = useState(() => load("phd_jobs", []));
  const [expenses, setExpenses] = useState(() => load("phd_expenses", []));
  const [fuelLogs, setFuelLogs] = useState(() => load("phd_fuel", []));
  const [shifts, setShifts] = useState(() => load("phd_shifts", []));
  const [activeShift, setActiveShift] = useState(() => load("phd_active_shift", null));
  const [settings, setSettings] = useState(() => load("phd_settings", { fuelCostPerMile: 0.18, cardFeePct: 1.69, operators: [] }));
  const [showStart, setShowStart] = useState(false);
  const [showEnd, setShowEnd] = useState(false);

  // Close menu when tapping outside
  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowUserMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("touchstart", handleClick);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("touchstart", handleClick);
    };
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session); setCloudLoaded(false); setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") setCloudLoaded(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => { save("phd_jobs", jobs); }, [jobs]);
  useEffect(() => { save("phd_expenses", expenses); }, [expenses]);
  useEffect(() => { save("phd_fuel", fuelLogs); }, [fuelLogs]);
  useEffect(() => { save("phd_shifts", shifts); }, [shifts]);
  useEffect(() => { save("phd_active_shift", activeShift); }, [activeShift]);
  useEffect(() => { save("phd_settings", settings); }, [settings]);

  async function loadCloudData() {
    if (!session?.user?.id) return;
    const { data, error } = await supabase.from("app_data").select("*").eq("user_id", session.user.id).single();
    if (error && error.code !== "PGRST116") { console.error("Cloud load error:", error); setCloudStatus("Cloud load failed"); setCloudLoaded(true); return; }
    const hasLocalData = jobs.length > 0 || expenses.length > 0 || fuelLogs.length > 0 || shifts.length > 0 || activeShift;
    const cloudIsEmpty = !data || ((!data.jobs || data.jobs.length === 0) && (!data.expenses || data.expenses.length === 0) && (!data.fuel_logs || data.fuel_logs.length === 0) && (!data.shifts || data.shifts.length === 0) && !data.active_shift);
    if (cloudIsEmpty && hasLocalData) { await saveCloudData(); setCloudLoaded(true); return; }
    if (data) {
      setJobs(data.jobs || []);
      setExpenses(data.expenses || []);
      setFuelLogs(data.fuel_logs || []);
      setShifts(data.shifts || []);
      setActiveShift(data.active_shift || null);
      setSettings(data.settings || { fuelCostPerMile: 0.18 });
    } else { await saveCloudData(); }
    setCloudLoaded(true);
  }

  async function saveCloudData() {
    if (!session?.user?.id) return;
    setCloudStatus("Saving...");
    const payload = { user_id: session.user.id, jobs, expenses, fuel_logs: fuelLogs, shifts, active_shift: activeShift, settings, updated_at: new Date().toISOString() };
    const { error } = await supabase.from("app_data").upsert(payload, { onConflict: "user_id" });
    if (error) { console.error("Cloud save error:", error); setCloudStatus("Save failed"); }
    else { setCloudStatus("Saved to cloud"); }
  }

  useEffect(() => { if (session?.user?.id && !cloudLoaded) loadCloudData(); }, [session?.user?.id, cloudLoaded]);
  useEffect(() => { if (session?.user?.id && cloudLoaded) saveCloudData(); }, [jobs, expenses, fuelLogs, shifts, activeShift, settings, session?.user?.id, cloudLoaded]);

  async function handleLogout() {
    setShowUserMenu(false);
    await supabase.auth.signOut();
    setCloudLoaded(false);
    setSession(null);
  }

  function handleStartShift(shiftData) { setActiveShift(shiftData); setShowStart(false); }
  function handleEndShift({ endTs, shiftMiles, endOdometer, fuelLog, expenses: newExp }) {
    setShifts(prev => [{ ...activeShift, endTs, shiftMiles, endOdometer }, ...prev]);
    setActiveShift(null);
    if (fuelLog) setFuelLogs(prev => [fuelLog, ...prev]);
    if (newExp?.length) setExpenses(prev => [...newExp, ...prev]);
    setShowEnd(false);
  }

  const tabs = [
    { id: "dashboard", label: "Home", icon: "🏠" },
    { id: "jobs", label: "Jobs", icon: "🚖" },
    { id: "expenses", label: "Costs", icon: "🧾" },
    { id: "mileage", label: "Miles", icon: "🛣️" },
    { id: "calc", label: "Fare Check", icon: "⚡" },
  ];

  if (authLoading) return <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", fontFamily: FONT }}>Loading...</div>;
  if (!session) return <AuthScreen authMode={authMode} setAuthMode={setAuthMode} />;
  if (!cloudLoaded) return <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", fontFamily: FONT }}>Loading your data...</div>;

  // Get user initials for avatar
  const userEmail = session?.user?.email || "";
  const userInitial = userEmail.charAt(0).toUpperCase();

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: FONT, paddingBottom: "72px" }}>

      {/* ── Header ── */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "12px 16px", display: "flex", alignItems: "center", gap: "10px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
        <img src="/logo.png" alt="Driver Ledger" style={{ width: "34px", height: "34px", borderRadius: "8px", objectFit: "contain" }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "16px", fontWeight: "800", color: C.text, fontFamily: FONT, lineHeight: 1.2 }}>Driver Ledger</div>
          <div style={{ fontSize: "10px", color: cloudStatus === "Save failed" ? C.red : cloudStatus === "Saving..." ? C.orange : C.green, fontFamily: FONT, fontWeight: "600", marginTop: "2px" }}>
            {cloudStatus === "Saving..." ? "⟳ Saving..." : cloudStatus === "Save failed" ? "✕ Save failed" : "✓ Saved to cloud"}
          </div>
        </div>
        {activeShift && (
          <div style={{ display: "flex", alignItems: "center", gap: "5px", background: C.greenBg, border: `1px solid ${C.greenBorder}`, borderRadius: "20px", padding: "4px 10px" }}>
            <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: C.green }} />
            <span style={{ fontSize: "10px", color: C.green, fontWeight: "600", fontFamily: FONT }}>On Shift</span>
          </div>
        )}

        {/* User avatar + menu */}
        <div ref={menuRef} style={{ position: "relative" }}>
          <button
            onClick={() => setShowUserMenu(s => !s)}
            style={{
              width: "36px", height: "36px", borderRadius: "50%",
              background: C.accent, color: "#fff", border: "none",
              fontSize: "14px", fontWeight: "800", cursor: "pointer",
              fontFamily: FONT, display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
            }}
          >{userInitial}</button>

          {showUserMenu && (
            <div style={{
              position: "absolute", top: "44px", right: 0,
              background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: "14px", padding: "8px", minWidth: "200px",
              boxShadow: "0 8px 30px rgba(0,0,0,0.12)", zIndex: 200,
            }}>
              <div style={{ padding: "8px 12px 10px", borderBottom: `1px solid ${C.border}`, marginBottom: "6px" }}>
                <div style={{ fontSize: "12px", color: C.sub, fontFamily: FONT }}>Signed in as</div>
                <div style={{ fontSize: "13px", fontWeight: "600", color: C.text, fontFamily: FONT, wordBreak: "break-all" }}>{userEmail}</div>
              </div>
              <button
                onClick={handleLogout}
                style={{
                  width: "100%", padding: "10px 12px", background: "none",
                  border: "none", borderRadius: "9px", color: C.red,
                  fontSize: "14px", fontWeight: "600", fontFamily: FONT,
                  cursor: "pointer", textAlign: "left",
                  display: "flex", alignItems: "center", gap: "8px",
                }}
                onMouseEnter={e => e.currentTarget.style.background = C.redBg}
                onMouseLeave={e => e.currentTarget.style.background = "none"}
              >
                <span>🚪</span> Log out
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Page content ── */}
      <div style={{ padding: "16px" }}>
        {tab === "dashboard" && <Dashboard jobs={jobs} expenses={expenses} fuelLogs={fuelLogs} shifts={shifts} activeShift={activeShift} settings={settings} onStartShift={() => setShowStart(true)} onEndShift={() => setShowEnd(true)} />}
        {tab === "jobs" && <Jobs jobs={jobs} setJobs={setJobs} expenses={expenses} setExpenses={setExpenses} settings={settings} activeShift={activeShift} />}
        {tab === "expenses" && <Expenses expenses={expenses} setExpenses={setExpenses} fuelLogs={fuelLogs} setFuelLogs={setFuelLogs} settings={settings} setSettings={setSettings} />}
        {tab === "mileage" && <Mileage jobs={jobs} shifts={shifts} setShifts={setShifts} fuelLogs={fuelLogs} />}
        {tab === "calc" && <FareCheck settings={settings} jobs={jobs} setJobs={setJobs} activeShift={activeShift} />}
      </div>

      {/* ── Bottom nav ── */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: C.surface, borderTop: `1px solid ${C.border}`, display: "flex", boxShadow: "0 -2px 10px rgba(0,0,0,0.06)" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, padding: "10px 4px 8px", background: "none", border: "none",
            color: tab === t.id ? C.accent : C.muted, cursor: "pointer",
            display: "flex", flexDirection: "column", alignItems: "center", gap: "3px",
            borderTop: `2px solid ${tab === t.id ? C.accent : "transparent"}`,
            fontFamily: FONT, transition: "color 0.15s",
          }}>
            <span style={{ fontSize: "18px" }}>{t.icon}</span>
            <span style={{ fontSize: "9px", fontWeight: tab === t.id ? "700" : "500" }}>{t.label}</span>
          </button>
        ))}
      </div>

      {showStart && <StartShiftModal onStart={handleStartShift} onCancel={() => setShowStart(false)} />}
      {showEnd && activeShift && <EndShiftModal shift={activeShift} jobs={jobs} onComplete={handleEndShift} onCancel={() => setShowEnd(false)} />}
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({ jobs, expenses, fuelLogs, shifts, activeShift, settings, onStartShift, onEndShift }) {
  const [range, setRange] = useState("today");
  const elapsed = useElapsed(activeShift?.startTs);

  // Filter jobs/expenses/fuel by selected range
  const todayStr = today();

  const fj = (() => {
    if (range === "shift") return activeShift ? jobs.filter(j => j.shiftId === activeShift.id) : [];
    if (range === "today") return jobs.filter(j => j.date === todayStr);
    if (range === "week") { const d = new Date(); d.setDate(d.getDate() - 7); return jobs.filter(j => j.date >= d.toISOString().slice(0, 10)); }
    if (range === "month") { const d = new Date(); d.setMonth(d.getMonth() - 1); return jobs.filter(j => j.date >= d.toISOString().slice(0, 10)); }
    if (range === "taxyear") return jobs.filter(j => j.date >= TAX_YEAR_START);
    return jobs; // all
  })();

  const fe = (() => {
    if (range === "shift") return []; // expenses not linked to shifts
    if (range === "today") return expenses.filter(e => e.date === todayStr);
    if (range === "week") { const d = new Date(); d.setDate(d.getDate() - 7); return expenses.filter(e => e.date >= d.toISOString().slice(0, 10)); }
    if (range === "month") { const d = new Date(); d.setMonth(d.getMonth() - 1); return expenses.filter(e => e.date >= d.toISOString().slice(0, 10)); }
    if (range === "taxyear") return expenses.filter(e => e.date >= TAX_YEAR_START);
    return expenses;
  })();

  const ff = (() => {
    if (range === "shift") return [];
    if (range === "today") return fuelLogs.filter(f => f.date === todayStr);
    if (range === "week") { const d = new Date(); d.setDate(d.getDate() - 7); return fuelLogs.filter(f => f.date >= d.toISOString().slice(0, 10)); }
    if (range === "month") { const d = new Date(); d.setMonth(d.getMonth() - 1); return fuelLogs.filter(f => f.date >= d.toISOString().slice(0, 10)); }
    if (range === "taxyear") return fuelLogs.filter(f => f.date >= TAX_YEAR_START);
    return fuelLogs;
  })();

  const grossFares = fj.reduce((s, j) => s + (j.fare || 0), 0);
  const opCuts = fj.reduce((s, j) => s + (j.opCut || 0), 0);
  const totalTips = fj.reduce((s, j) => s + (j.tip || 0), 0);
  const netFares = grossFares - opCuts + totalTips;
  const fuelSpend = ff.reduce((s, f) => s + (f.cost || 0), 0);
  const otherExp = fe.reduce((s, e) => s + (e.amount || 0), 0);
  const netProfit = netFares - fuelSpend - otherExp;
  const totalMins = fj.reduce((s, j) => s + (j.minutes || 0), 0);

  // Hourly rate: use shift duration if viewing current shift, otherwise job minutes
  const hourlyRate = (() => {
    if (range === "shift" && activeShift) {
      const shiftMins = (Date.now() - activeShift.startTs) / 60000;
      return shiftMins > 0 ? netFares / (shiftMins / 60) : 0;
    }
    return totalMins > 0 ? netFares / (totalMins / 60) : 0;
  })();

  const hourlyLabel = range === "shift" ? "Shift £/hr" : "Ride-time £/hr";

  const allBusinessMiles = shifts.reduce((s, sh) => s + (sh.shiftMiles || 0), 0);
  const hmrc = allBusinessMiles <= HMRC_THRESHOLD ? allBusinessMiles * HMRC_RATE_1 : HMRC_THRESHOLD * HMRC_RATE_1 + (allBusinessMiles - HMRC_THRESHOLD) * HMRC_RATE_2;

  const byOp = [...new Set(fj.map(j => j.operator))].map(op => {
    const opJobs = fj.filter(j => j.operator === op);
    const net = opJobs.reduce((s, j) => s + (j.netEarnings || 0), 0);
    const mins = opJobs.reduce((s, j) => s + (j.minutes || 0), 0);
    const opProfile = (settings?.operators || []).find(o => o.name === op);
    const color = opProfile?.color || C.accent;
    return { op, count: opJobs.length, net, hr: mins > 0 ? net / (mins / 60) : 0, color };
  }).filter(x => x.count > 0).sort((a, b) => b.net - a.net);

  // Range buttons — hide "Current Shift" if no active shift
  const ranges = [
    ...(activeShift ? [{ id: "shift", label: "This Shift" }] : []),
    { id: "today", label: "Today" },
    { id: "week", label: "7 Days" },
    { id: "month", label: "Month" },
    { id: "taxyear", label: "Tax Year" },
    { id: "all", label: "All" },
  ];

  // If active shift ends and range was "shift", fall back to today
  useEffect(() => {
    if (range === "shift" && !activeShift) setRange("today");
  }, [activeShift]);

  return (
    <div>
      {/* Shift button */}
      {!activeShift ? (
        <button onClick={onStartShift} style={{
          width: "100%", padding: "22px", marginBottom: "20px",
          background: "linear-gradient(135deg, #16A34A, #15803D)",
          border: "none", borderRadius: "16px", cursor: "pointer", color: "#fff",
          fontFamily: FONT, boxShadow: "0 4px 16px rgba(22,163,74,0.35)",
          display: "flex", alignItems: "center", justifyContent: "center", gap: "14px",
        }}>
          <span style={{ fontSize: "30px" }}>🟢</span>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: "18px", fontWeight: "800" }}>Start Shift</div>
            <div style={{ fontSize: "12px", opacity: 0.85, marginTop: "2px" }}>Tap to clock on and begin tracking</div>
          </div>
        </button>
      ) : (
        <div style={{ marginBottom: "20px" }}>
          <div style={{ background: "linear-gradient(135deg, #16A34A, #15803D)", borderRadius: "16px", padding: "18px", marginBottom: "10px", boxShadow: "0 4px 16px rgba(22,163,74,0.25)", color: "#fff" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: "12px", opacity: 0.85, fontWeight: "600", fontFamily: FONT }}>● SHIFT ACTIVE</div>
                <div style={{ fontSize: "28px", fontWeight: "800", marginTop: "2px", fontFamily: FONT }}>{elapsed}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "11px", opacity: 0.75, fontFamily: FONT }}>Started</div>
                <div style={{ fontSize: "16px", fontWeight: "700", fontFamily: FONT }}>{timeStr(activeShift.startTs)}</div>
                <div style={{ fontSize: "11px", opacity: 0.75, fontFamily: FONT }}>{dateStr(activeShift.startTs)}</div>
              </div>
            </div>
          </div>
          <button onClick={onEndShift} style={{ width: "100%", padding: "16px", background: C.redBg, border: `2px solid ${C.red}`, borderRadius: "14px", cursor: "pointer", color: C.red, fontFamily: FONT, fontSize: "15px", fontWeight: "700", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px" }}>
            🔴 End Shift
          </button>
        </div>
      )}

      {/* Range selector — scrollable so all fit on small screens */}
      <div style={{ display: "flex", gap: "5px", marginBottom: "16px", background: C.surface, borderRadius: "12px", padding: "4px", border: `1px solid ${C.border}`, overflowX: "auto" }}>
        {ranges.map(r => (
          <button key={r.id} onClick={() => setRange(r.id)} style={{
            flexShrink: 0, padding: "8px 10px",
            background: range === r.id ? C.accent : "transparent",
            color: range === r.id ? "#fff" : C.sub,
            border: "none", borderRadius: "9px",
            fontSize: "11px", fontWeight: "700", fontFamily: FONT, cursor: "pointer",
            transition: "all 0.15s", whiteSpace: "nowrap",
          }}>{r.label}</button>
        ))}
      </div>

      {/* Stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "16px" }}>
        <StatCard label="Net Profit" value={fmt(netProfit)} color={netProfit >= 0 ? C.green : C.red} sub={`${fj.length} job${fj.length !== 1 ? "s" : ""}`} />
        <StatCard label="Gross Fares" value={fmt(grossFares)} color={C.accent} />
        <StatCard label={hourlyLabel} value={hourlyRate > 0 ? fmt(hourlyRate) : "—"} color={C.blue} sub="after op. cut" />
        <StatCard label="Total Costs" value={fmt(fuelSpend + otherExp)} color={C.red} />
      </div>

      {/* P&L */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "16px", marginBottom: "16px", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
        <SectionTitle>P&L Breakdown</SectionTitle>
        <Row label="Gross fares" value={fmt(grossFares)} />
        <Row label="Operator cuts" value={`− ${fmt(opCuts)}`} color={C.red} />
        {totalTips > 0 && <Row label="Tips received" value={`+ ${fmt(totalTips)}`} color={C.green} />}
        <Row label="Net from rides" value={fmt(netFares)} color={C.green} bold />
        <Row label="Fuel spend" value={`− ${fmt(fuelSpend)}`} color={C.red} />
        <Row label="Other expenses" value={`− ${fmt(otherExp)}`} color={C.red} />
        <Row label="Net profit" value={fmt(netProfit)} color={netProfit >= 0 ? C.green : C.red} bold />
      </div>

      {/* By operator */}
      {byOp.length > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "16px", marginBottom: "16px", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
          <SectionTitle>By Operator</SectionTitle>
          {byOp.map(({ op, count, net, hr, color }) => (
            <div key={op} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
              <div><Pill label={op} color={color} /><div style={{ fontSize: "11px", color: C.sub, marginTop: "4px", fontFamily: FONT }}>{count} job{count !== 1 ? "s" : ""}</div></div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: "700", fontFamily: FONT }}>{fmt(net)}</div>
                {hr > 0 && <div style={{ fontSize: "11px", color: C.accent, fontFamily: FONT }}>{fmt(hr)}/hr</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* HMRC — always shows tax year total */}
      <div style={{ background: C.greenBg, border: `1px solid ${C.greenBorder}`, borderRadius: "14px", padding: "16px" }}>
        <SectionTitle>HMRC Mileage (Tax Year)</SectionTitle>
        <Row label="Business miles logged" value={`${allBusinessMiles.toFixed(0)} mi`} />
        <Row label="Claimable allowance" value={fmt(hmrc)} color={C.green} bold />
        <div style={{ fontSize: "12px", color: C.sub, marginTop: "10px", fontFamily: FONT }}>Based on shift mileage logs. First 10,000 mi @ 45p, then 25p.</div>
      </div>
    </div>
  );
}


// ─── Quick Log Flow ───────────────────────────────────────────────────────────
function QuickLog({ settings, activeShift, setJobs, setExpenses, onClose }) {
  const operators = settings.operators || [];
  const lastOp = load("dl_last_operator", operators[0]?.name || "");
  const fileRef = useRef(null);

  const blankQuick = {
    stage: "start",
    operator: lastOp || operators[0]?.name || "",
    fare: "", paymentMethod: "Via Operator", cardFeePct: "",
    tip: "", configFee: "", notes: "",
    jobMiles: "", minutes: "",
    date: today(), startedAt: Date.now(),
  };

  const [q, setQ] = useState(() => load(QUICK_LOG_KEY, blankQuick));
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);

  useEffect(() => { save(QUICK_LOG_KEY, q); }, [q]);

  const selectedOp = operators.find(o => o.name === q.operator);

  function calcCommission(fare, op, form) {
    const fareNum = parseFloat(fare) || 0;
    if (!op) return { netFare: fareNum, opCut: 0, configFeeAmt: 0 };
    const configFeeAmt = op.hasConfigFee ? (parseFloat(form.configFee) || 0) : 0;
    if (op.commissionModel === "net") return { netFare: fareNum, opCut: 0, configFeeAmt };
    if (op.commissionModel === "pct") {
      const afterConfig = fareNum - configFeeAmt;
      const comm = afterConfig * (op.commissionPct / 100);
      return { netFare: afterConfig - comm, opCut: comm + configFeeAmt, configFeeAmt };
    }
    if (op.commissionModel === "fixed_then_pct") {
      const afterFixed = fareNum - (op.fixedFee || 0);
      const comm = afterFixed * (op.commissionPct / 100);
      return { netFare: afterFixed - comm, opCut: (op.fixedFee || 0) + comm, configFeeAmt: 0 };
    }
    return { netFare: fareNum, opCut: 0, configFeeAmt: 0 };
  }

  async function scanScreenshot(file) {
    if (!file) return;
    setScanning(true); setScanResult(null);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const b64 = ev.target.result.split(",")[1];
      const mime = file.type || "image/jpeg";
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 500,
            system: `You extract job data from private hire driver app screenshots (Uber, Bolt, etc). Return ONLY valid JSON, no markdown:
{ "fare": number or null, "jobMiles": number or null, "minutes": number or null, "notes": string or null, "date": "YYYY-MM-DD or null" }
Today is ${today()}. fare is the amount shown to the driver. minutes is duration if shown. jobMiles is distance if shown.`,
            messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: mime, data: b64 } }, { type: "text", text: "Extract job data from this screenshot." }] }]
          })
        });
        const data = await res.json();
        const text = (data.content || []).map(b => b.text || "").join("");
        const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
        setScanResult(parsed);
        setQ(prev => ({
          ...prev,
          fare: parsed.fare ? String(parsed.fare) : prev.fare,
          jobMiles: parsed.jobMiles ? String(parsed.jobMiles) : prev.jobMiles,
          minutes: parsed.minutes ? String(parsed.minutes) : prev.minutes,
          notes: parsed.notes || prev.notes,
          date: parsed.date || prev.date,
        }));
      } catch { setScanResult({ error: true }); }
      setScanning(false);
    };
    reader.readAsDataURL(file);
  }

  function submitJob() {
    const fare = parseFloat(q.fare);
    if (!fare) return;
    const { netFare, opCut, configFeeAmt } = calcCommission(fare, selectedOp, q);
    const tip = parseFloat(q.tip) || 0;
    const cardFeePct = q.paymentMethod === "Card (my machine)" ? (parseFloat(q.cardFeePct) || settings.cardFeePct || 1.69) : 0;
    const cardFeeAmt = netFare * (cardFeePct / 100);
    const netEarnings = netFare + tip - cardFeeAmt;
    if (cardFeeAmt > 0) {
      setExpenses(prev => [{ id: Date.now() + 1, date: q.date, category: "Card Machine Fee", amount: parseFloat(cardFeeAmt.toFixed(2)), notes: `Card fee on ${fmt(fare)} job` }, ...prev]);
    }
    save("dl_last_operator", q.operator);
    setJobs(prev => [{
      id: Date.now(), date: q.date, operator: q.operator || "Other",
      fare, netFare, opCut, configFeeAmt,
      jobMiles: parseFloat(q.jobMiles) || 0, deadMiles: 0,
      minutes: parseFloat(q.minutes) || 0,
      netEarnings, tip, cardFeeAmt,
      paymentMethod: q.paymentMethod,
      notes: q.notes, shiftId: activeShift?.id || null, type: "quick",
    }, ...prev]);
    clearDraft(QUICK_LOG_KEY);
    onClose(true);
  }

  function resetAndClose() { clearDraft(QUICK_LOG_KEY); onClose(false); }

  const bigInput = { ...inputStyle, fontSize: "28px", fontWeight: "800", textAlign: "center", padding: "16px", borderRadius: "14px" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 200, overflowY: "auto" }}>
      <div style={{ background: C.surface, margin: "12px", borderRadius: "20px", padding: "22px", marginBottom: "40px", boxShadow: "0 8px 40px rgba(0,0,0,0.2)" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <div>
            <div style={{ fontSize: "11px", color: C.sub, fontWeight: "600", letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: FONT }}>
              {q.stage === "start" ? "Step 1 of 3" : q.stage === "finish" ? "Step 2 of 3" : "Step 3 of 3"}
            </div>
            <div style={{ fontSize: "18px", fontWeight: "800", color: C.text, fontFamily: FONT }}>
              {q.stage === "start" ? "⚡ Job Details" : q.stage === "finish" ? "🏁 Job Complete" : "✓ Confirm & Save"}
            </div>
          </div>
          <button onClick={resetAndClose} style={{ background: "none", border: "none", color: C.muted, fontSize: "22px", cursor: "pointer" }}>×</button>
        </div>

        {/* Progress */}
        <div style={{ display: "flex", gap: "4px", marginBottom: "22px" }}>
          {["start", "finish", "review"].map((s, i) => (
            <div key={s} style={{ flex: 1, height: "4px", borderRadius: "2px", background: ["start", "finish", "review"].indexOf(q.stage) >= i ? C.accent : C.border }} />
          ))}
        </div>

        {/* ── STAGE 1: Job comes in ── */}
        {q.stage === "start" && (
          <>
            {/* Screenshot scan */}
            <div style={{ marginBottom: "18px" }}>
              <label htmlFor="ql-scan" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 16px", background: C.blueBg, border: `1.5px solid ${C.blueBorder}`, borderRadius: "12px", cursor: "pointer" }}>
                <span style={{ fontSize: "20px" }}>📸</span>
                <div>
                  <div style={{ fontSize: "13px", fontWeight: "700", color: C.blue, fontFamily: FONT }}>Fill from screenshot</div>
                  <div style={{ fontSize: "11px", color: C.sub, fontFamily: FONT }}>Upload a trip screenshot — AI reads the details for you</div>
                </div>
              </label>
              <input id="ql-scan" type="file" accept="image/*" style={{ display: "none" }} ref={fileRef} onChange={e => scanScreenshot(e.target.files[0])} />
              {scanning && <div style={{ fontSize: "12px", color: C.blue, marginTop: "8px", fontFamily: FONT }}>⟳ Reading screenshot...</div>}
              {scanResult && !scanResult.error && (
                <div style={{ background: C.greenBg, border: `1px solid ${C.greenBorder}`, borderRadius: "8px", padding: "8px 12px", marginTop: "8px", fontSize: "12px", color: C.green, fontFamily: FONT, fontWeight: "600" }}>
                  ✓ Found: {scanResult.fare ? fmt(scanResult.fare) : ""}{scanResult.jobMiles ? ` · ${scanResult.jobMiles}mi` : ""}{scanResult.minutes ? ` · ${scanResult.minutes}min` : ""} — check fields below and amend if needed
                </div>
              )}
              {scanResult?.error && <div style={{ fontSize: "12px", color: C.red, marginTop: "8px", fontFamily: FONT }}>Couldn't read screenshot — fill in manually below</div>}
            </div>

            {/* Operator */}
            {operators.length > 0 ? (
              <div style={{ marginBottom: "16px" }}>
                <FieldLabel label="Operator" />
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {operators.map(op => (
                    <button key={op.name} onClick={() => setQ(q => ({ ...q, operator: op.name, paymentMethod: op.defaultPayment || "Via Operator" }))} style={{
                      padding: "10px 16px", borderRadius: "20px", cursor: "pointer",
                      background: q.operator === op.name ? op.color + "22" : C.light,
                      border: `2px solid ${q.operator === op.name ? op.color : C.border}`,
                      color: q.operator === op.name ? op.color : C.sub,
                      fontSize: "14px", fontWeight: "700", fontFamily: FONT,
                    }}>{op.name}</button>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ background: C.orangeBg, border: `1px solid #FED7AA`, borderRadius: "10px", padding: "12px", marginBottom: "16px", fontSize: "13px", color: C.orange, fontFamily: FONT }}>
                No operators set up. Go to <strong>Costs → My Operators</strong> first.
              </div>
            )}

            {/* Commission info */}
            {selectedOp && (
              <div style={{ background: selectedOp.commissionModel === "net" ? C.greenBg : C.blueBg, border: `1px solid ${selectedOp.commissionModel === "net" ? C.greenBorder : C.blueBorder}`, borderRadius: "10px", padding: "10px 14px", marginBottom: "14px", fontSize: "12px", color: selectedOp.commissionModel === "net" ? C.green : C.blue, fontFamily: FONT, fontWeight: "600" }}>
                {selectedOp.commissionModel === "net" ? `✓ ${selectedOp.name} — Net pay, no commission` : selectedOp.commissionModel === "pct" ? `${selectedOp.name} — ${selectedOp.commissionPct}% commission` : `${selectedOp.name} — £${selectedOp.fixedFee} fixed + ${selectedOp.commissionPct}%`}
              </div>
            )}

            {/* Fare — big */}
            <div style={{ marginBottom: "16px" }}>
              <FieldLabel label="Fare (£)" tooltip="The amount shown for this job." />
              <input style={bigInput} type="number" placeholder="0.00" value={q.fare} onChange={e => setQ(q => ({ ...q, fare: e.target.value }))} />
            </div>

            {/* Config fee */}
            {selectedOp?.hasConfigFee && (
              <Input label="Config fee (£) — if applicable" tooltip="Leave blank if no config fee on this job." type="number" placeholder="e.g. 2.50" value={q.configFee} onChange={e => setQ(q => ({ ...q, configFee: e.target.value }))} />
            )}

            {/* Payment method */}
            <div style={{ marginBottom: "16px" }}>
              <FieldLabel label="Payment method" />
              <div style={{ display: "flex", gap: "6px" }}>
                {PAYMENT_METHODS.map(m => (
                  <button key={m} onClick={() => setQ(q => ({ ...q, paymentMethod: m }))} style={{ flex: 1, padding: "10px 4px", borderRadius: "10px", cursor: "pointer", background: q.paymentMethod === m ? C.blueBg : C.light, border: `2px solid ${q.paymentMethod === m ? C.blue : C.border}`, color: q.paymentMethod === m ? C.blue : C.sub, fontSize: "10px", fontWeight: "600", fontFamily: FONT, textAlign: "center" }}>
                    {PAYMENT_ICONS[m]}<br />{m}
                  </button>
                ))}
              </div>
              {q.paymentMethod === "Card (my machine)" && (
                <input style={{ ...inputStyle, marginTop: "8px" }} type="number" placeholder={`Card fee % (default ${settings.cardFeePct || 1.69}%)`} value={q.cardFeePct} onChange={e => setQ(q => ({ ...q, cardFeePct: e.target.value }))} />
              )}
            </div>

            <Input label="Notes (optional)" type="text" placeholder="e.g. Airport run, regular customer" value={q.notes} onChange={e => setQ(q => ({ ...q, notes: e.target.value }))} />
            <Input label="Date" type="date" value={q.date} onChange={e => setQ(q => ({ ...q, date: e.target.value }))} />

            <Btn onClick={() => setQ(q => ({ ...q, stage: "finish" }))} disabled={!q.fare || !q.operator} color={C.accent} big>
              Job started → complete later
            </Btn>
            <button onClick={() => setQ(q => ({ ...q, stage: "review" }))} style={{ background: "none", border: "none", color: C.sub, fontSize: "12px", cursor: "pointer", fontFamily: FONT, width: "100%", textAlign: "center", marginTop: "10px" }}>
              I've already finished — review & submit now
            </button>
          </>
        )}

        {/* ── STAGE 2: Job done ── */}
        {q.stage === "finish" && (
          <>
            <div style={{ background: C.greenBg, border: `1px solid ${C.greenBorder}`, borderRadius: "12px", padding: "14px", marginBottom: "18px" }}>
              <div style={{ fontWeight: "700", color: C.green, marginBottom: "4px", fontFamily: FONT }}>Job in progress</div>
              <div style={{ color: C.sub, fontSize: "13px", fontFamily: FONT }}>{q.operator} · {fmt(parseFloat(q.fare) || 0)} · {q.paymentMethod}</div>
              {q.notes && <div style={{ color: C.sub, fontSize: "13px", fontFamily: FONT }}>{q.notes}</div>}
            </div>

            <div style={{ marginBottom: "16px" }}>
              <FieldLabel label="Miles driven" tooltip="Distance of this trip — pickup to dropoff." />
              <input style={bigInput} type="number" placeholder="0.0" value={q.jobMiles} onChange={e => setQ(q => ({ ...q, jobMiles: e.target.value }))} />
            </div>

            <Input label="Duration (minutes)" tooltip="Total time from leaving for the pickup to dropping the passenger off." type="number" placeholder="e.g. 25" value={q.minutes} onChange={e => setQ(q => ({ ...q, minutes: e.target.value }))} />
            <Input label="Tip received (£) — optional" tooltip="Any tip received. Taxable income — declare on self-assessment." type="number" placeholder="e.g. 3.00" value={q.tip} onChange={e => setQ(q => ({ ...q, tip: e.target.value }))} />

            <Btn onClick={() => setQ(q => ({ ...q, stage: "review" }))} color={C.accent} big>Review & Submit →</Btn>
            <button onClick={() => setQ(q => ({ ...q, stage: "start" }))} style={{ background: "none", border: "none", color: C.sub, fontSize: "12px", cursor: "pointer", fontFamily: FONT, width: "100%", textAlign: "center", marginTop: "10px" }}>← Back to edit job details</button>
          </>
        )}

        {/* ── STAGE 3: Review ── */}
        {q.stage === "review" && (() => {
          const fare = parseFloat(q.fare) || 0;
          const { netFare, opCut, configFeeAmt } = calcCommission(fare, selectedOp, q);
          const tip = parseFloat(q.tip) || 0;
          const cardFeePct = q.paymentMethod === "Card (my machine)" ? (parseFloat(q.cardFeePct) || settings.cardFeePct || 1.69) : 0;
          const cardFeeAmt = netFare * (cardFeePct / 100);
          const netEarnings = netFare + tip - cardFeeAmt;
          return (
            <>
              <div style={{ background: C.light, borderRadius: "12px", padding: "16px", marginBottom: "16px" }}>
                <SectionTitle>Job Summary</SectionTitle>
                <Row label="Operator" value={q.operator || "—"} />
                <Row label="Date" value={q.date} />
                <Row label="Fare" value={fmt(fare)} />
                {opCut > 0 && <Row label="Commission" value={`− ${fmt(opCut)}`} color={C.red} />}
                {configFeeAmt > 0 && <Row label="Config fee" value={`− ${fmt(configFeeAmt)}`} color={C.red} />}
                {cardFeeAmt > 0 && <Row label="Card fee" value={`− ${fmt(cardFeeAmt)}`} color={C.red} />}
                {tip > 0 && <Row label="Tip" value={`+ ${fmt(tip)}`} color={C.green} />}
                <Row label="Miles" value={q.jobMiles ? `${q.jobMiles} mi` : "—"} />
                <Row label="Duration" value={q.minutes ? `${q.minutes} min` : "—"} />
                <Row label="Payment" value={q.paymentMethod} />
                {q.notes && <Row label="Notes" value={q.notes} />}
                <Row label="Net earnings" value={fmt(netEarnings)} color={netEarnings > 0 ? C.green : C.red} bold />
              </div>
              <Btn onClick={submitJob} disabled={!fare || !q.operator} color={C.green} big>✓ Save Job</Btn>
              <button onClick={() => setQ(q => ({ ...q, stage: q.jobMiles ? "finish" : "start" }))} style={{ background: "none", border: "none", color: C.sub, fontSize: "12px", cursor: "pointer", fontFamily: FONT, width: "100%", textAlign: "center", marginTop: "10px" }}>← Edit details</button>
            </>
          );
        })()}
      </div>
    </div>
  );
}

// ─── Jobs ─────────────────────────────────────────────────────────────────────
function Jobs({ jobs, setJobs, expenses, setExpenses, settings, activeShift }) {
  const [logMode, setLogMode] = useState("job");
  const [showQuickLog, setShowQuickLog] = useState(false);
  const [quickAdded, setQuickAdded] = useState(false);

  const hasQuickDraft = (() => {
    try {
      const d = JSON.parse(localStorage.getItem(QUICK_LOG_KEY));
      return d && d.fare && d.stage === "finish";
    } catch { return false; }
  })();

  const defaultJobForm = { date: today(), operator: "", fare: "", isNet: "yes", commissionPct: "", configFee: "", jobMiles: "", minutes: "", paymentMethod: "Via Operator", cardFeePct: "", tip: "", notes: "" };
  const defaultDayForm = { date: today(), operator: "", totalFare: "", isNet: "yes", commissionPct: "", totalJobs: "", totalMiles: "", notes: "" };

  const [jobForm, setJobForm] = useState(() => load(DRAFT_JOB_KEY, defaultJobForm));
  const [dayForm, setDayForm] = useState(() => load(DRAFT_DAY_KEY, defaultDayForm));
  const [added, setAdded] = useState(false);

  useEffect(() => { save(DRAFT_JOB_KEY, jobForm); }, [jobForm]);
  useEffect(() => { save(DRAFT_DAY_KEY, dayForm); }, [dayForm]);

  const hasDraftJob = jobForm.fare || jobForm.jobMiles || jobForm.notes;
  const hasDraftDay = dayForm.totalFare || dayForm.totalJobs || dayForm.notes;
  const selectedOp = (settings.operators || []).find(o => o.name === jobForm.operator);

  function calcCommission(fare, op, form) {
    const fareNum = parseFloat(fare) || 0;
    if (!op) {
      if (form.isNet === "yes") return { netFare: fareNum, opCut: 0, configFeeAmt: 0 };
      const pct = parseFloat(form.commissionPct) || 0;
      return { netFare: fareNum * (1 - pct / 100), opCut: fareNum * pct / 100, configFeeAmt: 0 };
    }
    const configFeeAmt = op.hasConfigFee ? (parseFloat(form.configFee) || 0) : 0;
    if (op.commissionModel === "net") return { netFare: fareNum, opCut: 0, configFeeAmt };
    if (op.commissionModel === "pct") {
      const afterConfig = fareNum - configFeeAmt;
      const comm = afterConfig * (op.commissionPct / 100);
      return { netFare: afterConfig - comm, opCut: comm + configFeeAmt, configFeeAmt };
    }
    if (op.commissionModel === "fixed_then_pct") {
      const afterFixed = fareNum - (op.fixedFee || 0);
      const comm = afterFixed * (op.commissionPct / 100);
      return { netFare: afterFixed - comm, opCut: (op.fixedFee || 0) + comm, configFeeAmt: 0 };
    }
    return { netFare: fareNum, opCut: 0, configFeeAmt: 0 };
  }

  function addJob() {
    const fare = parseFloat(jobForm.fare);
    if (!fare) return;
    const { netFare, opCut, configFeeAmt } = calcCommission(fare, selectedOp, jobForm);
    const tip = parseFloat(jobForm.tip) || 0;
    const cardFeePct = jobForm.paymentMethod === "Card (my machine)" ? (parseFloat(jobForm.cardFeePct) || settings.cardFeePct || 1.69) : 0;
    const cardFeeAmt = netFare * (cardFeePct / 100);
    const netEarnings = netFare + tip - cardFeeAmt;
    if (cardFeeAmt > 0) setExpenses(prev => [{ id: Date.now() + 1, date: jobForm.date, category: "Card Machine Fee", amount: parseFloat(cardFeeAmt.toFixed(2)), notes: `Card fee on ${fmt(fare)} job` }, ...prev]);
    setJobs(prev => [{ id: Date.now(), date: jobForm.date, operator: jobForm.operator || "Other", fare, netFare, opCut, configFeeAmt, jobMiles: parseFloat(jobForm.jobMiles) || 0, deadMiles: 0, minutes: parseFloat(jobForm.minutes) || 0, netEarnings, tip, cardFeeAmt, paymentMethod: jobForm.paymentMethod, notes: jobForm.notes, shiftId: activeShift?.id || null, type: "job" }, ...prev]);
    clearDraft(DRAFT_JOB_KEY);
    setJobForm(defaultJobForm);
    setAdded(true); setTimeout(() => setAdded(false), 2000);
  }

  function addDay() {
    const fare = parseFloat(dayForm.totalFare);
    if (!fare) return;
    const selectedDayOp = (settings.operators || []).find(o => o.name === dayForm.operator);
    const { netFare, opCut } = calcCommission(fare, selectedDayOp, { isNet: dayForm.isNet, commissionPct: dayForm.commissionPct, configFee: "" });
    setJobs(prev => [{ id: Date.now(), date: dayForm.date, operator: dayForm.operator || "Other", fare, netFare, opCut, jobMiles: parseFloat(dayForm.totalMiles) || 0, deadMiles: 0, minutes: 0, netEarnings: netFare, tip: 0, paymentMethod: "Via Operator", notes: dayForm.notes || `${dayForm.totalJobs || "?"} jobs`, shiftId: activeShift?.id || null, type: "day" }, ...prev]);
    clearDraft(DRAFT_DAY_KEY);
    setDayForm(defaultDayForm);
    setAdded(true); setTimeout(() => setAdded(false), 2000);
  }

  const FareTypeToggle = ({ value, onChange, commPct, onCommChange }) => (
    <div style={{ marginBottom: "14px" }}>
      <FieldLabel label="Is this the net amount you receive?" tooltip="Net means you get this exact amount. Gross means commission will be deducted." />
      <div style={{ display: "flex", gap: "8px" }}>
        {[{ v: "yes", label: "Yes — net" }, { v: "no", label: "No — commission taken" }].map(opt => (
          <button key={opt.v} onClick={() => onChange(opt.v)} style={{ flex: 1, padding: "10px", background: value === opt.v ? C.greenBg : C.light, border: `2px solid ${value === opt.v ? C.green : C.border}`, borderRadius: "10px", color: value === opt.v ? C.green : C.sub, fontSize: "12px", fontWeight: "600", fontFamily: FONT, cursor: "pointer" }}>{opt.label}</button>
        ))}
      </div>
      {value === "no" && <input style={{ ...inputStyle, marginTop: "8px" }} type="number" placeholder="Commission % (e.g. 25)" value={commPct} onChange={e => onCommChange(e.target.value)} />}
    </div>
  );

  const OpSelector = ({ value, onChange }) => (
    <div style={{ marginBottom: "14px" }}>
      <FieldLabel label="Operator" />
      {(settings.operators || []).length === 0 ? (
        <div style={{ background: C.orangeBg, border: `1px solid #FED7AA`, borderRadius: "10px", padding: "12px", fontSize: "13px", color: C.orange, fontFamily: FONT }}>
          No operators set up. Go to <strong>Costs → My Operators</strong>.
        </div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
          {(settings.operators || []).map(op => (
            <button key={op.name} onClick={() => onChange(op)} style={{ padding: "8px 14px", borderRadius: "20px", cursor: "pointer", background: value === op.name ? op.color + "22" : C.light, border: `2px solid ${value === op.name ? op.color : C.border}`, color: value === op.name ? op.color : C.sub, fontSize: "13px", fontWeight: "700", fontFamily: FONT }}>{op.name}</button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div>
      <TabIntro storageKey="intro_jobs" icon="🚖" title="Jobs Tab" body="Use Quick Log to capture a job as it happens — takes 10 seconds. Use By Job for full detail when you have more time, or By Day for end-of-day totals." />

      {activeShift && (
        <div style={{ background: C.greenBg, border: `1px solid ${C.greenBorder}`, borderRadius: "12px", padding: "10px 14px", marginBottom: "16px", fontSize: "13px", color: C.green, fontWeight: "600", fontFamily: FONT }}>
          ● Shift active — jobs added will be linked to this shift
        </div>
      )}

      {/* Quick Log button */}
      <button onClick={() => setShowQuickLog(true)} style={{
        width: "100%", padding: "18px", marginBottom: "16px",
        background: hasQuickDraft ? `linear-gradient(135deg, ${C.orange}, #D4891A)` : `linear-gradient(135deg, ${C.accent}, ${C.accentDark})`,
        border: "none", borderRadius: "14px", cursor: "pointer", color: "#fff",
        fontFamily: FONT, boxShadow: "0 4px 14px rgba(245,166,35,0.35)",
        display: "flex", alignItems: "center", justifyContent: "center", gap: "12px",
      }}>
        <span style={{ fontSize: "24px" }}>{hasQuickDraft ? "🔄" : "⚡"}</span>
        <div style={{ textAlign: "left" }}>
          <div style={{ fontSize: "16px", fontWeight: "800" }}>{hasQuickDraft ? "Resume In-Progress Job" : "Quick Log"}</div>
          <div style={{ fontSize: "11px", opacity: 0.85, marginTop: "2px" }}>
            {hasQuickDraft ? "You have a job waiting to be completed" : "Log a job as it happens · takes 10 seconds · 📸 screenshot supported"}
          </div>
        </div>
      </button>

      {quickAdded && <div style={{ textAlign: "center", color: C.green, fontSize: "13px", marginBottom: "12px", fontFamily: FONT, fontWeight: "600" }}>⚡ Job saved!</div>}

      {/* Mode selector */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "16px", background: C.surface, borderRadius: "12px", padding: "4px", border: `1px solid ${C.border}` }}>
        {[{ id: "job", label: "By Job" }, { id: "day", label: "By Day" }].map(m => (
          <button key={m.id} onClick={() => setLogMode(m.id)} style={{ flex: 1, padding: "9px 4px", background: logMode === m.id ? C.accent : "transparent", color: logMode === m.id ? "#fff" : C.sub, border: "none", borderRadius: "9px", fontSize: "12px", fontWeight: "700", fontFamily: FONT, cursor: "pointer" }}>{m.label}</button>
        ))}
      </div>

      {/* By Job */}
      {logMode === "job" && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "16px", marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <SectionTitle>Log a Single Job</SectionTitle>
            {hasDraftJob && <button onClick={() => { clearDraft(DRAFT_JOB_KEY); setJobForm(defaultJobForm); }} style={{ background: "none", border: "none", color: C.muted, fontSize: "11px", cursor: "pointer", fontFamily: FONT }}>Clear draft</button>}
          </div>
          {hasDraftJob && <div style={{ background: C.orangeBg, border: `1px solid #FED7AA`, borderRadius: "8px", padding: "8px 12px", marginBottom: "12px", fontSize: "12px", color: C.orange, fontFamily: FONT, fontWeight: "600" }}>📝 Draft restored</div>}

          <Input label="Date" type="date" value={jobForm.date} onChange={e => setJobForm(f => ({ ...f, date: e.target.value }))} />
          <OpSelector value={jobForm.operator} onChange={op => setJobForm(f => ({ ...f, operator: op.name, paymentMethod: op.defaultPayment || "Via Operator" }))} />
          <Input label="Fare (£)" tooltip="The amount shown for this job." type="number" placeholder="e.g. 22.00" value={jobForm.fare} onChange={e => setJobForm(f => ({ ...f, fare: e.target.value }))} />

          {selectedOp ? (
            <>
              {selectedOp.commissionModel === "net" && <div style={{ background: C.greenBg, border: `1px solid ${C.greenBorder}`, borderRadius: "10px", padding: "10px 14px", marginBottom: "14px", fontSize: "12px", color: C.green, fontFamily: FONT, fontWeight: "600" }}>✓ {selectedOp.name} — Net pay, no commission</div>}
              {selectedOp.commissionModel === "pct" && <div style={{ background: C.blueBg, border: `1px solid ${C.blueBorder}`, borderRadius: "10px", padding: "10px 14px", marginBottom: "14px", fontSize: "12px", color: C.blue, fontFamily: FONT }}>Commission: <strong>{selectedOp.commissionPct}%</strong></div>}
              {selectedOp.commissionModel === "fixed_then_pct" && <div style={{ background: C.blueBg, border: `1px solid ${C.blueBorder}`, borderRadius: "10px", padding: "10px 14px", marginBottom: "14px", fontSize: "12px", color: C.blue, fontFamily: FONT }}>£{selectedOp.fixedFee} + {selectedOp.commissionPct}% on remainder</div>}
              {selectedOp.hasConfigFee && <Input label="Config fee (£) — if applicable" tooltip="Per-job config fee. Leave blank if none." type="number" placeholder="e.g. 2.50" value={jobForm.configFee} onChange={e => setJobForm(f => ({ ...f, configFee: e.target.value }))} />}
            </>
          ) : !jobForm.operator && <FareTypeToggle value={jobForm.isNet} onChange={v => setJobForm(f => ({ ...f, isNet: v }))} commPct={jobForm.commissionPct} onCommChange={v => setJobForm(f => ({ ...f, commissionPct: v }))} />}

          <Input label="Job miles (pickup to dropoff)" tooltip="Distance of the actual trip." type="number" placeholder="e.g. 15" value={jobForm.jobMiles} onChange={e => setJobForm(f => ({ ...f, jobMiles: e.target.value }))} />
          <Input label="Total time (minutes)" tooltip="Total time from leaving for the pickup to dropping the passenger off." type="number" placeholder="e.g. 40" value={jobForm.minutes} onChange={e => setJobForm(f => ({ ...f, minutes: e.target.value }))} />

          <div style={{ marginBottom: "14px" }}>
            <FieldLabel label="Payment method" tooltip="Via Operator = paid later. Cash = immediate. Card (my machine) = customer used your card reader." />
            <div style={{ display: "flex", gap: "6px" }}>
              {PAYMENT_METHODS.map(m => (
                <button key={m} onClick={() => setJobForm(f => ({ ...f, paymentMethod: m }))} style={{ flex: 1, padding: "9px 4px", borderRadius: "10px", cursor: "pointer", background: jobForm.paymentMethod === m ? C.blueBg : C.light, border: `2px solid ${jobForm.paymentMethod === m ? C.blue : C.border}`, color: jobForm.paymentMethod === m ? C.blue : C.sub, fontSize: "10px", fontWeight: "600", fontFamily: FONT, textAlign: "center" }}>
                  {PAYMENT_ICONS[m]}<br />{m}
                </button>
              ))}
            </div>
            {jobForm.paymentMethod === "Card (my machine)" && (
              <div style={{ marginTop: "10px" }}>
                <Input label="Card machine fee %" type="number" placeholder={`e.g. ${settings.cardFeePct || 1.69}`} value={jobForm.cardFeePct} onChange={e => setJobForm(f => ({ ...f, cardFeePct: e.target.value }))} />
                {jobForm.fare && <div style={{ fontSize: "12px", color: C.red, fontFamily: FONT, marginTop: "-8px", marginBottom: "8px" }}>Fee: {fmt(parseFloat(jobForm.fare) * ((parseFloat(jobForm.cardFeePct) || settings.cardFeePct || 1.69) / 100))}</div>}
              </div>
            )}
          </div>

          <Input label="Tip (£) — optional" tooltip="Any tip received. Taxable income." type="number" placeholder="e.g. 3.00" value={jobForm.tip} onChange={e => setJobForm(f => ({ ...f, tip: e.target.value }))} />
          <Input label="Notes (optional)" type="text" placeholder="e.g. Luton airport run" value={jobForm.notes} onChange={e => setJobForm(f => ({ ...f, notes: e.target.value }))} />
          <Btn onClick={addJob} disabled={!jobForm.fare}>Add Job</Btn>
          {added && <div style={{ textAlign: "center", color: C.green, fontSize: "13px", marginTop: "8px", fontFamily: FONT }}>✓ Added</div>}
        </div>
      )}

      {/* By Day */}
      {logMode === "day" && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "16px", marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <SectionTitle>Log Daily Total</SectionTitle>
            {hasDraftDay && <button onClick={() => { clearDraft(DRAFT_DAY_KEY); setDayForm(defaultDayForm); }} style={{ background: "none", border: "none", color: C.muted, fontSize: "11px", cursor: "pointer", fontFamily: FONT }}>Clear draft</button>}
          </div>
          {hasDraftDay && <div style={{ background: C.orangeBg, border: `1px solid #FED7AA`, borderRadius: "8px", padding: "8px 12px", marginBottom: "12px", fontSize: "12px", color: C.orange, fontFamily: FONT, fontWeight: "600" }}>📝 Draft restored</div>}
          <div style={{ background: C.blueBg, border: `1px solid ${C.blueBorder}`, borderRadius: "10px", padding: "12px", marginBottom: "14px", fontSize: "13px", color: C.blue, fontFamily: FONT }}>Log total earnings for a full day with one operator.</div>

          <Input label="Date" type="date" value={dayForm.date} onChange={e => setDayForm(f => ({ ...f, date: e.target.value }))} />
          <OpSelector value={dayForm.operator} onChange={op => setDayForm(f => ({ ...f, operator: op.name }))} />
          <Input label="Total earnings (£)" tooltip="Your total for this operator today." type="number" placeholder="e.g. 145.00" value={dayForm.totalFare} onChange={e => setDayForm(f => ({ ...f, totalFare: e.target.value }))} />
          <FareTypeToggle value={dayForm.isNet} onChange={v => setDayForm(f => ({ ...f, isNet: v }))} commPct={dayForm.commissionPct} onCommChange={v => setDayForm(f => ({ ...f, commissionPct: v }))} />
          <Input label="Number of jobs (optional)" type="number" placeholder="e.g. 8" value={dayForm.totalJobs} onChange={e => setDayForm(f => ({ ...f, totalJobs: e.target.value }))} />
          <Input label="Total miles driven (optional)" type="number" placeholder="e.g. 94" value={dayForm.totalMiles} onChange={e => setDayForm(f => ({ ...f, totalMiles: e.target.value }))} />
          <Input label="Notes (optional)" type="text" placeholder="e.g. Friday evening shift" value={dayForm.notes} onChange={e => setDayForm(f => ({ ...f, notes: e.target.value }))} />
          <Btn onClick={addDay} disabled={!dayForm.totalFare}>Add Day</Btn>
          {added && <div style={{ textAlign: "center", color: C.green, fontSize: "13px", marginTop: "8px", fontFamily: FONT }}>✓ Added</div>}
        </div>
      )}

      {/* Job history */}
      <SectionTitle>Job History ({jobs.length})</SectionTitle>
      {jobs.length === 0
        ? <div style={{ color: C.sub, textAlign: "center", padding: "30px 0", fontSize: "13px", fontFamily: FONT }}>No jobs logged yet</div>
        : jobs.slice(0, 50).map(j => (
          <div key={j.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "14px", marginBottom: "8px", display: "flex", justifyContent: "space-between", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "5px", flexWrap: "wrap" }}>
                <Pill label={j.operator} color={(settings.operators || []).find(o => o.name === j.operator)?.color || C.accent} />
                {j.type === "day" && <span style={{ fontSize: "10px", color: C.muted, fontFamily: FONT }}>daily total</span>}
                {j.type === "quick" && <span style={{ fontSize: "10px", color: C.muted, fontFamily: FONT }}>⚡ quick</span>}
              </div>
              <div style={{ fontSize: "12px", color: C.sub, fontFamily: FONT }}>{j.date}{j.notes ? ` · ${j.notes}` : ""}</div>
              <div style={{ fontSize: "14px", marginTop: "4px", fontFamily: FONT }}>{fmt(j.fare)} gross{j.jobMiles ? ` · ${j.jobMiles}mi` : ""}</div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px", flexWrap: "wrap" }}>
                <div style={{ fontSize: "13px", color: j.netEarnings > 0 ? C.green : C.red, fontWeight: "600", fontFamily: FONT }}>Net {fmt(j.netEarnings)}</div>
                {j.tip > 0 && <span style={{ fontSize: "11px", background: "#FFF7ED", color: C.orange, border: `1px solid #FED7AA`, borderRadius: "20px", padding: "1px 8px", fontWeight: "600", fontFamily: FONT }}>+{fmt(j.tip)} tip</span>}
                {j.paymentMethod && j.paymentMethod !== "Via Operator" && <span style={{ fontSize: "11px", background: C.blueBg, color: C.blue, border: `1px solid ${C.blueBorder}`, borderRadius: "20px", padding: "1px 8px", fontWeight: "600", fontFamily: FONT }}>{PAYMENT_ICONS[j.paymentMethod]} {j.paymentMethod}</span>}
              </div>
            </div>
            <button onClick={() => setJobs(prev => prev.filter(x => x.id !== j.id))} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: "18px", paddingLeft: "10px" }}>✕</button>
          </div>
        ))
      }

      {showQuickLog && (
        <QuickLog
          settings={settings}
          activeShift={activeShift}
          setJobs={setJobs}
          setExpenses={setExpenses}
          onClose={(saved) => {
            setShowQuickLog(false);
            if (saved) { setQuickAdded(true); setTimeout(() => setQuickAdded(false), 3000); }
          }}
        />
      )}
    </div>
  );
}


// ─── Fare Check ───────────────────────────────────────────────────────────────
function FareCheck({ settings, jobs, setJobs, activeShift }) {
  const [operator, setOperator] = useState("Uber");
  const [fare, setFare] = useState("");
  const [isNet, setIsNet] = useState("yes");
  const [commPct, setCommPct] = useState("");
  const [myCharges, setMyCharges] = useState({});
  const [customAmts, setCustomAmts] = useState({});
  const [jobMiles, setJobMiles] = useState("");
  const [deadMiles, setDeadMiles] = useState("");
  const [minutes, setMinutes] = useState("");
  const [result, setResult] = useState(null);
  const [saved, setSaved] = useState(false);

  function toggleCharge(id) { setMyCharges(prev => ({ ...prev, [id]: !prev[id] })); setResult(null); }
  const totalCharges = PRESET_CHARGES.filter(c => myCharges[c.id]).reduce((s, c) => s + parseFloat(customAmts[c.id] || c.amount), 0);

  function calculate() {
    const fareNum = parseFloat(fare);
    if (!fareNum) return;
    const netFare = isNet === "yes" ? fareNum : fareNum * (1 - (parseFloat(commPct) || 0) / 100);
    const opCut = fareNum - netFare;
    const fuelCost = ((parseFloat(jobMiles) || 0) + (parseFloat(deadMiles) || 0)) * settings.fuelCostPerMile;
    const net = netFare - fuelCost - totalCharges;
    const hourly = parseFloat(minutes) > 0 ? net / (parseFloat(minutes) / 60) : null;
    setResult({ fareNum, netFare, opCut, fuelCost, totalCharges, net, hourly });
    setSaved(false);
  }

  function saveJob() {
    if (!result) return;
    setJobs(prev => [{ id: Date.now(), date: today(), operator, fare: result.fareNum, netFare: result.netFare, opCut: result.opCut, jobMiles: parseFloat(jobMiles) || 0, deadMiles: parseFloat(deadMiles) || 0, minutes: parseFloat(minutes) || 0, netEarnings: result.net, notes: "from Fare Check", shiftId: activeShift?.id || null, type: "job" }, ...prev]);
    setSaved(true);
  }

  const verdict = result
    ? result.net > 10 ? { text: "✓ Worth taking", color: C.green, bg: C.greenBg, border: C.greenBorder }
    : result.net > 0 ? { text: "⚠ Marginal — your call", color: C.orange, bg: C.orangeBg, border: "#FED7AA" }
    : { text: "✕ Probably not worth it", color: C.red, bg: C.redBg, border: C.redBorder }
    : null;

  return (
    <div>
      <TabIntro storageKey="intro_calc" icon="⚡" title="Fare Check" body="Use this before accepting a planned job or airport run — not for ASAP jobs where you have seconds to decide. Enter the fare, distances and any charges you'll pay to see your real take-home." />
      <div style={{ fontSize: "20px", fontWeight: "800", color: C.text, marginBottom: "4px", fontFamily: FONT }}>Is It Worth It?</div>
      <div style={{ fontSize: "13px", color: C.sub, marginBottom: "18px", fontFamily: FONT }}>Enter the job details to calculate your real take-home pay.</div>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "16px", marginBottom: "16px" }}>
        <div style={{ fontSize: "12px", color: C.sub, marginBottom: "14px", fontFamily: FONT }}>Fuel cost: <span style={{ color: C.accent, fontWeight: "700" }}>£{settings.fuelCostPerMile.toFixed(2)}/mi</span> — update in Costs tab</div>
        <Select label="Operator" tooltip="Select who the job is with." options={OPERATORS} value={operator} onChange={e => { setOperator(e.target.value); setResult(null); }} />
        <Input label="Fare offered (£)" tooltip="The amount the operator is showing for this job." type="number" placeholder="e.g. 35.00" value={fare} onChange={e => { setFare(e.target.value); setResult(null); }} />
        <div style={{ marginBottom: "14px" }}>
          <FieldLabel label="Is this your net amount?" tooltip="Net means you keep this exact amount. If commission will be taken, select No and enter the percentage." />
          <div style={{ display: "flex", gap: "8px", marginBottom: isNet === "no" ? "10px" : 0 }}>
            {[{ v: "yes", label: "Yes — net" }, { v: "no", label: "No — comm. taken" }].map(opt => (
              <button key={opt.v} onClick={() => { setIsNet(opt.v); setResult(null); }} style={{ flex: 1, padding: "10px", background: isNet === opt.v ? C.greenBg : C.light, border: `2px solid ${isNet === opt.v ? C.green : C.border}`, borderRadius: "10px", color: isNet === opt.v ? C.green : C.sub, fontSize: "12px", fontWeight: "600", fontFamily: FONT, cursor: "pointer" }}>{opt.label}</button>
            ))}
          </div>
          {isNet === "no" && <input style={{ ...inputStyle, marginTop: "8px" }} type="number" placeholder="Commission % (e.g. 25)" value={commPct} onChange={e => { setCommPct(e.target.value); setResult(null); }} />}
        </div>
        <Input label="Job miles (pickup to dropoff)" tooltip="Distance of the actual trip from pickup to where you drop the passenger." type="number" placeholder="e.g. 18" value={jobMiles} onChange={e => { setJobMiles(e.target.value); setResult(null); }} />
        <Input label="Dead miles to pickup" tooltip="How far you need to travel to reach the pickup from where you currently are. These cost you fuel but earn nothing." type="number" placeholder="e.g. 4" value={deadMiles} onChange={e => { setDeadMiles(e.target.value); setResult(null); }} />
        <Input label="Total time (minutes)" tooltip="Total time from leaving your current location to dropping the passenger off. Used to calculate your effective hourly rate." type="number" placeholder="e.g. 45" value={minutes} onChange={e => { setMinutes(e.target.value); setResult(null); }} />
        <div style={{ marginBottom: "14px" }}>
          <FieldLabel label="Charges I'll pay" tooltip="Any fees you personally pay for this job — airport drop charges, tolls, ULEZ etc. Tap to select. Edit the amount if it differs." />
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {PRESET_CHARGES.map(c => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", background: myCharges[c.id] ? "#FFF7ED" : C.light, border: `1.5px solid ${myCharges[c.id] ? C.accent : C.border}`, borderRadius: "10px", cursor: "pointer" }} onClick={() => toggleCharge(c.id)}>
                <div style={{ width: "18px", height: "18px", borderRadius: "5px", background: myCharges[c.id] ? C.accent : C.border, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {myCharges[c.id] && <span style={{ color: "#fff", fontSize: "11px", fontWeight: "700" }}>✓</span>}
                </div>
                <div style={{ flex: 1, fontSize: "13px", fontWeight: "500", color: C.text, fontFamily: FONT }}>{c.label}</div>
                {myCharges[c.id]
                  ? <input type="number" value={customAmts[c.id] ?? c.amount} onClick={e => e.stopPropagation()} onChange={e => { setCustomAmts(prev => ({ ...prev, [c.id]: e.target.value })); setResult(null); }} style={{ ...inputStyle, width: "75px", padding: "5px 8px", fontSize: "13px", textAlign: "right" }} />
                  : <span style={{ fontSize: "12px", color: C.muted, fontFamily: FONT }}>{fmt(c.amount)}</span>
                }
              </div>
            ))}
          </div>
          {totalCharges > 0 && <div style={{ fontSize: "12px", color: C.red, marginTop: "8px", fontFamily: FONT, fontWeight: "600" }}>Total charges: {fmt(totalCharges)}</div>}
        </div>
        <Btn onClick={calculate} disabled={!fare}>Calculate</Btn>
      </div>
      {result && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "16px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
          <SectionTitle>Breakdown</SectionTitle>
          <Row label="Fare offered" value={fmt(result.fareNum)} />
          {result.opCut > 0 && <Row label="Operator commission" value={`− ${fmt(result.opCut)}`} color={C.red} />}
          <Row label="Fuel cost" value={`− ${fmt(result.fuelCost)}`} color={C.red} />
          {result.totalCharges > 0 && <Row label="My charges" value={`− ${fmt(result.totalCharges)}`} color={C.red} />}
          <Row label="Take-home" value={fmt(result.net)} color={result.net > 0 ? C.green : C.red} bold />
          {result.hourly !== null && <Row label="Effective hourly rate" value={`${fmt(result.hourly)}/hr`} color={C.accent} />}
          <div style={{ background: verdict.bg, border: `1px solid ${verdict.border}`, borderRadius: "12px", padding: "14px", textAlign: "center", fontWeight: "800", color: verdict.color, fontSize: "16px", margin: "16px 0 12px", fontFamily: FONT }}>{verdict.text}</div>
          {!saved
            ? <Btn onClick={saveJob} color="#6B7280">+ Save to Job Diary</Btn>
            : <div style={{ textAlign: "center", color: C.green, fontSize: "13px", padding: "8px", fontFamily: FONT }}>✓ Saved</div>
          }
        </div>
      )}
    </div>
  );
}

// ─── Operators Manager ────────────────────────────────────────────────────────
const OP_COLORS = ["#16A34A", "#2563EB", "#EA580C", "#DC2626", "#9333EA", "#0891B2", "#D97706", "#BE185D", "#059669", "#7C3AED"];
const COMMISSION_MODELS = [
  { id: "net", label: "Net pay — no commission" },
  { id: "pct", label: "Percentage commission" },
  { id: "fixed_then_pct", label: "Fixed fee, then percentage" },
];

function OperatorsManager({ settings, setSettings }) {
  const operators = settings.operators || [];
  const [showAdd, setShowAdd] = useState(false);
  const [editIdx, setEditIdx] = useState(null);
  const blankOp = { name: "", color: OP_COLORS[0], commissionModel: "net", commissionPct: "", fixedFee: "", hasConfigFee: false, defaultPayment: "Via Operator", notes: "" };
  const [form, setForm] = useState(blankOp);

  function saveOp() {
    if (!form.name.trim()) return;
    const newOp = { ...form, commissionPct: parseFloat(form.commissionPct) || 0, fixedFee: parseFloat(form.fixedFee) || 0 };
    const updated = editIdx !== null
      ? operators.map((o, i) => i === editIdx ? newOp : o)
      : [...operators, newOp];
    setSettings(s => ({ ...s, operators: updated }));
    setForm(blankOp); setShowAdd(false); setEditIdx(null);
  }

  function deleteOp(idx) {
    setSettings(s => ({ ...s, operators: operators.filter((_, i) => i !== idx) }));
  }

  function startEdit(idx) {
    setForm({ ...blankOp, ...operators[idx], commissionPct: String(operators[idx].commissionPct || ""), fixedFee: String(operators[idx].fixedFee || "") });
    setEditIdx(idx); setShowAdd(true);
  }

  function addPreset(preset) {
    if (operators.find(o => o.name === preset.name)) return;
    setSettings(s => ({ ...s, operators: [...(s.operators || []), preset] }));
  }

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "16px", marginBottom: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <SectionTitle>My Operators</SectionTitle>
        {!showAdd && (
          <button onClick={() => { setShowAdd(true); setEditIdx(null); setForm(blankOp); }} style={{ background: C.accent, border: "none", color: "#fff", borderRadius: "8px", padding: "6px 12px", fontSize: "12px", fontWeight: "700", fontFamily: FONT, cursor: "pointer" }}>+ Add</button>
        )}
      </div>

      {/* Quick add presets */}
      {operators.length === 0 && !showAdd && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ fontSize: "12px", color: C.sub, marginBottom: "8px", fontFamily: FONT }}>Quick add common operators:</div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {OPERATOR_PRESETS.map(p => (
              <button key={p.name} onClick={() => addPreset(p)} style={{ padding: "8px 14px", background: p.color + "18", border: `2px solid ${p.color}`, borderRadius: "20px", color: p.color, fontSize: "13px", fontWeight: "700", fontFamily: FONT, cursor: "pointer" }}>+ {p.name}</button>
            ))}
          </div>
          <div style={{ fontSize: "12px", color: C.muted, marginTop: "10px", fontFamily: FONT }}>Or tap Add to set up any operator with custom commission rules.</div>
        </div>
      )}

      {/* Operator list */}
      {operators.map((op, idx) => (
        <div key={idx} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: op.color, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "14px", fontWeight: "700", color: C.text, fontFamily: FONT }}>{op.name}</div>
            <div style={{ fontSize: "11px", color: C.sub, fontFamily: FONT }}>
              {op.commissionModel === "net" ? "Net pay" : op.commissionModel === "pct" ? `${op.commissionPct}% commission` : `£${op.fixedFee} + ${op.commissionPct}%`}
              {op.hasConfigFee ? " · Config fee" : ""}
              {" · "}{op.defaultPayment}
            </div>
          </div>
          <button onClick={() => startEdit(idx)} style={{ background: "none", border: "none", color: C.blue, fontSize: "13px", cursor: "pointer", fontFamily: FONT }}>Edit</button>
          <button onClick={() => deleteOp(idx)} style={{ background: "none", border: "none", color: C.red, fontSize: "18px", cursor: "pointer" }}>✕</button>
        </div>
      ))}

      {/* Add/Edit form */}
      {showAdd && (
        <div style={{ marginTop: "16px", padding: "16px", background: C.light, borderRadius: "12px", border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: "14px", fontWeight: "700", color: C.text, marginBottom: "14px", fontFamily: FONT }}>{editIdx !== null ? "Edit operator" : "Add operator"}</div>

          <Input label="Operator name" type="text" placeholder="e.g. FalconCars, Skyline, My Private Clients" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />

          {/* Colour picker */}
          <div style={{ marginBottom: "14px" }}>
            <FieldLabel label="Colour tag" />
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {OP_COLORS.map(c => (
                <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))} style={{ width: "28px", height: "28px", borderRadius: "50%", background: c, border: form.color === c ? `3px solid ${C.text}` : "3px solid transparent", cursor: "pointer" }} />
              ))}
            </div>
          </div>

          {/* Commission model */}
          <div style={{ marginBottom: "14px" }}>
            <FieldLabel label="Commission model" tooltip="How this operator calculates what they pay you." />
            {COMMISSION_MODELS.map(m => (
              <button key={m.id} onClick={() => setForm(f => ({ ...f, commissionModel: m.id }))} style={{ display: "block", width: "100%", padding: "10px 14px", marginBottom: "6px", textAlign: "left", background: form.commissionModel === m.id ? C.blueBg : C.card, border: `2px solid ${form.commissionModel === m.id ? C.blue : C.border}`, borderRadius: "10px", color: form.commissionModel === m.id ? C.blue : C.sub, fontSize: "13px", fontWeight: "600", fontFamily: FONT, cursor: "pointer" }}>{m.label}</button>
            ))}
          </div>

          {form.commissionModel === "pct" && (
            <Input label="Commission %" type="number" placeholder="e.g. 15" value={form.commissionPct} onChange={e => setForm(f => ({ ...f, commissionPct: e.target.value }))} />
          )}
          {form.commissionModel === "fixed_then_pct" && (
            <>
              <Input label="Fixed fee (£)" tooltip="Amount deducted first before commission is applied" type="number" placeholder="e.g. 0.20" value={form.fixedFee} onChange={e => setForm(f => ({ ...f, fixedFee: e.target.value }))} />
              <Input label="Commission % on remainder" type="number" placeholder="e.g. 17" value={form.commissionPct} onChange={e => setForm(f => ({ ...f, commissionPct: e.target.value }))} />
            </>
          )}

          {/* Config fee toggle */}
          <div style={{ marginBottom: "14px" }}>
            <FieldLabel label="Has config fee?" tooltip="A per-job fee that goes back to the operator before commission is calculated. The amount varies per job so you'll enter it manually each time." />
            <div style={{ display: "flex", gap: "8px" }}>
              {[{ v: false, label: "No" }, { v: true, label: "Yes — show config fee field on jobs" }].map(opt => (
                <button key={String(opt.v)} onClick={() => setForm(f => ({ ...f, hasConfigFee: opt.v }))} style={{ flex: 1, padding: "10px", background: form.hasConfigFee === opt.v ? C.blueBg : C.light, border: `2px solid ${form.hasConfigFee === opt.v ? C.blue : C.border}`, borderRadius: "10px", color: form.hasConfigFee === opt.v ? C.blue : C.sub, fontSize: "12px", fontWeight: "600", fontFamily: FONT, cursor: "pointer" }}>{opt.label}</button>
              ))}
            </div>
          </div>

          {/* Default payment */}
          <div style={{ marginBottom: "14px" }}>
            <FieldLabel label="Default payment method" />
            <div style={{ display: "flex", gap: "6px" }}>
              {PAYMENT_METHODS.map(m => (
                <button key={m} onClick={() => setForm(f => ({ ...f, defaultPayment: m }))} style={{ flex: 1, padding: "8px 4px", background: form.defaultPayment === m ? C.blueBg : C.light, border: `2px solid ${form.defaultPayment === m ? C.blue : C.border}`, borderRadius: "10px", color: form.defaultPayment === m ? C.blue : C.sub, fontSize: "10px", fontWeight: "600", fontFamily: FONT, cursor: "pointer", textAlign: "center" }}>{PAYMENT_ICONS[m]}<br />{m}</button>
              ))}
            </div>
          </div>

          <Input label="Notes (optional)" type="text" placeholder="e.g. Pays weekly on Thursdays" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />

          <div style={{ display: "flex", gap: "10px" }}>
            <button onClick={() => { setShowAdd(false); setEditIdx(null); setForm(blankOp); }} style={{ flex: 1, padding: "13px", background: C.light, border: `1px solid ${C.border}`, borderRadius: "12px", color: C.sub, fontSize: "14px", fontWeight: "600", fontFamily: FONT, cursor: "pointer" }}>Cancel</button>
            <div style={{ flex: 1 }}><Btn onClick={saveOp} disabled={!form.name.trim()}>{editIdx !== null ? "Save changes" : "Add operator"}</Btn></div>
          </div>
        </div>
      )}

      {operators.length > 0 && !showAdd && (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "12px" }}>
          {OPERATOR_PRESETS.filter(p => !operators.find(o => o.name === p.name)).map(p => (
            <button key={p.name} onClick={() => addPreset(p)} style={{ padding: "6px 12px", background: p.color + "18", border: `1px solid ${p.color}44`, borderRadius: "20px", color: p.color, fontSize: "11px", fontWeight: "600", fontFamily: FONT, cursor: "pointer" }}>+ {p.name}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Expenses ─────────────────────────────────────────────────────────────────
function Expenses({ expenses, setExpenses, fuelLogs, setFuelLogs, settings, setSettings }) {
  const [subTab, setSubTab] = useState("expense");
  const [expForm, setExpForm] = useState({ date: today(), category: EXPENSE_CATS[0], amount: "", notes: "" });
  const [fuelForm, setFuelForm] = useState({ date: today(), cost: "", litres: "", mileage: "", notes: "" });
  const [expAdded, setExpAdded] = useState(false);
  const [fuelAdded, setFuelAdded] = useState(false);

  function addExpense() {
    if (!expForm.amount) return;
    setExpenses(prev => [{ id: Date.now(), ...expForm, amount: parseFloat(expForm.amount) }, ...prev]);
    setExpForm(f => ({ ...f, amount: "", notes: "" }));
    setExpAdded(true); setTimeout(() => setExpAdded(false), 2000);
  }
  function addFuel() {
    if (!fuelForm.cost) return;
    setFuelLogs(prev => [{ id: Date.now(), ...fuelForm, cost: parseFloat(fuelForm.cost), litres: parseFloat(fuelForm.litres) || 0, mileage: parseFloat(fuelForm.mileage) || 0 }, ...prev]);
    setFuelForm(f => ({ ...f, cost: "", litres: "", mileage: "", notes: "" }));
    setFuelAdded(true); setTimeout(() => setFuelAdded(false), 2000);
  }

  const totalFuel = fuelLogs.reduce((s, f) => s + f.cost, 0);
  const totalOther = expenses.reduce((s, e) => s + e.amount, 0);

  return (
    <div>
      <TabIntro storageKey="intro_expenses" icon="🧾" title="Costs Tab" body="Log all your business expenses here — fuel fill-ups, car washes, insurance, TfL licence renewals and anything else. These are deducted from your earnings in the P&L on the Home tab." />
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "14px", marginBottom: "16px" }}>
        <SectionTitle>Settings</SectionTitle>
        <Field label="Fuel cost per mile (£)" hint="Diesel avg ≈ £0.16–0.20/mi" tooltip="Enter how much fuel costs you per mile. Divide your last fill-up cost by miles driven since previous fill-up.">
          <input style={inputStyle} type="number" step="0.01" value={settings.fuelCostPerMile} onChange={e => setSettings(s => ({ ...s, fuelCostPerMile: parseFloat(e.target.value) || 0 }))} />
        </Field>
        <Field label="Card machine fee %" hint="Default fee used when logging card payments" tooltip="Your card reader's standard transaction fee percentage. Used as the default when you log a card payment job.">
          <input style={inputStyle} type="number" step="0.01" placeholder="e.g. 1.69" value={settings.cardFeePct || ""} onChange={e => setSettings(s => ({ ...s, cardFeePct: parseFloat(e.target.value) || 0 }))} />
        </Field>
      </div>

      {/* My Operators */}
      <OperatorsManager settings={settings} setSettings={setSettings} />
      <div style={{ display: "flex", gap: "6px", marginBottom: "16px", background: C.surface, borderRadius: "12px", padding: "4px", border: `1px solid ${C.border}` }}>
        {[{ id: "expense", label: "Add Expense" }, { id: "fuel", label: "Log Fuel" }, { id: "history", label: "History" }].map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)} style={{ flex: 1, padding: "9px 4px", background: subTab === t.id ? C.accent : "transparent", color: subTab === t.id ? "#fff" : C.sub, border: "none", borderRadius: "9px", fontSize: "11px", fontWeight: "700", fontFamily: FONT, cursor: "pointer" }}>{t.label}</button>
        ))}
      </div>
      {subTab === "expense" && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "16px" }}>
          <Input label="Date" type="date" value={expForm.date} onChange={e => setExpForm(f => ({ ...f, date: e.target.value }))} />
          <Select label="Category" options={EXPENSE_CATS} value={expForm.category} onChange={e => setExpForm(f => ({ ...f, category: e.target.value }))} />
          <Input label="Amount (£)" type="number" placeholder="e.g. 12.00" value={expForm.amount} onChange={e => setExpForm(f => ({ ...f, amount: e.target.value }))} />
          <Input label="Notes (optional)" type="text" placeholder="e.g. hand car wash Luton" value={expForm.notes} onChange={e => setExpForm(f => ({ ...f, notes: e.target.value }))} />
          <Btn onClick={addExpense} disabled={!expForm.amount}>Add Expense</Btn>
          {expAdded && <div style={{ textAlign: "center", color: C.green, fontSize: "13px", marginTop: "8px", fontFamily: FONT }}>✓ Added</div>}
        </div>
      )}
      {subTab === "fuel" && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "16px" }}>
          <Input label="Date" type="date" value={fuelForm.date} onChange={e => setFuelForm(f => ({ ...f, date: e.target.value }))} />
          <Input label="Total cost (£)" type="number" placeholder="e.g. 65.00" value={fuelForm.cost} onChange={e => setFuelForm(f => ({ ...f, cost: e.target.value }))} />
          <Input label="Litres (optional)" type="number" placeholder="e.g. 45" value={fuelForm.litres} onChange={e => setFuelForm(f => ({ ...f, litres: e.target.value }))} />
          <Input label="Odometer reading (optional)" tooltip="The total mileage on your car's dashboard. Used to calculate MPG over time." type="number" placeholder="e.g. 48234" value={fuelForm.mileage} onChange={e => setFuelForm(f => ({ ...f, mileage: e.target.value }))} />
          <Input label="Notes" type="text" placeholder="e.g. Shell M1" value={fuelForm.notes} onChange={e => setFuelForm(f => ({ ...f, notes: e.target.value }))} />
          <Btn onClick={addFuel} disabled={!fuelForm.cost}>Log Fill-Up</Btn>
          {fuelAdded && <div style={{ textAlign: "center", color: C.green, fontSize: "13px", marginTop: "8px", fontFamily: FONT }}>✓ Logged</div>}
        </div>
      )}
      {subTab === "history" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "16px" }}>
            <StatCard label="Total Fuel" value={fmt(totalFuel)} color={C.red} sub={`${fuelLogs.length} fill-ups`} />
            <StatCard label="Other Costs" value={fmt(totalOther)} color={C.orange} sub={`${expenses.length} items`} />
          </div>
          <SectionTitle>Expenses</SectionTitle>
          {expenses.length === 0
            ? <div style={{ color: C.sub, fontSize: "13px", marginBottom: "16px", fontFamily: FONT }}>None logged</div>
            : expenses.map(e => (
              <div key={e.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "13px", marginBottom: "8px", display: "flex", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: "12px", color: C.sub, fontFamily: FONT }}>{e.date} · {e.category}</div>
                  {e.notes && <div style={{ fontSize: "12px", color: C.sub, fontFamily: FONT }}>{e.notes}</div>}
                  <div style={{ color: C.red, fontWeight: "700", marginTop: "3px", fontFamily: FONT }}>− {fmt(e.amount)}</div>
                </div>
                <button onClick={() => setExpenses(prev => prev.filter(x => x.id !== e.id))} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: "18px" }}>✕</button>
              </div>
            ))
          }
          <SectionTitle>Fuel Fill-Ups</SectionTitle>
          {fuelLogs.length === 0
            ? <div style={{ color: C.sub, fontSize: "13px", fontFamily: FONT }}>None logged</div>
            : fuelLogs.map(f => (
              <div key={f.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "13px", marginBottom: "8px", display: "flex", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: "12px", color: C.sub, fontFamily: FONT }}>{f.date}{f.notes ? ` · ${f.notes}` : ""}</div>
                  {f.litres > 0 && <div style={{ fontSize: "12px", color: C.sub, fontFamily: FONT }}>{f.litres}L{f.mileage > 0 ? ` · ${f.mileage.toLocaleString()} mi` : ""}</div>}
                  <div style={{ color: C.red, fontWeight: "700", marginTop: "3px", fontFamily: FONT }}>− {fmt(f.cost)}</div>
                </div>
                <button onClick={() => setFuelLogs(prev => prev.filter(x => x.id !== f.id))} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: "18px" }}>✕</button>
              </div>
            ))
          }
        </>
      )}
    </div>
  );
}

// ─── Mileage ──────────────────────────────────────────────────────────────────
function Mileage({ jobs, shifts, setShifts, fuelLogs }) {
  const totalBusiness = shifts.reduce((s, sh) => s + (sh.shiftMiles || 0), 0);
  const totalJob = jobs.reduce((s, j) => s + (j.jobMiles || 0), 0);
  const totalDead = jobs.reduce((s, j) => s + (j.deadMiles || 0), 0);
  const deadPct = (totalJob + totalDead) > 0 ? (totalDead / (totalJob + totalDead) * 100).toFixed(1) : 0;
  const hmrc = totalBusiness <= HMRC_THRESHOLD ? totalBusiness * HMRC_RATE_1 : HMRC_THRESHOLD * HMRC_RATE_1 + (totalBusiness - HMRC_THRESHOLD) * HMRC_RATE_2;
  const remaining10k = Math.max(0, HMRC_THRESHOLD - totalBusiness);
  const sorted = [...fuelLogs].filter(f => f.mileage > 0).sort((a, b) => a.mileage - b.mileage);
  let mpg = null;
  if (sorted.length >= 2) {
    const miles = sorted[sorted.length - 1].mileage - sorted[0].mileage;
    const litres = sorted.slice(1).reduce((s, f) => s + f.litres, 0);
    if (litres > 0) mpg = (miles / (litres * 0.2199692)).toFixed(1);
  }

  return (
    <div>
      <TabIntro storageKey="intro_mileage" icon="🛣️" title="Miles Tab" body="Track your business mileage for HMRC. Every completed shift logs your miles automatically. You can claim 45p per mile for the first 10,000 business miles each tax year, then 25p — this is instead of claiming actual fuel costs." />
      <SectionTitle>Mileage Overview</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "18px" }}>
        <StatCard label="Business Miles" value={totalBusiness.toFixed(0)} color={C.accent} sub="from shift logs" />
        <StatCard label="HMRC Claimable" value={fmt(hmrc)} color={C.green} />
        <StatCard label="Job Miles" value={totalJob.toFixed(0)} color={C.blue} sub="from job diary" />
        <StatCard label="Dead Mile %" value={`${deadPct}%`} color={parseFloat(deadPct) > 30 ? C.red : C.orange} sub="of job miles" />
      </div>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "16px", marginBottom: "16px" }}>
        <SectionTitle>HMRC Mileage Allowance</SectionTitle>
        <Row label="Business miles" value={`${totalBusiness.toFixed(0)} mi`} />
        <Row label="First 10,000 mi rate" value="45p / mile" />
        <Row label="Above 10,000 mi rate" value="25p / mile" />
        <Row label="Total claimable" value={fmt(hmrc)} color={C.green} bold />
        {remaining10k > 0
          ? <div style={{ fontSize: "12px", color: C.sub, marginTop: "10px", fontFamily: FONT }}>{remaining10k.toFixed(0)} miles remaining at the 45p rate this tax year.</div>
          : <div style={{ fontSize: "12px", color: C.orange, marginTop: "10px", fontFamily: FONT }}>You've passed 10,000 miles — now earning 25p/mile.</div>
        }
      </div>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "16px", marginBottom: "16px" }}>
        <SectionTitle>Shift Log ({shifts.length} shifts)</SectionTitle>
        {shifts.length === 0
          ? <div style={{ color: C.sub, fontSize: "13px", fontFamily: FONT }}>No completed shifts yet. Use Start Shift on the home tab.</div>
          : shifts.slice(0, 10).map(sh => (
            <div key={sh.id} style={{ padding: "10px 0", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", gap: "10px" }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "13px", color: C.sub, fontFamily: FONT }}>{dateStr(sh.startTs)}</span>
                  <span style={{ fontSize: "13px", color: C.accent, fontWeight: "700", fontFamily: FONT }}>{sh.shiftMiles > 0 ? `${sh.shiftMiles.toFixed(0)} mi` : "No mileage"}</span>
                </div>
                <div style={{ color: C.muted, fontSize: "12px", marginTop: "2px", fontFamily: FONT }}>
                  {timeStr(sh.startTs)} → {sh.endTs ? timeStr(sh.endTs) : "—"} · {sh.mileageMode === "trip" ? "Trip meter" : sh.mileageMode === "odometer" ? "Odometer" : "No tracking"}
                </div>
              </div>
              <button onClick={() => setShifts(prev => prev.filter(x => x.id !== sh.id))} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: "18px" }}>✕</button>
            </div>
          ))
        }
      </div>
      {mpg && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "16px", marginBottom: "16px" }}>
          <SectionTitle>Fuel Efficiency</SectionTitle>
          <Row label="Estimated MPG" value={`${mpg} mpg`} color={C.accent} bold />
          <div style={{ fontSize: "12px", color: C.sub, marginTop: "8px", fontFamily: FONT }}>Calculated from odometer readings in your fuel log.</div>
        </div>
      )}
      <div style={{ background: C.greenBg, border: `1px solid ${C.greenBorder}`, borderRadius: "14px", padding: "16px" }}>
        <SectionTitle>HMRC Tip</SectionTitle>
        <div style={{ fontSize: "13px", color: C.sub, lineHeight: "1.8", fontFamily: FONT }}>
          Mileage allowance is claimed <span style={{ color: C.green, fontWeight: "600" }}>instead of</span> actual fuel costs — not in addition. Most drivers find the allowance more beneficial. Always consult your accountant.
        </div>
      </div>
    </div>
  );
}
