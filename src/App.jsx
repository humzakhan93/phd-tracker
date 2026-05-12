import { useState, useEffect } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────
const OPERATORS = ["Uber", "Bolt", "Airport Transfer", "Local Operator", "Other"];
const OPERATOR_CUTS = { Uber: 25, Bolt: 20, "Airport Transfer": 10, "Local Operator": 15, Other: 15 };
const EXPENSE_CATS = ["Car Wash", "Insurance", "Phone", "TfL Licence", "Maintenance", "Parking", "Other"];
const TOLL_CATS = ["Dart Charge", "ULEZ Charge", "Congestion Charge", "Airport Drop Fee", "Parking", "Other Charge"];
const HMRC_RATE_1 = 0.45;
const HMRC_RATE_2 = 0.25;
const HMRC_THRESHOLD = 10000;
const TAX_YEAR_START = "2025-04-06";

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
  const bgMap = {
    [C.green]: C.greenBg, [C.blue]: C.blueBg, [C.orange]: C.orangeBg,
  };
  return (
    <span style={{
      display: "inline-block",
      background: bgMap[color] || "#F3F4F6",
      color,
      borderRadius: "20px",
      padding: "3px 10px",
      fontSize: "11px",
      fontWeight: "600",
      fontFamily: FONT,
    }}>{label}</span>
  );
}
function SectionTitle({ children }) {
  return (
    <div style={{
      fontSize: "11px", fontWeight: "700", textTransform: "uppercase",
      letterSpacing: "0.08em", color: C.muted, marginBottom: "12px",
      paddingBottom: "10px", borderBottom: `1px solid ${C.border}`,
      fontFamily: FONT,
    }}>{children}</div>
  );
}
function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: "14px" }}>
      <div style={{ fontSize: "13px", fontWeight: "600", color: C.text, marginBottom: "6px", fontFamily: FONT }}>{label}</div>
      {hint && <div style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", fontFamily: FONT }}>{hint}</div>}
      {children}
    </div>
  );
}
function Input({ label, hint, ...props }) {
  return <Field label={label} hint={hint}><input style={inputStyle} {...props} /></Field>;
}
function Select({ label, options, ...props }) {
  return (
    <Field label={label}>
      <select style={selectStyle} {...props}>
        {options.map(o => <option key={o}>{o}</option>)}
      </select>
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
      fontSize: big ? "15px" : "14px",
      fontWeight: "700", fontFamily: FONT,
      borderRadius: "12px", cursor: disabled ? "not-allowed" : "pointer",
      transition: "all 0.15s", letterSpacing: "0.01em",
      boxShadow: disabled || outline ? "none" : "0 2px 8px rgba(0,0,0,0.12)",
    }}>{children}</button>
  );
}
function StatCard({ label, value, sub, color = C.accent }) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`,
      borderRadius: "14px", padding: "16px",
      boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
    }}>
      <div style={{ fontSize: "11px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.06em", color: C.sub, fontFamily: FONT }}>{label}</div>
      <div style={{ fontSize: "24px", color, fontWeight: "800", marginTop: "6px", lineHeight: 1, fontFamily: FONT }}>{value}</div>
      {sub && <div style={{ fontSize: "11px", color: C.muted, marginTop: "5px", fontFamily: FONT }}>{sub}</div>}
    </div>
  );
}
function Row({ label, value, color = C.text, bold }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "10px 0", borderBottom: `1px solid ${C.border}`, fontFamily: FONT,
    }}>
      <span style={{ fontSize: "14px", color: C.sub }}>{label}</span>
      <span style={{ fontSize: "14px", color, fontWeight: bold ? "700" : "500" }}>{value}</span>
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
  const [mileageMode, setMileageMode] = useState(null); // null | "trip" | "odometer"
  const [odometerStart, setOdometerStart] = useState("");

  function confirmStart() {
    onStart({
      id: Date.now(),
      startTs: Date.now(),
      mileageMode: mileageMode || "skip",
      startOdometer: mileageMode === "odometer" ? (parseFloat(odometerStart) || null) : null,
    });
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div style={{ background: C.surface, borderRadius: "24px 24px 0 0", padding: "24px 22px 40px", boxShadow: "0 -4px 30px rgba(0,0,0,0.15)" }}>
        <div style={{ fontSize: "12px", color: C.sub, fontWeight: "600", marginBottom: "4px", fontFamily: FONT }}>Starting shift</div>
        <div style={{ fontSize: "28px", fontWeight: "800", color: C.text, marginBottom: "4px", fontFamily: FONT }}>
          {new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
        </div>
        <div style={{ fontSize: "13px", color: C.sub, marginBottom: "24px", fontFamily: FONT }}>{dateStr(Date.now())}</div>

        <div style={{ fontSize: "13px", fontWeight: "600", color: C.text, marginBottom: "12px", fontFamily: FONT }}>
          How do you want to track mileage?
        </div>

        <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
          {[
            { id: "trip", label: "📍 Trip Meter", desc: "Enter miles driven at end of shift" },
            { id: "odometer", label: "🔢 Odometer", desc: "Enter total odo reading now & at end" },
          ].map(opt => (
            <button key={opt.id} onClick={() => setMileageMode(opt.id)} style={{
              flex: 1, padding: "14px 10px", textAlign: "left",
              background: mileageMode === opt.id ? "#FFF7ED" : C.light,
              border: `2px solid ${mileageMode === opt.id ? C.accent : C.border}`,
              borderRadius: "14px", cursor: "pointer",
              fontFamily: FONT,
            }}>
              <div style={{ fontSize: "13px", fontWeight: "700", marginBottom: "4px", color: mileageMode === opt.id ? C.accent : C.text }}>{opt.label}</div>
              <div style={{ fontSize: "11px", color: C.sub, lineHeight: "1.4" }}>{opt.desc}</div>
            </button>
          ))}
        </div>

        {mileageMode === "odometer" && (
          <Input
            label="Current odometer reading (miles)"
            hint="Check your dashboard — total miles on the car"
            type="number"
            placeholder="e.g. 48234"
            value={odometerStart}
            onChange={e => setOdometerStart(e.target.value)}
          />
        )}

        <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
          <button onClick={onCancel} style={{ padding: "13px 20px", background: C.light, border: `1px solid ${C.border}`, borderRadius: "12px", color: C.sub, fontFamily: FONT, fontWeight: "600", fontSize: "14px", cursor: "pointer" }}>Cancel</button>
          <div style={{ flex: 1 }}>
            <Btn big onClick={confirmStart} color={C.green}>🟢 Start Shift</Btn>
          </div>
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
  const [tollCat, setTollCat] = useState(TOLL_CATS[0]);
  const [tollAmt, setTollAmt] = useState("");
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

  function nextFromMileage() {
    if (shift.mileageMode === "skip") { setStep("fuel"); return; }
    if (shift.mileageMode === "trip" && !tripMiles) { setStep("fuel"); return; }
    if (shift.mileageMode === "odometer" && !odometerEnd) { setStep("fuel"); return; }
    setStep("fuel");
  }

  function handleFuel(ans) {
    setHasFuel(ans);
    if (!ans) setStep("tolls");
  }
  function confirmFuel() { setStep("tolls"); }

  function handleTolls(ans) {
    setHasTolls(ans);
    if (!ans) setStep("other");
  }
  function addToll() {
    if (!tollAmt) return;
    setExtraExpenses(e => [...e, { id: Date.now(), category: tollCat, amount: parseFloat(tollAmt), date: today(), notes: "End of shift" }]);
    setTollAmt("");
    setStep("other");
  }

  function handleOther(ans) {
    setHasOther(ans);
    if (!ans) setStep("summary");
  }
  function addOther() {
    if (!otherAmt) return;
    setExtraExpenses(e => [...e, { id: Date.now(), category: otherCat, amount: parseFloat(otherAmt), date: today(), notes: otherNote }]);
    setOtherAmt(""); setOtherNote("");
    setStep("summary");
  }

  function finish() {
    onComplete({
      endTs,
      shiftMiles: shiftMiles || 0,
      endOdometer: shift.mileageMode === "odometer" ? parseFloat(odometerEnd) || null : null,
      fuelLog: hasFuel && fuelCost ? { id: Date.now(), date: today(), cost: parseFloat(fuelCost), litres: parseFloat(fuelLitres) || 0, mileage: parseFloat(odometerEnd) || 0, notes: "End of shift fill-up" } : null,
      expenses: extraExpenses,
    });
  }

  const overlay = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, overflowY: "auto" };
  const sheet = { background: C.surface, margin: "16px", borderRadius: "20px", padding: "22px", marginBottom: "40px", boxShadow: "0 8px 40px rgba(0,0,0,0.15)" };

  const YesNo = ({ onYes, onNo }) => (
    <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
      <button onClick={onNo} style={{ flex: 1, padding: "16px", background: C.light, border: `1px solid ${C.border}`, borderRadius: "12px", color: C.sub, fontSize: "14px", fontWeight: "600", fontFamily: FONT, cursor: "pointer" }}>
        No, skip
      </button>
      <button onClick={onYes} style={{ flex: 1, padding: "16px", background: "#FFF7ED", border: `2px solid ${C.accent}`, borderRadius: "12px", color: C.accent, fontSize: "14px", fontWeight: "700", fontFamily: FONT, cursor: "pointer" }}>
        Yes, add it
      </button>
    </div>
  );

  // Progress dots
  const steps = ["mileage", "fuel", "tolls", "other", "summary"];
  const stepIdx = steps.indexOf(step);

  return (
    <div style={overlay}>
      <div style={sheet}>
        {/* Header */}
        <div style={{ fontSize: "12px", color: C.sub, fontWeight: "600", marginBottom: "4px", fontFamily: FONT }}>Ending shift</div>
        <div style={{ fontSize: "20px", fontWeight: "800", color: C.red, marginBottom: "16px", fontFamily: FONT }}>
          {step === "summary" ? "Shift Complete" : step === "mileage" ? "Mileage" : step === "fuel" ? "Fuel Fill-Up?" : step === "tolls" ? "Tolls & Charges?" : "Other Expenses?"}
        </div>

        {/* Progress */}
        <div style={{ display: "flex", gap: "5px", marginBottom: "22px" }}>
          {steps.map((s, i) => (
            <div key={s} style={{ flex: 1, height: "4px", borderRadius: "2px", background: i <= stepIdx ? C.accent : C.border }} />
          ))}
        </div>

        {/* Step: mileage */}
        {step === "mileage" && (
          <>
            <div style={{ background: C.light, borderRadius: "12px", padding: "14px", marginBottom: "18px", fontSize: "13px", color: C.sub, lineHeight: "1.9", fontFamily: FONT }}>
              <div>Started: <span style={{ color: C.text, fontWeight: "600" }}>{timeStr(shift.startTs)} · {dateStr(shift.startTs)}</span></div>
              <div>Duration: <span style={{ color: C.accent, fontWeight: "700" }}>{minsToHHMM(shiftMins)}</span></div>
              <div>Jobs logged: <span style={{ color: C.text, fontWeight: "600" }}>{shiftJobs.length}</span></div>
            </div>

            {shift.mileageMode === "trip" && (
              <Input
                label="Miles driven this shift"
                hint="Check your trip meter on the dashboard — reset it each shift for easy tracking"
                type="number"
                placeholder="e.g. 87"
                value={tripMiles}
                onChange={e => setTripMiles(e.target.value)}
              />
            )}

            {shift.mileageMode === "odometer" && (
              <>
                {shift.startOdometer && (
                  <div style={{ background: C.card, borderRadius: "5px", padding: "10px 12px", fontSize: "12px", color: C.sub, marginBottom: "12px" }}>
                    Odometer at start: <span style={{ color: C.text, fontWeight: "700" }}>{shift.startOdometer.toLocaleString()} mi</span>
                  </div>
                )}
                <Input
                  label="Odometer reading now (miles)"
                  hint="Total miles shown on your dashboard"
                  type="number"
                  placeholder="e.g. 48512"
                  value={odometerEnd}
                  onChange={e => setOdometerEnd(e.target.value)}
                />
                {odometerEnd && shift.startOdometer && (
                  <div style={{ background: "#0d1f14", border: `1px solid #1a5c35`, borderRadius: "5px", padding: "10px 12px", fontSize: "13px", color: C.green, marginBottom: "12px", fontWeight: "700" }}>
                    Shift miles: {(parseFloat(odometerEnd) - shift.startOdometer).toFixed(0)} mi
                  </div>
                )}
              </>
            )}

            {shift.mileageMode === "skip" && (
              <div style={{ color: C.sub, fontSize: "12px", marginBottom: "16px" }}>Mileage tracking was skipped for this shift.</div>
            )}

            <Btn onClick={nextFromMileage} color={C.accent}>Next →</Btn>
            <button onClick={onCancel} style={{ background: "none", border: "none", color: C.muted, fontSize: "13px", marginTop: "12px", cursor: "pointer", fontFamily: FONT, width: "100%", textAlign: "center" }}>
              Cancel — keep shift open
            </button>
          </>
        )}

        {/* Step: fuel */}
        {step === "fuel" && (
          <>
            <div style={{ fontSize: "13px", color: C.sub, marginBottom: "18px", lineHeight: "1.6" }}>
              Did you fill up with fuel during or at the end of this shift?
            </div>
            {hasFuel === null && <YesNo onYes={() => setHasFuel(true)} onNo={() => handleFuel(false)} />}
            {hasFuel === true && (
              <>
                <Input label="Total fuel cost (£)" type="number" placeholder="e.g. 68.00" value={fuelCost} onChange={e => setFuelCost(e.target.value)} />
                <Input label="Litres (optional)" type="number" placeholder="e.g. 50" value={fuelLitres} onChange={e => setFuelLitres(e.target.value)} />
                <Btn onClick={confirmFuel} disabled={!fuelCost}>Save & Next →</Btn>
              </>
            )}
          </>
        )}

        {/* Step: tolls */}
        {step === "tolls" && (
          <>
            <div style={{ fontSize: "13px", color: C.sub, marginBottom: "18px", lineHeight: "1.6" }}>
              Any tolls, charges, or fees to log? (Dart Charge, ULEZ, Congestion, Airport drop, Parking)
            </div>
            {hasTolls === null && <YesNo onYes={() => setHasTolls(true)} onNo={() => handleTolls(false)} />}
            {hasTolls === true && (
              <>
                <Select label="Type of charge" options={TOLL_CATS} value={tollCat} onChange={e => setTollCat(e.target.value)} />
                <Input label="Amount (£)" type="number" placeholder="e.g. 2.50" value={tollAmt} onChange={e => setTollAmt(e.target.value)} />
                <Btn onClick={addToll} disabled={!tollAmt}>Save & Next →</Btn>
              </>
            )}
          </>
        )}

        {/* Step: other */}
        {step === "other" && (
          <>
            <div style={{ fontSize: "13px", color: C.sub, marginBottom: "18px", lineHeight: "1.6" }}>
              Any other expenses today? Car wash, phone top-up, anything else?
            </div>
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

        {/* Step: summary */}
        {step === "summary" && (
          <>
            <div style={{ background: C.card, borderRadius: "7px", padding: "16px", marginBottom: "16px" }}>
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

            {extraExpenses.length > 0 && (
              <div style={{ background: C.card, borderRadius: "7px", padding: "16px", marginBottom: "16px" }}>
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

  function handleStartShift(shiftData) {
    setActiveShift(shiftData);
    setShowStart(false);
  }

  function handleEndShift({ endTs, shiftMiles, endOdometer, fuelLog, expenses: newExp }) {
    const completedShift = { ...activeShift, endTs, shiftMiles, endOdometer };
    setShifts(prev => [completedShift, ...prev]);
    setActiveShift(null);
    if (fuelLog) setFuelLogs(prev => [fuelLog, ...prev]);
    if (newExp?.length) setExpenses(prev => [...newExp, ...prev]);
    setShowEnd(false);
  }

  const tabs = [
    { id: "dashboard", label: "Home", icon: "🏠" },
    { id: "calc", label: "Calc", icon: "⚡" },
    { id: "jobs", label: "Jobs", icon: "🚖" },
    { id: "expenses", label: "Costs", icon: "🧾" },
    { id: "mileage", label: "Miles", icon: "🛣️" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: FONT, paddingBottom: "72px" }}>

      {/* Header */}
      <div style={{
        background: C.surface, borderBottom: `1px solid ${C.border}`,
        padding: "14px 20px 12px", display: "flex", alignItems: "center", gap: "12px",
        boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
      }}>
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

      {/* Content */}
      <div style={{ padding: "16px" }}>
        {tab === "dashboard" && (
          <Dashboard
            jobs={jobs} expenses={expenses} fuelLogs={fuelLogs} shifts={shifts}
            activeShift={activeShift} settings={settings}
            onStartShift={() => setShowStart(true)}
            onEndShift={() => setShowEnd(true)}
          />
        )}
        {tab === "calc" && <Calculator settings={settings} jobs={jobs} setJobs={setJobs} activeShift={activeShift} />}
        {tab === "jobs" && <Jobs jobs={jobs} setJobs={setJobs} settings={settings} activeShift={activeShift} />}
        {tab === "expenses" && <Expenses expenses={expenses} setExpenses={setExpenses} fuelLogs={fuelLogs} setFuelLogs={setFuelLogs} settings={settings} setSettings={setSettings} />}
        {tab === "mileage" && <Mileage jobs={jobs} shifts={shifts} fuelLogs={fuelLogs} />}
      </div>

      {/* Bottom nav */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        background: C.surface, borderTop: `1px solid ${C.border}`,
        display: "flex", boxShadow: "0 -2px 10px rgba(0,0,0,0.06)",
      }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, padding: "10px 4px 8px", background: "none", border: "none",
            color: tab === t.id ? C.accent : C.muted, cursor: "pointer",
            display: "flex", flexDirection: "column", alignItems: "center", gap: "3px",
            borderTop: `2px solid ${tab === t.id ? C.accent : "transparent"}`,
            fontFamily: FONT, transition: "color 0.15s",
          }}>
            <span style={{ fontSize: "18px" }}>{t.icon}</span>
            <span style={{ fontSize: "10px", fontWeight: tab === t.id ? "700" : "500" }}>{t.label}</span>
          </button>
        ))}
      </div>

      {showStart && <StartShiftModal onStart={handleStartShift} onCancel={() => setShowStart(false)} />}
      {showEnd && activeShift && (
        <EndShiftModal shift={activeShift} jobs={jobs} onComplete={handleEndShift} onCancel={() => setShowEnd(false)} />
      )}
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
  const opCuts = fj.reduce((s, j) => s + ((j.fare || 0) * (OPERATOR_CUTS[j.operator] || 0) / 100), 0);
  const netFares = grossFares - opCuts;
  const fuelSpend = ff.reduce((s, f) => s + (f.cost || 0), 0);
  const otherExp = fe.reduce((s, e) => s + (e.amount || 0), 0);
  const netProfit = netFares - fuelSpend - otherExp;
  const totalMins = fj.reduce((s, j) => s + (j.minutes || 0), 0);
  const hourlyRate = totalMins > 0 ? netFares / (totalMins / 60) : 0;

  const allBusinessMiles = shifts.reduce((s, sh) => s + (sh.shiftMiles || 0), 0);
  const hmrc = allBusinessMiles <= HMRC_THRESHOLD
    ? allBusinessMiles * HMRC_RATE_1
    : HMRC_THRESHOLD * HMRC_RATE_1 + (allBusinessMiles - HMRC_THRESHOLD) * HMRC_RATE_2;

  const byOp = OPERATORS.map(op => {
    const opJobs = fj.filter(j => j.operator === op);
    const net = opJobs.reduce((s, j) => s + (j.netEarnings || 0), 0);
    const mins = opJobs.reduce((s, j) => s + (j.minutes || 0), 0);
    return { op, count: opJobs.length, net, hr: mins > 0 ? net / (mins / 60) : 0 };
  }).filter(x => x.count > 0).sort((a, b) => b.net - a.net);

  const ranges = [{ id: "week", label: "7 Days" }, { id: "month", label: "Month" }, { id: "taxyear", label: "Tax Year" }, { id: "all", label: "All" }];

  return (
    <div>
      {/* SHIFT BUTTON — front and centre */}
      {!activeShift ? (
        <button onClick={onStartShift} style={{
          width: "100%", padding: "22px", marginBottom: "20px",
          background: `linear-gradient(135deg, #16A34A, #15803D)`,
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
          <div style={{
            background: `linear-gradient(135deg, #16A34A, #15803D)`,
            borderRadius: "16px", padding: "18px", marginBottom: "10px",
            boxShadow: "0 4px 16px rgba(22,163,74,0.25)", color: "#fff",
          }}>
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
            {activeShift.mileageMode !== "skip" && (
              <div style={{ fontSize: "11px", opacity: 0.8, fontFamily: FONT }}>
                Mileage: {activeShift.mileageMode === "trip" ? "Trip meter" : "Odometer"}
                {activeShift.startOdometer && ` · Start: ${activeShift.startOdometer.toLocaleString()} mi`}
              </div>
            )}
          </div>
          <button onClick={onEndShift} style={{
            width: "100%", padding: "16px",
            background: "#FFF5F5", border: `2px solid ${C.red}`,
            borderRadius: "14px", cursor: "pointer", color: C.red,
            fontFamily: FONT, fontSize: "15px", fontWeight: "700",
            display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
          }}>
            🔴 End Shift
          </button>
        </div>
      )}

      {/* Range selector */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "16px", background: C.surface, borderRadius: "12px", padding: "4px", border: `1px solid ${C.border}` }}>
        {ranges.map(r => (
          <button key={r.id} onClick={() => setRange(r.id)} style={{
            flex: 1, padding: "8px 4px",
            background: range === r.id ? C.accent : "transparent",
            color: range === r.id ? "#fff" : C.sub,
            border: "none", borderRadius: "9px",
            fontSize: "12px", fontWeight: "700", fontFamily: FONT, cursor: "pointer",
            transition: "all 0.15s",
          }}>{r.label}</button>
        ))}
      </div>

      {/* Stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "16px" }}>
        <StatCard label="Net Profit" value={fmt(netProfit)} color={netProfit >= 0 ? C.green : C.red} sub={`${fj.length} jobs`} />
        <StatCard label="Gross Fares" value={fmt(grossFares)} color={C.accent} />
        <StatCard label="Effective £/hr" value={totalMins > 0 ? fmt(hourlyRate) : "—"} color={C.blue} sub="after op. cut" />
        <StatCard label="Total Costs" value={fmt(fuelSpend + otherExp)} color={C.red} />
      </div>

      {/* P&L */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "7px", padding: "14px", marginBottom: "16px" }}>
        <SectionTitle>P&L Breakdown</SectionTitle>
        <Row label="Gross fares" value={fmt(grossFares)} />
        <Row label="Operator cuts" value={`− ${fmt(opCuts)}`} color={C.red} />
        <Row label="Net from rides" value={fmt(netFares)} color={C.green} bold />
        <Row label="Fuel spend" value={`− ${fmt(fuelSpend)}`} color={C.red} />
        <Row label="Other expenses" value={`− ${fmt(otherExp)}`} color={C.red} />
        <Row label="Net profit" value={fmt(netProfit)} color={netProfit >= 0 ? C.green : C.red} bold />
      </div>

      {/* By operator */}
      {byOp.length > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "7px", padding: "14px", marginBottom: "16px" }}>
          <SectionTitle>By Operator</SectionTitle>
          {byOp.map(({ op, count, net, hr }) => (
            <div key={op} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
              <div><Pill label={op} color={OP_COLOR[op]} /><div style={{ fontSize: "10px", color: C.sub, marginTop: "4px" }}>{count} job{count !== 1 ? "s" : ""}</div></div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: "700" }}>{fmt(net)}</div>
                {hr > 0 && <div style={{ fontSize: "10px", color: C.accent }}>{fmt(hr)}/hr</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* HMRC */}
      <div style={{ background: C.greenBg, border: `1px solid ${C.greenBorder}`, borderRadius: "14px", padding: "16px" }}>
        <SectionTitle>HMRC Mileage (Tax Year)</SectionTitle>
        <Row label="Business miles logged" value={`${allBusinessMiles.toFixed(0)} mi`} />
        <Row label="Claimable allowance" value={fmt(hmrc)} color={C.green} bold />
        <div style={{ fontSize: "12px", color: C.sub, marginTop: "10px", fontFamily: FONT }}>Based on shift mileage logs. First 10,000 mi @ 45p, then 25p.</div>
      </div>
    </div>
  );
}

// ─── Calculator ───────────────────────────────────────────────────────────────
function Calculator({ settings, jobs, setJobs, activeShift }) {
  const [form, setForm] = useState({ operator: "Uber", fare: "", jobMiles: "", deadMiles: "", minutes: "" });
  const [result, setResult] = useState(null);
  const [saved, setSaved] = useState(false);
  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setResult(null); setSaved(false); };

  function calculate() {
    const fare = parseFloat(form.fare), jobMiles = parseFloat(form.jobMiles);
    if (!fare || !jobMiles) return;
    const deadMiles = parseFloat(form.deadMiles) || 0, minutes = parseFloat(form.minutes) || 0;
    const cut = OPERATOR_CUTS[form.operator] || 0;
    const opCut = fare * cut / 100;
    const fuelCost = (jobMiles + deadMiles) * settings.fuelCostPerMile;
    const net = fare - opCut - fuelCost;
    setResult({ fare, opCut, fuelCost, net, hourly: minutes > 0 ? net / (minutes / 60) : null, cut });
    setSaved(false);
  }

  function saveJob() {
    if (!result) return;
    const job = {
      id: Date.now(), date: today(), operator: form.operator,
      fare: parseFloat(form.fare), jobMiles: parseFloat(form.jobMiles),
      deadMiles: parseFloat(form.deadMiles) || 0, minutes: parseFloat(form.minutes) || 0,
      netEarnings: result.net, notes: "",
      shiftId: activeShift?.id || null,
    };
    setJobs(prev => [job, ...prev]);
    setSaved(true);
  }

  const verdict = result
    ? result.net > 10 ? { text: "✓ Worth taking", color: C.green }
    : result.net > 0 ? { text: "⚠ Marginal — your call", color: C.orange }
    : { text: "✕ Not worth it", color: C.red }
    : null;

  return (
    <div>
      <SectionTitle>Job Worth Calculator</SectionTitle>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "7px", padding: "16px", marginBottom: "16px" }}>
        <div style={{ fontSize: "11px", color: C.sub, marginBottom: "12px" }}>Fuel cost: <span style={{ color: C.accent }}>£{settings.fuelCostPerMile.toFixed(2)}/mi</span> — update in Costs tab</div>
        <Select label="Operator" options={OPERATORS} value={form.operator} onChange={e => set("operator", e.target.value)} />
        <Input label="Fare offered (£)" type="number" placeholder="e.g. 18.50" value={form.fare} onChange={e => set("fare", e.target.value)} />
        <Input label="Job distance (miles)" type="number" placeholder="e.g. 12" value={form.jobMiles} onChange={e => set("jobMiles", e.target.value)} />
        <Input label="Dead miles to pickup" type="number" placeholder="e.g. 3" value={form.deadMiles} onChange={e => set("deadMiles", e.target.value)} />
        <Input label="Total time (minutes)" type="number" placeholder="e.g. 35" value={form.minutes} onChange={e => set("minutes", e.target.value)} />
        <Btn onClick={calculate} disabled={!form.fare || !form.jobMiles}>Calculate</Btn>
      </div>
      {result && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "7px", padding: "16px" }}>
          <Row label="Fare" value={fmt(result.fare)} />
          <Row label={`Operator cut (${result.cut}%)`} value={`− ${fmt(result.opCut)}`} color={C.red} />
          <Row label="Fuel cost" value={`− ${fmt(result.fuelCost)}`} color={C.red} />
          <Row label="Net earnings" value={fmt(result.net)} color={result.net > 0 ? C.green : C.red} bold />
          {result.hourly !== null && <Row label="Effective £/hr" value={`${fmt(result.hourly)}/hr`} color={C.accent} />}
          <div style={{ background: verdict.color + "15", border: `1px solid ${verdict.color}44`, borderRadius: "5px", padding: "12px", textAlign: "center", fontWeight: "700", color: verdict.color, fontSize: "14px", margin: "14px 0 10px" }}>{verdict.text}</div>
          {!saved
            ? <Btn onClick={saveJob} color="#222">+ Save to Job Diary{activeShift ? " (this shift)" : ""}</Btn>
            : <div style={{ textAlign: "center", color: C.green, fontSize: "12px", padding: "8px" }}>✓ Saved</div>
          }
        </div>
      )}
    </div>
  );
}

// ─── Jobs ─────────────────────────────────────────────────────────────────────
function Jobs({ jobs, setJobs, settings, activeShift }) {
  const [form, setForm] = useState({ date: today(), operator: "Uber", fare: "", jobMiles: "", deadMiles: "", minutes: "", notes: "" });
  const [added, setAdded] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function addJob() {
    const fare = parseFloat(form.fare), jobMiles = parseFloat(form.jobMiles);
    if (!fare || !jobMiles) return;
    const cut = OPERATOR_CUTS[form.operator] || 0;
    const opCut = fare * cut / 100;
    const fuelCost = (jobMiles + (parseFloat(form.deadMiles) || 0)) * settings.fuelCostPerMile;
    setJobs(prev => [{
      id: Date.now(), date: form.date, operator: form.operator, fare, jobMiles,
      deadMiles: parseFloat(form.deadMiles) || 0, minutes: parseFloat(form.minutes) || 0,
      netEarnings: fare - opCut - fuelCost, notes: form.notes,
      shiftId: activeShift?.id || null,
    }, ...prev]);
    setForm(f => ({ ...f, fare: "", jobMiles: "", deadMiles: "", minutes: "", notes: "" }));
    setAdded(true); setTimeout(() => setAdded(false), 2000);
  }

  return (
    <div>
      {activeShift && (
        <div style={{ background: C.greenBg, border: `1px solid ${C.greenBorder}`, borderRadius: "12px", padding: "12px 14px", marginBottom: "16px", fontSize: "13px", color: C.green, fontWeight: "600", fontFamily: FONT }}>
          ● Shift active — jobs added will be linked to this shift
        </div>
      )}
      <SectionTitle>Log a Job</SectionTitle>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "7px", padding: "16px", marginBottom: "20px" }}>
        <Input label="Date" type="date" value={form.date} onChange={e => set("date", e.target.value)} />
        <Select label="Operator" options={OPERATORS} value={form.operator} onChange={e => set("operator", e.target.value)} />
        <Input label="Fare received (£)" type="number" placeholder="e.g. 22.00" value={form.fare} onChange={e => set("fare", e.target.value)} />
        <Input label="Job distance (miles)" type="number" placeholder="e.g. 15" value={form.jobMiles} onChange={e => set("jobMiles", e.target.value)} />
        <Input label="Dead miles to pickup" type="number" placeholder="e.g. 2" value={form.deadMiles} onChange={e => set("deadMiles", e.target.value)} />
        <Input label="Total time (minutes)" type="number" placeholder="e.g. 40" value={form.minutes} onChange={e => set("minutes", e.target.value)} />
        <Input label="Notes (optional)" type="text" placeholder="e.g. Luton airport run" value={form.notes} onChange={e => set("notes", e.target.value)} />
        <Btn onClick={addJob} disabled={!form.fare || !form.jobMiles}>Add Job</Btn>
        {added && <div style={{ textAlign: "center", color: C.green, fontSize: "12px", marginTop: "8px" }}>✓ Job added</div>}
      </div>
      <SectionTitle>Job History ({jobs.length})</SectionTitle>
      {jobs.length === 0
        ? <div style={{ color: C.sub, textAlign: "center", padding: "30px 0", fontSize: "13px" }}>No jobs logged yet</div>
        : jobs.slice(0, 50).map(j => (
          <div key={j.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "13px", marginBottom: "8px", display: "flex", justifyContent: "space-between" }}>
            <div style={{ flex: 1 }}>
              <div style={{ marginBottom: "4px" }}><Pill label={j.operator} color={OP_COLOR[j.operator]} /></div>
              <div style={{ fontSize: "11px", color: C.sub }}>{j.date}{j.notes ? ` · ${j.notes}` : ""}</div>
              <div style={{ fontSize: "13px", marginTop: "4px" }}>{fmt(j.fare)} · {j.jobMiles}mi · {j.deadMiles || 0}mi dead</div>
              <div style={{ fontSize: "12px", color: j.netEarnings > 0 ? C.green : C.red, marginTop: "2px" }}>
                Net {fmt(j.netEarnings)}{j.minutes > 0 ? ` · ${fmt(j.netEarnings / (j.minutes / 60))}/hr` : ""}
              </div>
            </div>
            <button onClick={() => setJobs(prev => prev.filter(x => x.id !== j.id))} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: "16px", paddingLeft: "10px" }}>✕</button>
          </div>
        ))
      }
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
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "7px", padding: "14px", marginBottom: "16px" }}>
        <SectionTitle>Settings</SectionTitle>
        <Field label="Fuel cost per mile (£)" hint="Diesel avg ≈ £0.16–0.20/mi">
          <input style={inputStyle} type="number" step="0.01" value={settings.fuelCostPerMile}
            onChange={e => setSettings(s => ({ ...s, fuelCostPerMile: parseFloat(e.target.value) || 0 }))} />
        </Field>
      </div>
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
        {[{ id: "expense", label: "Expense" }, { id: "fuel", label: "Fuel" }, { id: "history", label: "History" }].map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)} style={{
            flex: 1, padding: "8px 4px",
            background: subTab === t.id ? C.accent : C.card,
            color: subTab === t.id ? "#080808" : C.sub,
            border: `1px solid ${subTab === t.id ? C.accent : C.border}`,
            borderRadius: "5px", fontSize: "9px", letterSpacing: "0.08em",
            textTransform: "uppercase", fontWeight: "700",
            fontFamily: "'DM Mono','Courier New',monospace", cursor: "pointer",
          }}>{t.label}</button>
        ))}
      </div>
      {subTab === "expense" && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "7px", padding: "16px" }}>
          <Input label="Date" type="date" value={expForm.date} onChange={e => setExpForm(f => ({ ...f, date: e.target.value }))} />
          <Select label="Category" options={EXPENSE_CATS} value={expForm.category} onChange={e => setExpForm(f => ({ ...f, category: e.target.value }))} />
          <Input label="Amount (£)" type="number" placeholder="e.g. 12.00" value={expForm.amount} onChange={e => setExpForm(f => ({ ...f, amount: e.target.value }))} />
          <Input label="Notes (optional)" type="text" placeholder="e.g. BP Luton" value={expForm.notes} onChange={e => setExpForm(f => ({ ...f, notes: e.target.value }))} />
          <Btn onClick={addExpense} disabled={!expForm.amount}>Add Expense</Btn>
          {expAdded && <div style={{ textAlign: "center", color: C.green, fontSize: "12px", marginTop: "8px" }}>✓ Added</div>}
        </div>
      )}
      {subTab === "fuel" && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "7px", padding: "16px" }}>
          <Input label="Date" type="date" value={fuelForm.date} onChange={e => setFuelForm(f => ({ ...f, date: e.target.value }))} />
          <Input label="Total cost (£)" type="number" placeholder="e.g. 65.00" value={fuelForm.cost} onChange={e => setFuelForm(f => ({ ...f, cost: e.target.value }))} />
          <Input label="Litres (optional)" type="number" placeholder="e.g. 45" value={fuelForm.litres} onChange={e => setFuelForm(f => ({ ...f, litres: e.target.value }))} />
          <Input label="Odometer (optional)" type="number" placeholder="e.g. 48234" value={fuelForm.mileage} onChange={e => setFuelForm(f => ({ ...f, mileage: e.target.value }))} />
          <Input label="Notes" type="text" placeholder="e.g. Shell M1" value={fuelForm.notes} onChange={e => setFuelForm(f => ({ ...f, notes: e.target.value }))} />
          <Btn onClick={addFuel} disabled={!fuelForm.cost}>Log Fill-Up</Btn>
          {fuelAdded && <div style={{ textAlign: "center", color: C.green, fontSize: "12px", marginTop: "8px" }}>✓ Logged</div>}
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
            ? <div style={{ color: C.sub, fontSize: "13px", marginBottom: "16px" }}>None logged</div>
            : expenses.map(e => (
              <div key={e.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "12px", marginBottom: "7px", display: "flex", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: "11px", color: C.sub }}>{e.date} · {e.category}</div>
                  {e.notes && <div style={{ fontSize: "11px", color: C.sub }}>{e.notes}</div>}
                  <div style={{ color: C.red, fontWeight: "700", marginTop: "3px" }}>− {fmt(e.amount)}</div>
                </div>
                <button onClick={() => setExpenses(prev => prev.filter(x => x.id !== e.id))} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: "16px" }}>✕</button>
              </div>
            ))
          }
          <SectionTitle>Fuel Fill-Ups</SectionTitle>
          {fuelLogs.length === 0
            ? <div style={{ color: C.sub, fontSize: "13px" }}>None logged</div>
            : fuelLogs.map(f => (
              <div key={f.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "12px", marginBottom: "7px", display: "flex", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: "11px", color: C.sub }}>{f.date}{f.notes ? ` · ${f.notes}` : ""}</div>
                  {f.litres > 0 && <div style={{ fontSize: "11px", color: C.sub }}>{f.litres}L{f.mileage > 0 ? ` · ${f.mileage.toLocaleString()} mi` : ""}</div>}
                  <div style={{ color: C.red, fontWeight: "700", marginTop: "3px" }}>− {fmt(f.cost)}</div>
                </div>
                <button onClick={() => setFuelLogs(prev => prev.filter(x => x.id !== f.id))} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: "16px" }}>✕</button>
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

  const hmrc = totalBusiness <= HMRC_THRESHOLD
    ? totalBusiness * HMRC_RATE_1
    : HMRC_THRESHOLD * HMRC_RATE_1 + (totalBusiness - HMRC_THRESHOLD) * HMRC_RATE_2;

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
      <SectionTitle>Mileage Overview</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "18px" }}>
        <StatCard label="Business Miles" value={totalBusiness.toFixed(0)} color={C.accent} sub="from shift logs" />
        <StatCard label="HMRC Claimable" value={fmt(hmrc)} color={C.green} />
        <StatCard label="Job Miles" value={totalJob.toFixed(0)} color={C.blue} sub="from job diary" />
        <StatCard label="Dead Mile %" value={`${deadPct}%`} color={parseFloat(deadPct) > 30 ? C.red : C.orange} sub="of job miles" />
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "7px", padding: "14px", marginBottom: "16px" }}>
        <SectionTitle>HMRC Mileage Allowance</SectionTitle>
        <Row label="Business miles" value={`${totalBusiness.toFixed(0)} mi`} />
        <Row label="First 10,000 mi rate" value="45p / mile" />
        <Row label="Above 10,000 mi rate" value="25p / mile" />
        <Row label="Total claimable" value={fmt(hmrc)} color={C.green} bold />
        {remaining10k > 0
          ? <div style={{ fontSize: "11px", color: C.sub, marginTop: "10px" }}>{remaining10k.toFixed(0)} miles remaining at 45p rate.</div>
          : <div style={{ fontSize: "11px", color: C.orange, marginTop: "10px" }}>You've passed 10,000 miles — now at 25p/mile.</div>
        }
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "7px", padding: "14px", marginBottom: "16px" }}>
        <SectionTitle>Shift Log ({shifts.length} shifts)</SectionTitle>
        {shifts.length === 0
          ? <div style={{ color: C.sub, fontSize: "13px" }}>No completed shifts yet. Use Start Shift on the home tab.</div>
          : shifts.slice(0, 10).map(sh => (
            <div key={sh.id} style={{ padding: "8px 0", borderBottom: `1px solid ${C.border}`, fontSize: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: C.sub }}>{dateStr(sh.startTs)}</span>
                <span style={{ color: C.accent, fontWeight: "700" }}>{sh.shiftMiles > 0 ? `${sh.shiftMiles.toFixed(0)} mi` : "No mileage"}</span>
              </div>
              <div style={{ color: C.muted, fontSize: "11px", marginTop: "2px" }}>
                {timeStr(sh.startTs)} → {sh.endTs ? timeStr(sh.endTs) : "—"} · {sh.mileageMode === "trip" ? "Trip meter" : sh.mileageMode === "odometer" ? "Odometer" : "No tracking"}
              </div>
            </div>
          ))
        }
      </div>

      {mpg && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "7px", padding: "14px", marginBottom: "16px" }}>
          <SectionTitle>Fuel Efficiency</SectionTitle>
          <Row label="Estimated MPG" value={`${mpg} mpg`} color={C.accent} bold />
          <div style={{ fontSize: "10px", color: C.sub, marginTop: "8px" }}>Calculated from odometer readings in your fuel log.</div>
        </div>
      )}

      <div style={{ background: C.greenBg, border: `1px solid ${C.greenBorder}`, borderRadius: "14px", padding: "16px" }}>
        <SectionTitle>HMRC Tip</SectionTitle>
        <div style={{ fontSize: "13px", color: C.sub, lineHeight: "1.8", fontFamily: FONT }}>
          Mileage allowance is claimed <span style={{ color: C.green, fontWeight: "600" }}>instead of</span> actual fuel costs — not in addition to. Most drivers find the allowance more beneficial. Always consult your accountant for self-assessment.
        </div>
      </div>
    </div>
  );
}
