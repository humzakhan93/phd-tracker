import { useState, useEffect } from "react";
import { supabase } from "./supabase";

// ─── Constants ────────────────────────────────────────────────────────────────
const OPERATORS = ["Uber", "Bolt", "Airport Transfer", "Local Operator", "Other"];
const EXPENSE_CATS = ["Car Wash", "Insurance", "Phone", "TfL Licence", "Maintenance", "Parking", "Other"];
const HMRC_RATE_1 = 0.45;
const HMRC_RATE_2 = 0.25;
const HMRC_THRESHOLD = 10000;
const TAX_YEAR_START = "2025-04-06";

// Pre-populated charges — editable by driver
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

const fmt = (n) => `£${Math.abs(Number(n || 0)).toFixed(2)}`;
const today = () => new Date().toISOString().slice(0, 10);
const timeStr = (ts) => new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const dateStr = (ts) => new Date(ts).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const minsToHHMM = (m) => `${Math.floor(m / 60)}h ${Math.round(m % 60)}m`;

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function save(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }

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

// Tooltip component — question mark icon with popup explanation
function Tooltip({ text }) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-block", marginLeft: "6px" }}>
      <button
        onClick={() => setShow(s => !s)}
        style={{
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

// Info banner shown once per tab
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

// ─── Live elapsed time ────────────────────────────────────────────────────────
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

  function toggleCharge(id) {
    setSelectedCharges(prev => ({ ...prev, [id]: !prev[id] }));
  }

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

        {/* Mileage */}
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

        {/* Fuel */}
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

        {/* Tolls & Charges */}
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
                  <input
                    type="number"
                    value={customChargeAmts[c.id] ?? c.amount}
                    onClick={e => e.stopPropagation()}
                    onChange={e => setCustomChargeAmts(prev => ({ ...prev, [c.id]: e.target.value }))}
                    style={{ ...inputStyle, width: "80px", padding: "6px 10px", fontSize: "14px", textAlign: "right" }}
                  />
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

        {/* Other */}
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

        {/* Summary */}
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

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
    const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState("login");
  const [tab, setTab] = useState("dashboard");
  const [jobs, setJobs] = useState(() => load("phd_jobs", []));
  const [expenses, setExpenses] = useState(() => load("phd_expenses", []));
  const [fuelLogs, setFuelLogs] = useState(() => load("phd_fuel", []));
  const [shifts, setShifts] = useState(() => load("phd_shifts", []));
  const [activeShift, setActiveShift] = useState(() => load("phd_active_shift", null));
  const [settings, setSettings] = useState(() => load("phd_settings", { fuelCostPerMile: 0.18 }));
  const [showStart, setShowStart] = useState(false);
  const [showEnd, setShowEnd] = useState(false);

  useEffect(() => { save("phd_jobs", jobs); }, [jobs]);
  useEffect(() => { save("phd_expenses", expenses); }, [expenses]);
  useEffect(() => { save("phd_fuel", fuelLogs); }, [fuelLogs]);
  useEffect(() => { save("phd_shifts", shifts); }, [shifts]);
  useEffect(() => { save("phd_active_shift", activeShift); }, [activeShift]);
  useEffect(() => { save("phd_settings", settings); }, [settings]);

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

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: FONT, paddingBottom: "72px" }}>
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "14px 20px 12px", display: "flex", alignItems: "center", gap: "12px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
        <img src="/logo.png" alt="Driver Ledger" style={{ width: "36px", height: "36px", borderRadius: "8px", objectFit: "contain" }} />
        <div>
          <div style={{ fontSize: "17px", fontWeight: "800", color: C.text, fontFamily: FONT }}>Driver Ledger</div>
          <div style={{ fontSize: "11px", color: C.sub, fontFamily: FONT }}>Private Hire · Business Manager</div>
        </div>
        {activeShift && (
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "6px", background: C.greenBg, border: `1px solid ${C.greenBorder}`, borderRadius: "20px", padding: "4px 10px" }}>
            <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: C.green }} />
            <span style={{ fontSize: "11px", color: C.green, fontWeight: "600", fontFamily: FONT }}>On Shift</span>
          </div>
        )}
      </div>

      <div style={{ padding: "16px" }}>
        {tab === "dashboard" && <Dashboard jobs={jobs} expenses={expenses} fuelLogs={fuelLogs} shifts={shifts} activeShift={activeShift} settings={settings} onStartShift={() => setShowStart(true)} onEndShift={() => setShowEnd(true)} />}
        {tab === "jobs" && <Jobs jobs={jobs} setJobs={setJobs} settings={settings} activeShift={activeShift} />}
        {tab === "expenses" && <Expenses expenses={expenses} setExpenses={setExpenses} fuelLogs={fuelLogs} setFuelLogs={setFuelLogs} settings={settings} setSettings={setSettings} />}
        {tab === "mileage" && <Mileage jobs={jobs} shifts={shifts} fuelLogs={fuelLogs} />}
        {tab === "calc" && <FareCheck settings={settings} jobs={jobs} setJobs={setJobs} activeShift={activeShift} />}
      </div>

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
  const [range, setRange] = useState("week");
  const elapsed = useElapsed(activeShift?.startTs);

  const rangeStart = (() => {
    const now = new Date();
    if (range === "week") { const d = new Date(now); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10); }
    if (range === "month") { const d = new Date(now); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 10); }
    if (range === "taxyear") return TAX_YEAR_START;
    return "2000-01-01";
  })();

  const fj = jobs.filter(j => j.date >= rangeStart);
  const fe = expenses.filter(e => e.date >= rangeStart);
  const ff = fuelLogs.filter(f => f.date >= rangeStart);
  const grossFares = fj.reduce((s, j) => s + (j.fare || 0), 0);
  const opCuts = fj.reduce((s, j) => s + (j.opCut || 0), 0);
  const netFares = grossFares - opCuts;
  const fuelSpend = ff.reduce((s, f) => s + (f.cost || 0), 0);
  const otherExp = fe.reduce((s, e) => s + (e.amount || 0), 0);
  const netProfit = netFares - fuelSpend - otherExp;
  const totalMins = fj.reduce((s, j) => s + (j.minutes || 0), 0);
  const hourlyRate = totalMins > 0 ? netFares / (totalMins / 60) : 0;
  const allBusinessMiles = shifts.reduce((s, sh) => s + (sh.shiftMiles || 0), 0);
  const hmrc = allBusinessMiles <= HMRC_THRESHOLD ? allBusinessMiles * HMRC_RATE_1 : HMRC_THRESHOLD * HMRC_RATE_1 + (allBusinessMiles - HMRC_THRESHOLD) * HMRC_RATE_2;

  const byOp = OPERATORS.map(op => {
    const opJobs = fj.filter(j => j.operator === op);
    const net = opJobs.reduce((s, j) => s + (j.netEarnings || 0), 0);
    const mins = opJobs.reduce((s, j) => s + (j.minutes || 0), 0);
    return { op, count: opJobs.length, net, hr: mins > 0 ? net / (mins / 60) : 0 };
  }).filter(x => x.count > 0).sort((a, b) => b.net - a.net);

  const ranges = [{ id: "week", label: "7 Days" }, { id: "month", label: "Month" }, { id: "taxyear", label: "Tax Year" }, { id: "all", label: "All" }];

  return (
    <div>
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
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

      <div style={{ display: "flex", gap: "6px", marginBottom: "16px", background: C.surface, borderRadius: "12px", padding: "4px", border: `1px solid ${C.border}` }}>
        {ranges.map(r => (
          <button key={r.id} onClick={() => setRange(r.id)} style={{ flex: 1, padding: "8px 4px", background: range === r.id ? C.accent : "transparent", color: range === r.id ? "#fff" : C.sub, border: "none", borderRadius: "9px", fontSize: "12px", fontWeight: "700", fontFamily: FONT, cursor: "pointer", transition: "all 0.15s" }}>{r.label}</button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "16px" }}>
        <StatCard label="Net Profit" value={fmt(netProfit)} color={netProfit >= 0 ? C.green : C.red} sub={`${fj.length} jobs`} />
        <StatCard label="Gross Fares" value={fmt(grossFares)} color={C.accent} />
        <StatCard label="Effective £/hr" value={totalMins > 0 ? fmt(hourlyRate) : "—"} color={C.blue} sub="after op. cut" />
        <StatCard label="Total Costs" value={fmt(fuelSpend + otherExp)} color={C.red} />
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "16px", marginBottom: "16px", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
        <SectionTitle>P&L Breakdown</SectionTitle>
        <Row label="Gross fares" value={fmt(grossFares)} />
        <Row label="Operator cuts" value={`− ${fmt(opCuts)}`} color={C.red} />
        <Row label="Net from rides" value={fmt(netFares)} color={C.green} bold />
        <Row label="Fuel spend" value={`− ${fmt(fuelSpend)}`} color={C.red} />
        <Row label="Other expenses" value={`− ${fmt(otherExp)}`} color={C.red} />
        <Row label="Net profit" value={fmt(netProfit)} color={netProfit >= 0 ? C.green : C.red} bold />
      </div>

      {byOp.length > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "16px", marginBottom: "16px", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
          <SectionTitle>By Operator</SectionTitle>
          {byOp.map(({ op, count, net, hr }) => (
            <div key={op} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
              <div><Pill label={op} color={OP_COLOR[op]} /><div style={{ fontSize: "11px", color: C.sub, marginTop: "4px", fontFamily: FONT }}>{count} job{count !== 1 ? "s" : ""}</div></div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: "700", fontFamily: FONT }}>{fmt(net)}</div>
                {hr > 0 && <div style={{ fontSize: "11px", color: C.accent, fontFamily: FONT }}>{fmt(hr)}/hr</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ background: C.greenBg, border: `1px solid ${C.greenBorder}`, borderRadius: "14px", padding: "16px" }}>
        <SectionTitle>HMRC Mileage (Tax Year)</SectionTitle>
        <Row label="Business miles logged" value={`${allBusinessMiles.toFixed(0)} mi`} />
        <Row label="Claimable allowance" value={fmt(hmrc)} color={C.green} bold />
        <div style={{ fontSize: "12px", color: C.sub, marginTop: "10px", fontFamily: FONT }}>Based on shift mileage logs. First 10,000 mi @ 45p, then 25p.</div>
      </div>
    </div>
  );
}

// ─── Jobs ─────────────────────────────────────────────────────────────────────
function Jobs({ jobs, setJobs, settings, activeShift }) {
  const [logMode, setLogMode] = useState("job"); // job | day | notes
  const [jobForm, setJobForm] = useState({ date: today(), operator: "Uber", fare: "", isNet: "yes", commissionPct: "", jobMiles: "", deadMiles: "", minutes: "", notes: "" });
  const [dayForm, setDayForm] = useState({ date: today(), operator: "Uber", totalFare: "", isNet: "yes", commissionPct: "", totalJobs: "", totalMiles: "", notes: "" });
  const [notesText, setNotesText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseResult, setParseResult] = useState(null);
  const [added, setAdded] = useState(false);

  function calcNet(fare, isNet, commPct) {
    if (isNet === "yes") return parseFloat(fare) || 0;
    const pct = parseFloat(commPct) || 0;
    return (parseFloat(fare) || 0) * (1 - pct / 100);
  }

  function addJob() {
    const fare = parseFloat(jobForm.fare);
    const jobMiles = parseFloat(jobForm.jobMiles) || 0;
    if (!fare) return;
    const netFare = calcNet(fare, jobForm.isNet, jobForm.commissionPct);
    const opCut = fare - netFare;
    const fuelCost = (jobMiles + (parseFloat(jobForm.deadMiles) || 0)) * settings.fuelCostPerMile;
    setJobs(prev => [{ id: Date.now(), date: jobForm.date, operator: jobForm.operator, fare, netFare, opCut, jobMiles, deadMiles: parseFloat(jobForm.deadMiles) || 0, minutes: parseFloat(jobForm.minutes) || 0, netEarnings: netFare - fuelCost, notes: jobForm.notes, shiftId: activeShift?.id || null, type: "job" }, ...prev]);
    setJobForm(f => ({ ...f, fare: "", jobMiles: "", deadMiles: "", minutes: "", notes: "" }));
    setAdded(true); setTimeout(() => setAdded(false), 2000);
  }

  function addDay() {
    const fare = parseFloat(dayForm.totalFare);
    if (!fare) return;
    const netFare = calcNet(fare, dayForm.isNet, dayForm.commissionPct);
    const opCut = fare - netFare;
    const fuelCost = (parseFloat(dayForm.totalMiles) || 0) * settings.fuelCostPerMile;
    setJobs(prev => [{ id: Date.now(), date: dayForm.date, operator: dayForm.operator, fare, netFare, opCut, jobMiles: parseFloat(dayForm.totalMiles) || 0, deadMiles: 0, minutes: 0, netEarnings: netFare - fuelCost, notes: dayForm.notes || `${dayForm.totalJobs || "?"} jobs`, shiftId: activeShift?.id || null, type: "day" }, ...prev]);
    setDayForm(f => ({ ...f, totalFare: "", totalJobs: "", totalMiles: "", notes: "" }));
    setAdded(true); setTimeout(() => setAdded(false), 2000);
  }

  async function parseNotes() {
    if (!notesText.trim()) return;
    setParsing(true); setParseResult(null);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: `You extract private hire driver earnings from free text notes. Return ONLY valid JSON array, no markdown. Each item: { "date": "YYYY-MM-DD or null", "operator": "Uber|Bolt|Airport Transfer|Local Operator|Other", "fare": number, "isNet": true, "jobMiles": number or null, "notes": "string" }. Today is ${today()}. If no date mentioned assume today. Fare is always the amount mentioned. If weekly/daily totals mentioned, create one entry per operator per day/period.`,
          messages: [{ role: "user", content: `Extract earnings from these notes: ${notesText}` }]
        })
      });
      const data = await res.json();
      const text = data.content?.map(b => b.text || "").join("") || "";
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      setParseResult(parsed);
    } catch { setParseResult([]); }
    setParsing(false);
  }

  function importParsed() {
    if (!parseResult?.length) return;
    const newJobs = parseResult.map(p => {
      const fare = p.fare || 0;
      const netFare = p.isNet ? fare : fare * 0.75;
      const opCut = fare - netFare;
      const fuelCost = (p.jobMiles || 0) * settings.fuelCostPerMile;
      return { id: Date.now() + Math.random(), date: p.date || today(), operator: p.operator || "Other", fare, netFare, opCut, jobMiles: p.jobMiles || 0, deadMiles: 0, minutes: 0, netEarnings: netFare - fuelCost, notes: p.notes || "", shiftId: null, type: "imported" };
    });
    setJobs(prev => [...newJobs, ...prev]);
    setNotesText(""); setParseResult(null);
    setAdded(true); setTimeout(() => setAdded(false), 2000);
  }

  const FareTypeToggle = ({ value, onChange, commPct, onCommChange }) => (
    <div style={{ marginBottom: "14px" }}>
      <FieldLabel label="Is this the net amount you receive?" tooltip="Net means you get this exact amount. Gross means a commission % will be deducted from it." />
      <div style={{ display: "flex", gap: "8px", marginBottom: commPct !== undefined && value === "no" ? "10px" : 0 }}>
        {[{ v: "yes", label: "Yes — net amount" }, { v: "no", label: "No — commission taken" }].map(opt => (
          <button key={opt.v} onClick={() => onChange(opt.v)} style={{ flex: 1, padding: "10px", background: value === opt.v ? C.greenBg : C.light, border: `2px solid ${value === opt.v ? C.green : C.border}`, borderRadius: "10px", color: value === opt.v ? C.green : C.sub, fontSize: "12px", fontWeight: "600", fontFamily: FONT, cursor: "pointer" }}>{opt.label}</button>
        ))}
      </div>
      {value === "no" && (
        <input style={{ ...inputStyle, marginTop: "8px" }} type="number" placeholder="Commission % (e.g. 25)" value={commPct} onChange={e => onCommChange(e.target.value)} />
      )}
    </div>
  );

  return (
    <div>
      <TabIntro storageKey="intro_jobs" icon="🚖" title="Jobs Tab" body="Log your earnings here. Choose how you want to enter data — job by job for full detail, daily totals for speed, or paste your notes and let AI extract everything automatically." />

      {activeShift && (
        <div style={{ background: C.greenBg, border: `1px solid ${C.greenBorder}`, borderRadius: "12px", padding: "10px 14px", marginBottom: "16px", fontSize: "13px", color: C.green, fontWeight: "600", fontFamily: FONT }}>
          ● Shift active — jobs added will be linked to this shift
        </div>
      )}

      {/* Mode selector */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "16px", background: C.surface, borderRadius: "12px", padding: "4px", border: `1px solid ${C.border}` }}>
        {[{ id: "job", label: "By Job" }, { id: "day", label: "By Day" }, { id: "notes", label: "Paste Notes" }].map(m => (
          <button key={m.id} onClick={() => setLogMode(m.id)} style={{ flex: 1, padding: "9px 4px", background: logMode === m.id ? C.accent : "transparent", color: logMode === m.id ? "#fff" : C.sub, border: "none", borderRadius: "9px", fontSize: "12px", fontWeight: "700", fontFamily: FONT, cursor: "pointer" }}>{m.label}</button>
        ))}
      </div>

      {/* By Job */}
      {logMode === "job" && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "16px", marginBottom: "20px" }}>
          <SectionTitle>Log a Single Job</SectionTitle>
          <Input label="Date" type="date" value={jobForm.date} onChange={e => setJobForm(f => ({ ...f, date: e.target.value }))} />
          <Select label="Operator" options={OPERATORS} value={jobForm.operator} onChange={e => setJobForm(f => ({ ...f, operator: e.target.value }))} />
          <Input label="Fare (£)" tooltip="The amount shown for this job before any deductions." type="number" placeholder="e.g. 22.00" value={jobForm.fare} onChange={e => setJobForm(f => ({ ...f, fare: e.target.value }))} />
          <FareTypeToggle value={jobForm.isNet} onChange={v => setJobForm(f => ({ ...f, isNet: v }))} commPct={jobForm.commissionPct} onCommChange={v => setJobForm(f => ({ ...f, commissionPct: v }))} />
          <Input label="Job miles (pickup to dropoff)" tooltip="Distance of the actual trip — pickup location to where you drop the passenger." type="number" placeholder="e.g. 15" value={jobForm.jobMiles} onChange={e => setJobForm(f => ({ ...f, jobMiles: e.target.value }))} />
          <Input label="Dead miles to pickup" tooltip="Miles you drove to reach the pickup from where you were. These cost you fuel but earn nothing." type="number" placeholder="e.g. 2" value={jobForm.deadMiles} onChange={e => setJobForm(f => ({ ...f, deadMiles: e.target.value }))} />
          <Input label="Total time (minutes)" tooltip="Total time from when you left for the pickup to when you dropped the passenger off. Includes travel to pickup + the trip itself." type="number" placeholder="e.g. 40" value={jobForm.minutes} onChange={e => setJobForm(f => ({ ...f, minutes: e.target.value }))} />
          <Input label="Notes (optional)" type="text" placeholder="e.g. Luton airport run" value={jobForm.notes} onChange={e => setJobForm(f => ({ ...f, notes: e.target.value }))} />
          <Btn onClick={addJob} disabled={!jobForm.fare}>Add Job</Btn>
          {added && <div style={{ textAlign: "center", color: C.green, fontSize: "13px", marginTop: "8px", fontFamily: FONT }}>✓ Added</div>}
        </div>
      )}

      {/* By Day */}
      {logMode === "day" && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "16px", marginBottom: "20px" }}>
          <SectionTitle>Log Daily Total</SectionTitle>
          <div style={{ background: C.blueBg, border: `1px solid ${C.blueBorder}`, borderRadius: "10px", padding: "12px", marginBottom: "14px", fontSize: "13px", color: C.blue, fontFamily: FONT }}>
            Use this to log your total earnings for a full day or session with one operator. Great for end-of-day logging.
          </div>
          <Input label="Date" type="date" value={dayForm.date} onChange={e => setDayForm(f => ({ ...f, date: e.target.value }))} />
          <Select label="Operator" options={OPERATORS} value={dayForm.operator} onChange={e => setDayForm(f => ({ ...f, operator: e.target.value }))} />
          <Input label="Total earnings (£)" tooltip="Your total earnings for this operator for the day." type="number" placeholder="e.g. 145.00" value={dayForm.totalFare} onChange={e => setDayForm(f => ({ ...f, totalFare: e.target.value }))} />
          <FareTypeToggle value={dayForm.isNet} onChange={v => setDayForm(f => ({ ...f, isNet: v }))} commPct={dayForm.commissionPct} onCommChange={v => setDayForm(f => ({ ...f, commissionPct: v }))} />
          <Input label="Number of jobs (optional)" type="number" placeholder="e.g. 8" value={dayForm.totalJobs} onChange={e => setDayForm(f => ({ ...f, totalJobs: e.target.value }))} />
          <Input label="Total miles driven (optional)" tooltip="Total miles for the whole day including dead miles." type="number" placeholder="e.g. 94" value={dayForm.totalMiles} onChange={e => setDayForm(f => ({ ...f, totalMiles: e.target.value }))} />
          <Input label="Notes (optional)" type="text" placeholder="e.g. Friday evening shift" value={dayForm.notes} onChange={e => setDayForm(f => ({ ...f, notes: e.target.value }))} />
          <Btn onClick={addDay} disabled={!dayForm.totalFare}>Add Day</Btn>
          {added && <div style={{ textAlign: "center", color: C.green, fontSize: "13px", marginTop: "8px", fontFamily: FONT }}>✓ Added</div>}
        </div>
      )}

      {/* Paste Notes */}
      {logMode === "notes" && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "16px", marginBottom: "20px" }}>
          <SectionTitle>Paste Your Notes</SectionTitle>
          <div style={{ background: C.blueBg, border: `1px solid ${C.blueBorder}`, borderRadius: "10px", padding: "12px", marginBottom: "14px", fontSize: "13px", color: C.blue, lineHeight: "1.7", fontFamily: FONT }}>
            Paste or type your notes in any format. For example:<br />
            <span style={{ fontStyle: "italic", color: C.sub }}>"Mon — Uber £87, 6 jobs, 94 miles. Bolt £34, 2 jobs"</span><br />
            The AI will read it and extract your earnings automatically.
          </div>
          <Field label="Your notes">
            <textarea
              style={{ ...inputStyle, height: "120px", resize: "vertical", lineHeight: "1.6" }}
              placeholder="Paste or type your earnings notes here..."
              value={notesText}
              onChange={e => setNotesText(e.target.value)}
            />
          </Field>
          <Btn onClick={parseNotes} disabled={!notesText.trim() || parsing} color={C.blue}>
            {parsing ? "Reading your notes…" : "Extract Earnings with AI"}
          </Btn>

          {parseResult !== null && (
            <div style={{ marginTop: "16px" }}>
              <SectionTitle>What we found</SectionTitle>
              {parseResult.length === 0
                ? <div style={{ color: C.sub, fontSize: "13px", fontFamily: FONT }}>Couldn't extract any earnings. Try rewording your notes.</div>
                : <>
                  {parseResult.map((p, i) => (
                    <div key={i} style={{ background: C.greenBg, border: `1px solid ${C.greenBorder}`, borderRadius: "10px", padding: "12px", marginBottom: "8px", fontSize: "13px", fontFamily: FONT }}>
                      <div style={{ fontWeight: "700", color: C.text }}>{p.operator} · {p.date || "Today"}</div>
                      <div style={{ color: C.green, fontWeight: "700", fontSize: "16px" }}>{fmt(p.fare)}</div>
                      {p.notes && <div style={{ color: C.sub, marginTop: "2px" }}>{p.notes}</div>}
                    </div>
                  ))}
                  <Btn onClick={importParsed} color={C.green}>✓ Import {parseResult.length} entr{parseResult.length === 1 ? "y" : "ies"}</Btn>
                </>
              }
            </div>
          )}
          {added && <div style={{ textAlign: "center", color: C.green, fontSize: "13px", marginTop: "8px", fontFamily: FONT }}>✓ Imported</div>}
        </div>
      )}

      <SectionTitle>Job History ({jobs.length})</SectionTitle>
      {jobs.length === 0
        ? <div style={{ color: C.sub, textAlign: "center", padding: "30px 0", fontSize: "13px", fontFamily: FONT }}>No jobs logged yet</div>
        : jobs.slice(0, 50).map(j => (
          <div key={j.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "14px", marginBottom: "8px", display: "flex", justifyContent: "space-between", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "5px" }}>
                <Pill label={j.operator} color={OP_COLOR[j.operator]} />
                {j.type === "day" && <span style={{ fontSize: "10px", color: C.muted, fontFamily: FONT }}>daily total</span>}
                {j.type === "imported" && <span style={{ fontSize: "10px", color: C.muted, fontFamily: FONT }}>imported</span>}
              </div>
              <div style={{ fontSize: "12px", color: C.sub, fontFamily: FONT }}>{j.date}{j.notes ? ` · ${j.notes}` : ""}</div>
              <div style={{ fontSize: "14px", marginTop: "4px", fontFamily: FONT }}>{fmt(j.fare)} gross{j.jobMiles ? ` · ${j.jobMiles}mi` : ""}</div>
              <div style={{ fontSize: "13px", color: j.netEarnings > 0 ? C.green : C.red, marginTop: "2px", fontWeight: "600", fontFamily: FONT }}>
                Net {fmt(j.netEarnings)}
              </div>
            </div>
            <button onClick={() => setJobs(prev => prev.filter(x => x.id !== j.id))} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: "18px", paddingLeft: "10px" }}>✕</button>
          </div>
        ))
      }
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
    const jobMilesNum = parseFloat(jobMiles) || 0;
    const deadMilesNum = parseFloat(deadMiles) || 0;
    const minsNum = parseFloat(minutes) || 0;
    if (!fareNum) return;
    const netFare = isNet === "yes" ? fareNum : fareNum * (1 - (parseFloat(commPct) || 0) / 100);
    const opCut = fareNum - netFare;
    const fuelCost = (jobMilesNum + deadMilesNum) * settings.fuelCostPerMile;
    const net = netFare - fuelCost - totalCharges;
    const hourly = minsNum > 0 ? net / (minsNum / 60) : null;
    setResult({ fareNum, netFare, opCut, fuelCost, totalCharges, net, hourly });
    setSaved(false);
  }

  function saveJob() {
    if (!result) return;
    setJobs(prev => [{
      id: Date.now(), date: today(), operator, fare: result.fareNum, netFare: result.netFare,
      opCut: result.opCut, jobMiles: parseFloat(jobMiles) || 0, deadMiles: parseFloat(deadMiles) || 0,
      minutes: parseFloat(minutes) || 0, netEarnings: result.net, notes: "from Fare Check",
      shiftId: activeShift?.id || null, type: "job",
    }, ...prev]);
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
        <Input label="Total time (minutes)" tooltip="Total time from leaving your current location to dropping the passenger off. Includes travel to pickup plus the trip itself. Used to calculate your effective hourly rate." type="number" placeholder="e.g. 45" value={minutes} onChange={e => { setMinutes(e.target.value); setResult(null); }} />

        {/* My charges */}
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

          <div style={{ background: verdict.bg, border: `1px solid ${verdict.border}`, borderRadius: "12px", padding: "14px", textAlign: "center", fontWeight: "800", color: verdict.color, fontSize: "16px", margin: "16px 0 12px", fontFamily: FONT }}>
            {verdict.text}
          </div>

          {!saved
            ? <Btn onClick={saveJob} color="#6B7280">+ Save to Job Diary</Btn>
            : <div style={{ textAlign: "center", color: C.green, fontSize: "13px", padding: "8px", fontFamily: FONT }}>✓ Saved</div>
          }
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
        <Field label="Fuel cost per mile (£)" hint="Diesel avg ≈ £0.16–0.20/mi. This is used in all profit calculations." tooltip="Enter how much fuel costs you per mile driven. A rough way to calculate: fill up, note the cost and miles driven since last fill-up, then divide cost by miles.">
          <input style={inputStyle} type="number" step="0.01" value={settings.fuelCostPerMile} onChange={e => setSettings(s => ({ ...s, fuelCostPerMile: parseFloat(e.target.value) || 0 }))} />
        </Field>
      </div>

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
function Mileage({ jobs, shifts, fuelLogs }) {
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
            <div key={sh.id} style={{ padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: "13px", color: C.sub, fontFamily: FONT }}>{dateStr(sh.startTs)}</span>
                <span style={{ fontSize: "13px", color: C.accent, fontWeight: "700", fontFamily: FONT }}>{sh.shiftMiles > 0 ? `${sh.shiftMiles.toFixed(0)} mi` : "No mileage"}</span>
              </div>
              <div style={{ color: C.muted, fontSize: "12px", marginTop: "2px", fontFamily: FONT }}>
                {timeStr(sh.startTs)} → {sh.endTs ? timeStr(sh.endTs) : "—"} · {sh.mileageMode === "trip" ? "Trip meter" : sh.mileageMode === "odometer" ? "Odometer" : "No tracking"}
              </div>
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
