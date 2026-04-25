"use client";

import { useState, useEffect, useRef } from "react";

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return isMobile;
}

const C = {
  bg: "#0f0f23", bgCard: "#1a1a2e", bgChat: "#2d2d44",
  bgCandid: "rgba(108,99,255,0.18)", primary: "#6C63FF",
  text: "#f8f8f2", muted: "#9494b0", accent: "#FF6B6B",
  success: "#4ECB71", warning: "#FFA726", border: "rgba(255,255,255,0.08)",
};

const SUJET_PROMPT = `Tu es un concepteur de sujets pour l'épreuve orale de mise en situation (UVSQ, PASS/LAS).

RÈGLES DE VARIÉTÉ :
- Varie les contextes : famille, travail, médical, école, voisinage, sport, administratif...
- Varie les dynamiques : dilemme éthique, faveur compromettante, conflit de loyauté, urgence qui force un choix, secret lourd à porter, demande impossible...
- Ne fais PAS systématiquement "quelqu'un qui se renferme". Exemples de registres différents : une collègue qui confie un harcèlement, un frère qui demande de mentir à la police pour lui, un médecin coincé entre son fils accidenté et un patient urgent, un ami qui triche et risque l'exclusion.

FORMAT DE RÉPONSE — retourne UNIQUEMENT ce JSON, rien d'autre :
{
  "titre": "Titre court",
  "contexte": "2-3 phrases décrivant la situation concrète et le rôle du candidat.",
  "role_comedien": "Qui est le personnage, son lien avec le candidat, son émotion dominante, ce qu'il cache ou ce qu'il demande vraiment.",
  "elements_a_decouvrir": [
    {"element": "Info cachée ou enjeu sous-jacent", "question_type": "Type de question pour le révéler"}
  ],
  "solutions": [
    {"solution": "Piste d'action concrète", "justification": "Pourquoi c'est pertinent"}
  ],
  "rebondissements": ["Un élément inattendu qui complique la situation"]
}

Maximum 3 entrées par tableau. Commence directement par { sans aucun texte avant.`;

const getComedienPrompt = (sujet: object) => `Tu incarnes ce personnage dans une simulation d'oral PASS/LAS (épreuve MES, UVSQ). Tu vis la scène de l'intérieur.

PERSONNAGE :
${JSON.stringify(sujet, null, 2)}

RÈGLES STRICTES :
1. Réponds en 1-2 phrases courtes, jamais plus. Comme dans une vraie conversation tendue.
2. Tu ne révèles RIEN spontanément. Chaque information se mérite : le candidat doit poser la bonne question.
3. Tu ne suggères JAMAIS de solutions, d'options ni de ressources. Ce n'est pas ton rôle.
4. Si le candidat tourne en rond 2-3 échanges sans progresser, tu peux laisser échapper un indice — une phrase qui ouvre une porte, pas trop subtile. Par exemple une émotion qui déborde, une allusion involontaire, un détail concret.
5. Tu réponds à CE QU'ON TE DEMANDE, pas plus. Si la question est vague, réponds vaguement.
6. Tu peux parfois décrire brièvement ton état émotionnel (ex: "je sais pas comment dire ça…", "ça m'énerve d'en parler") mais de façon naturelle et occasionnelle, pas à chaque réplique.
7. Tu introduis le rebondissement naturellement, quand le candidat a compris la situation de base.

Message d'ouverture : 1-2 phrases, tu exposes juste que tu as un problème, sans détails.`;

const getCorrigePrompt = (sujet: object, chatHistory: string) => `Tu es un évaluateur expert de l'épreuve orale MES de l'UVSQ (PASS/LAS).

SUJET :
${JSON.stringify(sujet, null, 2)}

CONVERSATION :
${chatHistory}

Produis un corrigé concis en JSON. Chaque champ texte = 1 phrase max, sauf commentaire_jury.
{
  "elements_decouverts": [
    { "element": "Info cachée", "question_type_attendu": "Type de question", "trouve_par_candidat": true, "commentaire": "1 phrase" }
  ],
  "solutions_explorees": [
    { "solution": "Solution", "mentionnee_par_candidat": true, "commentaire": "1 phrase" }
  ],
  "erreurs_commises": [
    { "erreur": "Erreur commise", "exemple": "Citation courte ou résumé du moment dans la conversation", "conseil": "Ce qu'il fallait faire (1 phrase)" }
  ],
  "points_forts": ["1 point fort par entrée, 1 phrase"],
  "notation": {
    "ecoute_analyse": { "note": 12, "justification": "1 phrase" },
    "posture": { "note": 13, "justification": "1 phrase" },
    "solutions": { "note": 11, "justification": "1 phrase" },
    "note_finale": 12
  },
  "commentaire_jury": "2-3 phrases : un point fort, un axe d'amélioration, un conseil concret."
}

Calibrage : moyen = 10-12, bon = 14-16, excellent = 17+, incompréhension totale < 8.
Maximum 3 entrées par tableau. JSON brut uniquement, commence par { sans aucun texte avant.`;

async function callClaude(systemPrompt: string, messages: { role: string; content: string }[], maxTokens = 1000) {
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Erreur API ${res.status}`);
  }
  const data = await res.json();
  return data.content?.find((b: { type: string }) => b.type === "text")?.text || "";
}

function parseJSON(text: string) {
  const block = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (block) { try { return JSON.parse(block[1]); } catch (_) {} }
  try { return JSON.parse(text.trim()); } catch (_) {}
  const obj = text.match(/(\{[\s\S]*\})/);
  if (obj) { try { return JSON.parse(obj[1]); } catch (_) {} }
  throw new Error("Réponse JSON invalide — veuillez réessayer");
}

function formatTimer(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
function timerColor(s: number) {
  if (s >= 300) return C.accent;
  if (s >= 240) return C.warning;
  return C.success;
}
function noteColor(n: number) {
  if (n >= 14) return C.success;
  if (n >= 9) return C.warning;
  return C.accent;
}
function btnStyle(bg: string, fg = "#fff"): React.CSSProperties {
  return {
    background: bg, color: fg, border: "none", borderRadius: 12,
    padding: "12px 24px", fontSize: 14, fontWeight: 600, cursor: "pointer",
    fontFamily: "'DM Sans',sans-serif", transition: "opacity 0.15s",
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
  };
}

type Message = { role: "user" | "assistant"; content: string };

// ─── Main App ───────────────────────────────────────────────
export default function SimulateurOral() {
  const [phase, setPhase] = useState<"accueil" | "briefing" | "simulation" | "corrige">("accueil");
  const [sujet, setSujet] = useState<Record<string, unknown> | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [notes, setNotes] = useState("");
  const [timer, setTimer] = useState(0);
  const [corrige, setCorrige] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [retryFn, setRetryFn] = useState<(() => void) | null>(null);
  const [isListening, setIsListening] = useState(false);
  const chatEnd = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("La dictée vocale n'est pas supportée par ce navigateur (utilisez Chrome ou Safari).");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "fr-FR";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = (e: { results: { [key: number]: { [key: number]: { transcript: string }; isFinal: boolean } }; resultIndex: number }) => {
      let transcript = "";
      for (let i = e.resultIndex; i < Object.keys(e.results).length; i++) {
        transcript += e.results[i][0].transcript;
      }
      setInput(transcript);
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  useEffect(() => {
    if (phase !== "simulation") return;
    const t = setInterval(() => setTimer((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const reset = () => {
    setPhase("accueil"); setSujet(null); setMessages([]); setNotes("");
    setTimer(0); setCorrige(null); setLoading(false); setLoadingMsg("");
    setIsTyping(false); setNotesOpen(false); setInput(""); setError(null); setRetryFn(null);
  };

  const handleCommencer = () => {
    const fn = async () => {
      setLoading(true); setLoadingMsg("Préparation de votre sujet…"); setError(null);
      try {
        const text = await callClaude(SUJET_PROMPT, [{ role: "user", content: "Génère un sujet maintenant." }], 1000);
        setSujet(parseJSON(text));
        setPhase("briefing");
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Erreur inconnue";
        setError(`Impossible de générer le sujet : ${msg}`);
        setRetryFn(() => fn);
      } finally { setLoading(false); setLoadingMsg(""); }
    };
    fn();
  };

  const handleLancer = () => {
    const fn = async () => {
      setLoading(true); setLoadingMsg("Le comédien entre en scène…"); setError(null);
      try {
        const text = await callClaude(
          getComedienPrompt(sujet!),
          [{ role: "user", content: "Commence la simulation." }],
          400
        );
        setMessages([{ role: "assistant", content: text }]);
        setPhase("simulation");
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Erreur inconnue";
        setError(`Impossible de démarrer : ${msg}`);
        setRetryFn(() => fn);
      } finally { setLoading(false); setLoadingMsg(""); }
    };
    fn();
  };

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;
    const userMsg = input.trim();
    setInput("");
    const newMsgs: Message[] = [...messages, { role: "user", content: userMsg }];
    setMessages(newMsgs);
    setIsTyping(true); setError(null);
    try {
      const apiMsgs = [
        { role: "user", content: "Commence la simulation." },
        ...newMsgs.map((m) => ({ role: m.role, content: m.content })),
      ];
      const text = await callClaude(getComedienPrompt(sujet!), apiMsgs, 400);
      setMessages((prev) => [...prev, { role: "assistant", content: text }]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erreur inconnue";
      setError(`Erreur de connexion : ${msg}`);
    } finally { setIsTyping(false); }
  };

  const handleTerminer = () => {
    const chatHistory = messages
      .map((m) => `[${m.role === "user" ? "Candidat" : "Comédien"}] : ${m.content}`)
      .join("\n\n");
    const fn = async () => {
      setLoading(true); setLoadingMsg("Analyse de votre prestation…"); setError(null);
      try {
        const text = await callClaude(
          getCorrigePrompt(sujet!, chatHistory),
          [{ role: "user", content: "Génère le corrigé et la notation." }],
          4096
        );
        setCorrige(parseJSON(text));
        setPhase("corrige");
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Erreur inconnue";
        setError(`Impossible de générer le corrigé : ${msg}`);
        setRetryFn(() => fn);
      } finally { setLoading(false); setLoadingMsg(""); }
    };
    fn();
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <div style={{ fontFamily: "'DM Sans',sans-serif", background: C.bg, color: C.text, minHeight: "100vh" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&family=DM+Sans:wght@400;500;600&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:5px}
        ::-webkit-scrollbar-thumb{background:rgba(108,99,255,0.4);border-radius:3px}
        textarea{resize:none}
        .pulse{animation:pulse 1.4s ease-in-out infinite}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.35}}
        .fadeIn{animation:fadeIn 0.25s ease}
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        .micPulse{animation:micPulse 1s ease-in-out infinite}
        @keyframes micPulse{0%,100%{box-shadow:0 0 0 0 rgba(255,107,107,0.5)}50%{box-shadow:0 0 0 6px rgba(255,107,107,0)}}
      `}</style>
      {phase === "accueil" && <Accueil loading={loading} loadingMsg={loadingMsg} error={error} retryFn={retryFn} onStart={handleCommencer} />}
      {phase === "briefing" && <Briefing sujet={sujet} loading={loading} loadingMsg={loadingMsg} error={error} retryFn={retryFn} onLancer={handleLancer} />}
      {phase === "simulation" && (
        <Simulation
          sujet={sujet} messages={messages} isTyping={isTyping} timer={timer}
          notes={notes} setNotes={setNotes} notesOpen={notesOpen} setNotesOpen={setNotesOpen}
          input={input} setInput={setInput} loading={loading} loadingMsg={loadingMsg} error={error}
          onSend={handleSend} onKey={handleKey} onTerminer={handleTerminer} chatEnd={chatEnd}
          isListening={isListening} onToggleListen={toggleListening}
        />
      )}
      {phase === "corrige" && <Corrige corrige={corrige} sujet={sujet} onRestart={reset} />}
    </div>
  );
}

// ─── Écran 1 : Accueil ──────────────────────────────────────
function Accueil({ loading, loadingMsg, error, retryFn, onStart }: {
  loading: boolean; loadingMsg: string; error: string | null;
  retryFn: (() => void) | null; onStart: () => void;
}) {
  const isMobile = useIsMobile();
  const tips = [
    "Commence par reformuler et résumer la situation",
    "Pose des questions ouvertes (Comment ? Qu'est-ce qui… ?)",
    "Écoute activement ce que le comédien te dit",
    "Identifie les enjeux émotionnels ET factuels",
    "Pense aux acteurs périphériques (famille, amis, professionnels…)",
    "Propose des solutions variées et nuancées",
    "Ne cherche pas à tout résoudre immédiatement",
  ];
  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: isMobile ? "32px 16px" : "48px 24px", textAlign: "center" }}>
      <img
        src="https://cdn.prod.website-files.com/63e5001b219c780b1ec900b1/641d9d7e484c28c85d57c954_5.png"
        alt="Oral Prépa"
        style={{ height: 52, objectFit: "contain", marginBottom: 32 }}
        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
      />
      <h1 style={{ fontFamily: "'Outfit',sans-serif", fontSize: 30, fontWeight: 800, lineHeight: 1.2, marginBottom: 12 }}>
        Simulateur d&apos;oral PASS/LAS<br />
        <span style={{ color: C.primary }}>Mise en situation avec comédien</span>
      </h1>
      <p style={{ color: C.muted, fontSize: 15, marginBottom: 6 }}>
        Entraîne-toi à l&apos;épreuve MES de l&apos;UVSQ en conditions réelles
      </p>
      <p style={{ color: C.muted, fontSize: 12, marginBottom: 40, opacity: 0.6 }}>
        Université de Versailles Saint-Quentin-en-Yvelines
      </p>

      {error && (
        <div style={{ background: "rgba(255,107,107,0.1)", border: "1px solid rgba(255,107,107,0.3)", borderRadius: 12, padding: "14px 18px", marginBottom: 20, textAlign: "left" }}>
          <p style={{ color: C.accent, fontSize: 13, marginBottom: retryFn ? 8 : 0 }}>⚠️ {error}</p>
          {retryFn && <button onClick={retryFn} style={{ ...btnStyle("rgba(255,107,107,0.2)", C.accent), padding: "6px 14px", fontSize: 12 }}>Réessayer</button>}
        </div>
      )}

      <button
        onClick={onStart}
        disabled={loading}
        style={{ ...btnStyle(C.primary), width: "100%", maxWidth: 340, padding: "16px 32px", fontSize: 16, fontFamily: "'Outfit',sans-serif", fontWeight: 700, marginBottom: 48, opacity: loading ? 0.7 : 1 }}
      >
        {loading ? <span className="pulse">{loadingMsg}</span> : "🎭 Commencer une simulation"}
      </button>

      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 18, padding: "24px 28px", textAlign: "left" }}>
        <p style={{ fontFamily: "'Outfit',sans-serif", fontSize: 12, fontWeight: 700, color: C.primary, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 16 }}>
          Bonnes pratiques de l&apos;épreuve
        </p>
        <ol style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
          {tips.map((t, i) => (
            <li key={i} style={{ display: "flex", gap: 12, fontSize: 14, lineHeight: 1.5 }}>
              <span style={{ color: C.primary, fontWeight: 700, minWidth: 18 }}>{i + 1}.</span>{t}
            </li>
          ))}
        </ol>
      </div>
      <p style={{ color: C.muted, fontSize: 11, marginTop: 28, opacity: 0.5 }}>
        Durée ~5 min en simulation · 10 min en conditions réelles · Critères : Écoute &amp; Analyse · Posture · Solutions
      </p>
    </div>
  );
}

// ─── Écran 2 : Briefing ─────────────────────────────────────
function Briefing({ sujet, loading, loadingMsg, error, retryFn, onLancer }: {
  sujet: Record<string, unknown> | null; loading: boolean; loadingMsg: string;
  error: string | null; retryFn: (() => void) | null; onLancer: () => void;
}) {
  const isMobile = useIsMobile();
  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: isMobile ? "24px 16px" : "40px 24px" }}>
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <span style={{ background: C.primary, color: "#fff", fontSize: 11, fontWeight: 700, padding: "4px 14px", borderRadius: 20, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Sujet tiré au sort
        </span>
      </div>
      {sujet && (
        <>
          <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 20, padding: "28px 32px", marginBottom: 20 }}>
            <h2 style={{ fontFamily: "'Outfit',sans-serif", fontSize: 22, fontWeight: 800, marginBottom: 18 }}>{sujet.titre as string}</h2>
            <p style={{ fontSize: 15, lineHeight: 1.8 }}>{sujet.contexte as string}</p>
          </div>
          <div style={{ background: "rgba(108,99,255,0.07)", border: "1px solid rgba(108,99,255,0.2)", borderRadius: 16, padding: "20px 24px", marginBottom: 28 }}>
            <p style={{ fontFamily: "'Outfit',sans-serif", fontSize: 12, fontWeight: 700, color: C.primary, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 16 }}>
              Critères d&apos;évaluation
            </p>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3,1fr)", gap: isMobile ? 10 : 14 }}>
              {[
                { icon: "👂", label: "Écoute & Analyse", desc: "Questions, reformulation, enjeux" },
                { icon: "🤝", label: "Posture", desc: "Empathie, calme, bienveillance" },
                { icon: "💡", label: "Solutions", desc: "Diversité, nuance, acteurs" },
              ].map((c) => (
                <div key={c.label} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 26, marginBottom: 6 }}>{c.icon}</div>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{c.label}</div>
                  <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.4 }}>{c.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
      {error && (
        <div style={{ background: "rgba(255,107,107,0.1)", border: "1px solid rgba(255,107,107,0.3)", borderRadius: 12, padding: "14px 18px", marginBottom: 20 }}>
          <p style={{ color: C.accent, fontSize: 13, marginBottom: retryFn ? 8 : 0 }}>⚠️ {error}</p>
          {retryFn && <button onClick={retryFn} style={{ ...btnStyle("rgba(255,107,107,0.2)", C.accent), padding: "6px 14px", fontSize: 12 }}>Réessayer</button>}
        </div>
      )}
      <button
        onClick={onLancer}
        disabled={loading}
        style={{ ...btnStyle(C.primary), width: "100%", padding: "16px", fontSize: 16, fontFamily: "'Outfit',sans-serif", fontWeight: 700, opacity: loading ? 0.7 : 1 }}
      >
        {loading ? <span className="pulse">{loadingMsg}</span> : "✅ Je suis prêt(e), lancer la simulation →"}
      </button>
    </div>
  );
}

// ─── Écran 3 : Simulation ───────────────────────────────────
function Simulation({ sujet, messages, isTyping, timer, notes, setNotes, notesOpen, setNotesOpen, input, setInput, loading, loadingMsg, error, onSend, onKey, onTerminer, chatEnd, isListening, onToggleListen }: {
  sujet: Record<string, unknown> | null; messages: Message[]; isTyping: boolean; timer: number;
  notes: string; setNotes: (v: string) => void; notesOpen: boolean; setNotesOpen: (fn: (v: boolean) => boolean) => void;
  input: string; setInput: (v: string) => void; loading: boolean; loadingMsg: string; error: string | null;
  onSend: () => void; onKey: (e: React.KeyboardEvent) => void; onTerminer: () => void;
  chatEnd: React.RefObject<HTMLDivElement | null>;
  isListening: boolean; onToggleListen: () => void;
}) {
  const isMobile = useIsMobile();
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <div style={{ padding: "10px 16px", background: C.bgCard, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexShrink: 0 }}>
        <div style={{ overflow: "hidden" }}>
          <p style={{ fontSize: 10, color: C.primary, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>Simulation en cours</p>
          <p style={{ fontSize: 14, fontWeight: 600, fontFamily: "'Outfit',sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "60vw" }}>
            {sujet?.titre as string}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          <span style={{ fontFamily: "monospace", fontSize: 18, fontWeight: 700, color: timerColor(timer) }}>
            {formatTimer(timer)}
          </span>
          <button
            onClick={() => setNotesOpen((v) => !v)}
            style={{ background: notesOpen ? C.primary : "rgba(255,255,255,0.07)", border: "none", borderRadius: 8, width: 34, height: 34, fontSize: 15, cursor: "pointer", color: C.text }}
          >📝</button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 14 }}>
        {messages.map((msg, i) => (
          <div key={i} className="fadeIn" style={{ display: "flex", flexDirection: msg.role === "user" ? "row-reverse" : "row", gap: 10, alignItems: "flex-start" }}>
            <span style={{ fontSize: 20, paddingTop: 2, flexShrink: 0 }}>{msg.role === "user" ? "👤" : "🎭"}</span>
            <div style={{ maxWidth: "76%" }}>
              <p style={{ fontSize: 10, color: C.muted, marginBottom: 4, fontWeight: 600, textAlign: msg.role === "user" ? "right" : "left" }}>
                {msg.role === "user" ? "Vous" : "Le comédien"}
              </p>
              <div style={{
                background: msg.role === "user" ? C.bgCandid : C.bgChat,
                border: `1px solid ${msg.role === "user" ? "rgba(108,99,255,0.3)" : C.border}`,
                borderRadius: msg.role === "user" ? "16px 4px 16px 16px" : "4px 16px 16px 16px",
                padding: "11px 15px", fontSize: 14, lineHeight: 1.65, whiteSpace: "pre-wrap",
              }}>
                {msg.content}
              </div>
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="fadeIn" style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <span style={{ fontSize: 20 }}>🎭</span>
            <div>
              <p style={{ fontSize: 10, color: C.muted, marginBottom: 4, fontWeight: 600 }}>Le comédien</p>
              <div style={{ background: C.bgChat, border: `1px solid ${C.border}`, borderRadius: "4px 16px 16px 16px", padding: "12px 16px", display: "flex", gap: 5 }}>
                {[0, 1, 2].map((d) => (
                  <span key={d} className="pulse" style={{ width: 7, height: 7, background: C.muted, borderRadius: "50%", display: "block", animationDelay: `${d * 0.18}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}

        {error && (
          <div style={{ background: "rgba(255,107,107,0.1)", border: "1px solid rgba(255,107,107,0.25)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: C.accent }}>
            ⚠️ {error}
          </div>
        )}
        <div ref={chatEnd} />
      </div>

      <div style={{ padding: "10px 14px 12px", background: C.bgCard, borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            disabled={isTyping || loading}
            placeholder={isListening ? "🎙️ Dictée en cours… parlez maintenant" : "Votre réponse… (Entrée pour envoyer, Maj+Entrée pour saut de ligne)"}
            rows={2}
            style={{ flex: 1, background: isListening ? "rgba(255,107,107,0.06)" : "rgba(255,255,255,0.05)", border: `1px solid ${isListening ? "rgba(255,107,107,0.4)" : C.border}`, borderRadius: 10, color: C.text, padding: "9px 13px", fontSize: 14, fontFamily: "'DM Sans',sans-serif", outline: "none", lineHeight: 1.5, transition: "border-color 0.2s, background 0.2s" }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <button
              onClick={onToggleListen}
              disabled={isTyping || loading}
              title={isListening ? "Arrêter la dictée" : "Dicter ma réponse"}
              className={isListening ? "micPulse" : ""}
              style={{ background: isListening ? C.accent : "rgba(255,255,255,0.07)", border: "none", borderRadius: 10, width: 40, height: 40, fontSize: 17, cursor: "pointer", color: C.text, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
            >{isListening ? "⏹" : "🎙️"}</button>
            <button
              onClick={onSend}
              disabled={isTyping || loading || !input.trim()}
              style={{ ...btnStyle(C.primary), padding: "0", width: 40, height: 40, fontSize: 18, opacity: isTyping || !input.trim() ? 0.35 : 1, flexShrink: 0 }}
            >➤</button>
          </div>
        </div>
        <button
          onClick={onTerminer}
          disabled={loading || isTyping}
          style={{ ...btnStyle("rgba(255,107,107,0.12)", C.accent), border: "1px solid rgba(255,107,107,0.25)", width: "100%", fontSize: 13, padding: "8px", opacity: loading || isTyping ? 0.5 : 1 }}
        >
          {loading ? <span className="pulse">⏳ {loadingMsg}</span> : "⏹ Terminer la simulation et obtenir le corrigé"}
        </button>
      </div>

      <div style={{ position: "fixed", top: 0, right: 0, width: notesOpen ? (isMobile ? "100vw" : 260) : 0, height: "100vh", background: "#141428", borderLeft: notesOpen && !isMobile ? `1px solid ${C.border}` : "none", display: "flex", flexDirection: "column", transition: "width 0.25s ease", overflow: "hidden", zIndex: 50 }}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: C.warning, textTransform: "uppercase", letterSpacing: "0.06em" }}>📝 Bloc-notes</p>
            <p style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>Vos notes personnelles</p>
          </div>
          {isMobile && (
            <button onClick={() => setNotesOpen(() => false)} style={{ background: "none", border: "none", color: C.muted, fontSize: 22, cursor: "pointer", lineHeight: 1 }}>✕</button>
          )}
        </div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Hypothèses, pistes, acteurs clés…"
          style={{ flex: 1, background: "transparent", border: "none", color: C.text, padding: 14, fontSize: 13, fontFamily: "'DM Sans',sans-serif", outline: "none", lineHeight: 1.7 }}
        />
      </div>
    </div>
  );
}

// ─── Écran 4 : Corrigé ──────────────────────────────────────
function Corrige({ corrige, sujet, onRestart }: {
  corrige: Record<string, unknown> | null;
  sujet: Record<string, unknown> | null;
  onRestart: () => void;
}) {
  const isMobile = useIsMobile();
  if (!corrige) return null;
  const notation = corrige.notation as Record<string, { note: number; justification: string }> & { note_finale: number };
  const commentaire_jury = corrige.commentaire_jury as string;
  const elements_decouverts = (corrige.elements_decouverts as { element: string; question_type_attendu: string; trouve_par_candidat: boolean; commentaire: string }[]) || [];
  const solutions_explorees = (corrige.solutions_explorees as { solution: string; mentionnee_par_candidat: boolean; commentaire: string }[]) || [];
  const erreurs_commises = (corrige.erreurs_commises as { erreur: string; exemple?: string; conseil: string }[]) || [];
  const points_forts = (corrige.points_forts as string[]) || [];
  const nf = notation?.note_finale || 0;

  return (
    <div style={{ maxWidth: 780, margin: "0 auto", padding: isMobile ? "20px 14px 48px" : "32px 20px 64px" }}>
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <p style={{ fontSize: 11, color: C.primary, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Résultat de votre simulation</p>
        <h2 style={{ fontFamily: "'Outfit',sans-serif", fontSize: 22, fontWeight: 800 }}>{sujet?.titre as string}</h2>
      </div>

      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 20, padding: 28, marginBottom: 16, textAlign: "center" }}>
        <p style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>Note finale</p>
        <div style={{ fontSize: 60, fontWeight: 800, fontFamily: "'Outfit',sans-serif", color: noteColor(nf), lineHeight: 1 }}>
          {nf}<span style={{ fontSize: 24, color: C.muted }}>/20</span>
        </div>
        <div style={{ width: "100%", maxWidth: 360, margin: "14px auto", height: 8, background: "rgba(255,255,255,0.07)", borderRadius: 4, overflow: "hidden" }}>
          <div style={{ width: `${(nf / 20) * 100}%`, height: "100%", background: noteColor(nf), borderRadius: 4 }} />
        </div>
        <p style={{ fontSize: 14, color: C.text, lineHeight: 1.75, maxWidth: 560, margin: "14px auto 0", opacity: 0.88 }}>{commentaire_jury}</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3,1fr)", gap: 10, marginBottom: 16 }}>
        {([
          { label: "👂 Écoute & Analyse", data: notation?.ecoute_analyse },
          { label: "🤝 Posture", data: notation?.posture },
          { label: "💡 Solutions", data: notation?.solutions },
        ] as { label: string; data: { note: number; justification: string } }[]).map(({ label, data }) => (
          <div key={label} style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 14px", textAlign: "center" }}>
            <p style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>{label}</p>
            <p style={{ fontSize: 32, fontWeight: 800, fontFamily: "'Outfit',sans-serif", color: noteColor(data?.note || 0), lineHeight: 1 }}>
              {data?.note || 0}<span style={{ fontSize: 14, color: C.muted }}>/20</span>
            </p>
            <div style={{ width: "100%", height: 3, background: "rgba(255,255,255,0.07)", borderRadius: 2, margin: "8px 0", overflow: "hidden" }}>
              <div style={{ width: `${((data?.note || 0) / 20) * 100}%`, height: "100%", background: noteColor(data?.note || 0), borderRadius: 2 }} />
            </div>
            <p style={{ fontSize: 10, color: C.muted, lineHeight: 1.5 }}>{data?.justification}</p>
          </div>
        ))}
      </div>

      <Card title="🔍 Éléments à découvrir" color={C.primary}>
        {elements_decouverts.map((el, i) => (
          <ItemRow key={i} found={el.trouve_par_candidat} main={el.element} sub={`Question : ${el.question_type_attendu}`} comment={el.commentaire} />
        ))}
      </Card>

      <Card title="💡 Solutions à explorer" color={C.warning}>
        {solutions_explorees.map((s, i) => (
          <ItemRow key={i} found={s.mentionnee_par_candidat} main={s.solution} comment={s.commentaire} />
        ))}
      </Card>

      <Card title="⚠️ Erreurs commises" color={C.accent}>
        {erreurs_commises.length === 0 ? (
          <p style={{ color: C.success, fontSize: 13 }}>✅ Aucune erreur majeure identifiée.</p>
        ) : (
          erreurs_commises.map((e, i) => (
            <div key={i} style={{ background: "rgba(255,107,107,0.07)", border: "1px solid rgba(255,107,107,0.18)", borderRadius: 10, padding: "10px 14px", marginBottom: 8 }}>
              <p style={{ fontWeight: 600, color: C.accent, fontSize: 13, marginBottom: e.exemple ? 4 : 2 }}>{e.erreur}</p>
              {e.exemple && <p style={{ fontSize: 11, color: C.muted, fontStyle: "italic", marginBottom: 4, paddingLeft: 8, borderLeft: "2px solid rgba(255,107,107,0.3)" }}>« {e.exemple} »</p>}
              <p style={{ fontSize: 11, color: C.text, opacity: 0.75 }}>💬 {e.conseil}</p>
            </div>
          ))
        )}
      </Card>

      {points_forts.length > 0 && (
        <Card title="💪 Points forts" color={C.success}>
          <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
            {points_forts.map((p, i) => (
              <li key={i} style={{ fontSize: 13, display: "flex", gap: 8 }}>
                <span style={{ color: C.success }}>✓</span>{p}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="📚 À retenir pour la prochaine fois" color={C.muted}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {["Reformuler d'abord", "Questions ouvertes", "Acteurs périphériques", "Ressources pro", "Écouter les indices", "Ne pas tout résoudre seul"].map((p) => (
            <span key={p} style={{ background: "rgba(108,99,255,0.12)", border: "1px solid rgba(108,99,255,0.2)", borderRadius: 20, padding: "4px 12px", fontSize: 12, color: C.muted }}>{p}</span>
          ))}
        </div>
      </Card>

      <button
        onClick={onRestart}
        style={{ ...btnStyle(C.primary), width: "100%", padding: "16px", fontSize: 16, fontFamily: "'Outfit',sans-serif", fontWeight: 700, marginTop: 8 }}
      >
        🔄 Nouvelle simulation
      </button>
    </div>
  );
}

// ─── Sous-composants ────────────────────────────────────────
function Card({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, padding: "20px 22px", marginBottom: 14 }}>
      <p style={{ fontFamily: "'Outfit',sans-serif", fontSize: 14, fontWeight: 700, color: color || C.primary, marginBottom: 14 }}>{title}</p>
      {children}
    </div>
  );
}

function ItemRow({ found, main, sub, comment }: { found: boolean; main: string; sub?: string; comment?: string }) {
  return (
    <div style={{ display: "flex", gap: 10, marginBottom: 10, padding: "11px 13px", background: found ? "rgba(78,203,113,0.06)" : "rgba(255,107,107,0.06)", borderRadius: 10, border: `1px solid ${found ? "rgba(78,203,113,0.18)" : "rgba(255,107,107,0.15)"}` }}>
      <span style={{ fontSize: 16, flexShrink: 0 }}>{found ? "✅" : "❌"}</span>
      <div>
        <p style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{main}</p>
        {sub && <p style={{ fontSize: 11, color: C.muted, marginBottom: comment ? 3 : 0 }}>{sub}</p>}
        {comment && <p style={{ fontSize: 11, color: found ? C.success : C.accent, fontStyle: "italic" }}>{comment}</p>}
      </div>
    </div>
  );
}
