import { useState } from "react";

const STORAGE_KEY = "canos_tutorial_seen";

interface Slide {
  emoji: string;
  title: string;
  body: string;
}

const SLIDES: Slide[] = [
  {
    emoji: "🎲",
    title: "Würfeln startet den Zug",
    body: "Bist du dran, würfelst du zuerst. Jedes Feld mit der gewürfelten Zahl schüttet an alle angrenzenden Siedlungen (×1) und Städte (×2) Rohstoffe aus. Bei einer 7 kommt der Räuber.",
  },
  {
    emoji: "🏗️",
    title: "Bauen kostet Rohstoffe",
    body: "Über „Bauen“ legst du Straßen, Siedlungen und Städte. Wenn du dir etwas leisten kannst, pulsiert der Button. Freie Bauplätze leuchten auf dem Brett auf — tippe sie an.",
  },
  {
    emoji: "🔁",
    title: "Handeln — Bank & Mitspieler",
    body: "Unter „Handel“ tauschst du mit der Bank (Kurs je nach Hafen). Für einen Deal mit einem Mitspieler tippe seinen Chip unten doppelt an — das öffnet den Verhandlungstisch mit Chat.",
  },
  {
    emoji: "🌫️",
    title: "Verdeckte Felder",
    body: "Graue „?“-Felder sind noch geheim. Sie klappen auf, sobald eine Siedlung sie berührt — oder du schickst für 1 Wolle einen Spähtrupp (🔭) vor und siehst nur du es.",
  },
];

/**
 * A one-time, first-game welcome overlay. Steps through the four things a new
 * player needs (dice, build, trade incl. double-tap, hidden tiles), then never
 * shows again — gated purely on localStorage, no server state involved.
 */
export function MiniTutorial() {
  const [seen, setSeen] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [step, setStep] = useState(0);

  if (seen) return null;

  const finish = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* private mode — just close for this session */
    }
    setSeen(true);
  };

  const slide = SLIDES[step];
  const last = step === SLIDES.length - 1;

  return (
    <div className="tutorial-backdrop" onClick={finish}>
      <div className="tutorial-card" onClick={(e) => e.stopPropagation()}>
        <button className="tutorial-skip" onClick={finish} aria-label="Überspringen">
          ✕
        </button>
        <div className="tutorial-emoji">{slide.emoji}</div>
        <h3>{slide.title}</h3>
        <p>{slide.body}</p>
        <div className="tutorial-dots">
          {SLIDES.map((_, i) => (
            <span key={i} className={`tutorial-dot${i === step ? " on" : ""}`} />
          ))}
        </div>
        <div className="tutorial-actions">
          {step > 0 && (
            <button className="tutorial-back" onClick={() => setStep((s) => s - 1)}>
              Zurück
            </button>
          )}
          <button className="tutorial-next" onClick={() => (last ? finish() : setStep((s) => s + 1))}>
            {last ? "Los geht's!" : "Weiter"}
          </button>
        </div>
      </div>
    </div>
  );
}
