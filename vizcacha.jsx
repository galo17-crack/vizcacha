import { useState, useEffect, useRef, useCallback } from "react";

/* ---------------------------------------------------------
   VIZCACHA — trivia diaria argentina, puntaje por rareza.
   Cuanto más rara tu respuesta, más hondo cava la vizcacha.
--------------------------------------------------------- */

const TIME_PER_Q = 20;

function stripAccents(s) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalize(raw) {
  let s = stripAccents(String(raw || "").toLowerCase().trim());
  s = s.replace(/[.,;:!?"'()]/g, "");
  s = s.replace(/\s+/g, " ").trim();
  const articles = ["el ", "la ", "los ", "las ", "un ", "una ", "unos ", "unas "];
  for (const a of articles) if (s.startsWith(a)) s = s.slice(a.length);
  // singularizacion muy simple
  if (s.endsWith("ces")) s = s.slice(0, -3) + "z";
  else if (s.length > 4 && s.endsWith("es") && !s.endsWith("ies")) s = s.slice(0, -2);
  else if (s.length > 3 && s.endsWith("s") && !s.endsWith("es")) s = s.slice(0, -1);
  return s.trim();
}

function isStructurallyValid(s) {
  if (!s || s.length < 2) return false;
  if (!/[aeiouáéíóúñ]/i.test(s)) return false;
  if (!/^[a-zñ0-9 ]+$/i.test(stripAccents(s))) return false;
  return true;
}

function buildSynonymIndex(synonyms) {
  const idx = {};
  for (const canonical of Object.keys(synonyms)) {
    idx[normalize(canonical)] = canonical;
    for (const variant of synonyms[canonical]) idx[normalize(variant)] = canonical;
  }
  return idx;
}

/* -------------------- Banco de preguntas -------------------- */
const QUESTIONS = [
  {
    id: "provincia",
    category: "Geografía",
    prompt: "Nombrá una provincia argentina.",
    type: "closed",
    synonyms: {
      "Buenos Aires": ["bs as", "bsas", "baires"],
      "Córdoba": [], "Santa Fe": [], "Mendoza": [],
      "Ciudad de Buenos Aires": ["caba", "capital federal", "capital"],
      "Tucumán": [], "Salta": [], "Entre Ríos": ["entre rios"],
      "Misiones": [], "Chaco": [], "Corrientes": [], "Neuquén": ["neuquen"],
      "Río Negro": ["rio negro"], "San Juan": [], "Jujuy": [],
      "La Rioja": [], "Catamarca": [], "San Luis": [], "Formosa": [],
      "Chubut": [], "Santa Cruz": [], "La Pampa": [],
      "Santiago del Estero": [], "Tierra del Fuego": [],
    },
    priors: {
      "buenos aires": 0.18, "cordoba": 0.12, "santa fe": 0.09, "mendoza": 0.08,
      "ciudad de buenos aire": 0.07, "tucuman": 0.05, "salta": 0.04,
      "entre rio": 0.04, "misiones": 0.03, "chaco": 0.03, "corriente": 0.03,
      "neuquen": 0.03, "rio negro": 0.02, "san juan": 0.02, "jujuy": 0.02,
      "la rioja": 0.015, "catamarca": 0.015, "san luis": 0.015,
      "formosa": 0.01, "chubut": 0.01, "santa cruz": 0.008, "la pampa": 0.008,
      "santiago del estero": 0.015, "tierra del fuego": 0.007,
    },
    longtailSize: 5,
  },
  {
    id: "animal",
    category: "Naturaleza",
    prompt: "Nombrá un animal autóctono de Argentina.",
    type: "open",
    priors: {
      "guanaco": 0.09, "nandu": 0.09, "yaguarete": 0.07, "puma": 0.08,
      "carpincho": 0.09, "aguara guazu": 0.03, "condor": 0.07, "vizcacha": 0.06,
      "zorro colorado": 0.03, "mara": 0.02, "pichi": 0.015, "chinchilla": 0.02,
      "huemul": 0.015, "yacare": 0.03, "ballena franca austral": 0.02,
      "pinguino": 0.03, "tapir": 0.01, "ciervo de los pantanos": 0.008,
    },
    longtailSize: 60,
  },
  {
    id: "mundial2022",
    category: "Fútbol",
    prompt: "Nombrá un jugador de la selección campeona del mundo en Qatar 2022.",
    type: "closed",
    synonyms: {
      "Messi": ["lionel messi", "leo messi", "la pulga"],
      "Di María": ["di maria", "fideo"], "Dibu Martínez": ["dibu martinez", "el dibu", "emiliano martinez"],
      "Julián Álvarez": ["julian alvarez", "la araña"], "Otamendi": ["nicolas otamendi"],
      "De Paul": ["rodrigo de paul"], "Enzo Fernández": ["enzo fernandez"],
      "Mac Allister": ["alexis mac allister"], "Lautaro Martínez": ["lautaro martinez", "el toro"],
      "Molina": ["nahuel molina"], "Cristian Romero": ["cuti romero"],
      "Acuña": ["marcos acuna"], "Paredes": ["leandro paredes"],
      "Guido Rodríguez": ["guido rodriguez"], "Palacios": ["exequiel palacios"],
      "Armani": ["franco armani"], "Rulli": ["geronimo rulli"],
      "Almada": ["thiago almada"], "Foyth": ["juan foyth"],
      "Tagliafico": ["nicolas tagliafico"], "Lisandro Martínez": ["lisandro martinez", "licha martinez"],
      "Dybala": ["paulo dybala"], "Correa": ["angel correa"], "Pezzella": ["german pezzella"],
    },
    priors: {
      "messi": 0.32, "di maria": 0.10, "dibu martinez": 0.09, "julian alvarez": 0.07,
      "otamendi": 0.04, "de paul": 0.05, "enzo fernandez": 0.04, "mac allister": 0.04,
      "lautaro martinez": 0.05, "molina": 0.02, "cristian romero": 0.03, "acuna": 0.02,
      "paredes": 0.015, "guido rodriguez": 0.008, "palacios": 0.008, "armani": 0.008,
      "rulli": 0.005, "almada": 0.006, "foyth": 0.005, "tagliafico": 0.008,
      "lisandro martinez": 0.01, "dybala": 0.01, "correa": 0.012, "pezzella": 0.004,
    },
    longtailSize: 3,
  },
  {
    id: "comida",
    category: "Comida",
    prompt: "Nombrá una comida típica argentina.",
    type: "open",
    priors: {
      "asado": 0.22, "milanesa": 0.14, "empanada": 0.14, "locro": 0.05,
      "choripan": 0.05, "dulce de leche": 0.05, "provoleta": 0.03,
      "alfajor": 0.05, "torta frita": 0.02, "guiso": 0.02, "humita": 0.015,
      "matambre": 0.02, "chinchulin": 0.01, "morcilla": 0.02,
      "vitel tone": 0.008, "pastelito": 0.015, "milanesa napolitana": 0.02,
    },
    longtailSize: 50,
  },
  {
    id: "modismo",
    category: "Modismos",
    prompt: "Nombrá una palabra o modismo bien argentino.",
    type: "open",
    priors: {
      "che": 0.16, "boludo": 0.14, "quilombo": 0.09, "laburo": 0.06,
      "bondi": 0.05, "pibe": 0.05, "posta": 0.04, "mango": 0.04,
      "chamuyo": 0.03, "capo": 0.03, "grosso": 0.03, "bardo": 0.025,
      "chabon": 0.02, "trucho": 0.025, "garron": 0.02, "aguante": 0.02,
      "joya": 0.02, "ortiba": 0.01, "gil": 0.02,
    },
    longtailSize: 80,
  },
  {
    id: "club",
    category: "Fútbol",
    prompt: "Nombrá un club de fútbol argentino.",
    type: "closed",
    synonyms: {
      "Boca Juniors": ["boca"], "River Plate": ["river"], "Racing Club": ["racing"],
      "Independiente": ["independiente"], "San Lorenzo": ["san lorenzo"],
      "Vélez Sarsfield": ["velez", "velez sarsfield"], "Estudiantes": ["estudiantes de la plata"],
      "Newell's Old Boys": ["newells", "newell's"], "Rosario Central": ["central"],
      "Talleres": ["talleres de cordoba"], "Belgrano": ["belgrano de cordoba"],
      "Huracán": ["huracan"], "Argentinos Juniors": ["argentinos"],
      "Banfield": [], "Lanús": ["lanus"], "Gimnasia": ["gimnasia la plata", "gimnasia y esgrima"],
      "Godoy Cruz": [], "Colón": ["colon"], "Unión": ["union de santa fe"],
      "Platense": [], "Tigre": [], "Defensa y Justicia": [], "Sarmiento": [],
      "Instituto": [], "Central Córdoba": ["central cordoba"], "Barracas Central": [],
    },
    priors: {
      "boca junior": 0.2, "river plate": 0.2, "racing club": 0.06, "independiente": 0.05,
      "san lorenzo": 0.06, "velez sarsfield": 0.04, "estudiante": 0.03,
      "newell's old boy": 0.03, "rosario central": 0.03, "talleres": 0.02,
      "belgrano": 0.02, "huracan": 0.02, "argentinos junior": 0.02, "banfield": 0.015,
      "lanus": 0.02, "gimnasia": 0.02, "godoy cruz": 0.01, "colon": 0.01,
      "union": 0.01, "platense": 0.01, "tigre": 0.01, "defensa y justicia": 0.015,
      "sarmiento": 0.007, "instituto": 0.005, "central cordoba": 0.006, "barraca central": 0.004,
    },
    longtailSize: 6,
  },
  {
    id: "kiosco",
    category: "Cotidiano",
    prompt: "Nombrá algo que encontrás en un kiosco argentino.",
    type: "open",
    priors: {
      "alfajor": 0.14, "chicle": 0.09, "caramelo": 0.09, "gaseosa": 0.1,
      "cigarrillo": 0.08, "papas fritas": 0.07, "criollitos": 0.03,
      "turron": 0.03, "chocolate": 0.07, "revista": 0.02, "pochoclo": 0.02,
      "pilas": 0.02, "media hora": 0.02, "sube": 0.02, "cerveza": 0.03,
    },
    longtailSize: 40,
  },
  {
    id: "mate",
    category: "Cotidiano",
    prompt: "Nombrá algo relacionado con tomar mate.",
    type: "open",
    priors: {
      "bombilla": 0.18, "yerba": 0.22, "termo": 0.15, "agua caliente": 0.08,
      "cebar": 0.06, "pava": 0.06, "azucar": 0.05, "mate cocido": 0.03,
      "yuyo": 0.02, "ronda": 0.02, "matero": 0.015,
    },
    longtailSize: 20,
  },
  {
    id: "banda",
    category: "Música",
    prompt: "Nombrá un cantante o banda de rock nacional.",
    type: "open",
    priors: {
      "soda stereo": 0.14, "charly garcia": 0.11, "fito paez": 0.06,
      "los redondito de ricota": 0.05, "divididos": 0.04, "bersuit": 0.04,
      "babasonico": 0.04, "la renga": 0.06, "attaque 77": 0.03,
      "sui generis": 0.03, "andres calamaro": 0.04, "indio solari": 0.03,
      "los piojo": 0.05, "callejero": 0.03, "miranda": 0.03,
      "illya kuryaki": 0.02, "airbag": 0.02, "tan bionica": 0.02,
    },
    longtailSize: 40,
  },
  {
    id: "historico",
    category: "Historia",
    prompt: "Nombrá un personaje histórico argentino.",
    type: "closed",
    synonyms: {
      "San Martín": ["san martin", "jose de san martin"], "Belgrano": ["manuel belgrano"],
      "Sarmiento": ["domingo sarmiento", "domingo faustino sarmiento"],
      "Eva Perón": ["evita", "eva peron"], "Juan Domingo Perón": ["peron", "juan domingo peron"],
      "Rosas": ["juan manuel de rosas"], "Moreno": ["mariano moreno"],
      "Güemes": ["guemes", "martin miguel de guemes"], "Alberdi": ["juan bautista alberdi"],
      "Yrigoyen": ["hipolito yrigoyen"], "Roca": ["julio argentino roca"],
      "Mitre": ["bartolome mitre"], "Rivadavia": ["bernardino rivadavia"],
    },
    priors: {
      "san martin": 0.3, "belgrano": 0.16, "sarmiento": 0.14, "evita": 0.08,
      "juan domingo peron": 0.06, "roca": 0.03, "moreno": 0.04, "guemes": 0.03,
      "alberdi": 0.02, "yrigoyen": 0.025, "mitre": 0.025, "rivadavia": 0.02,
    },
    longtailSize: 5,
  },
  {
    id: "transporte",
    category: "Cotidiano",
    prompt: "Nombrá un medio de transporte que se usa en Argentina.",
    type: "open",
    priors: {
      "colectivo": 0.24, "bondi": 0.1, "subte": 0.16, "tren": 0.14,
      "taxi": 0.08, "remis": 0.08, "bici": 0.06, "auto": 0.06, "moto": 0.04,
    },
    longtailSize: 8,
  },
  {
    id: "verano",
    category: "Estaciones",
    prompt: "Nombrá algo que hacés en verano en Argentina.",
    type: "open",
    priors: {
      "ir a la playa": 0.14, "pileta": 0.16, "asado": 0.1, "feriado": 0.04,
      "ventilador": 0.06, "siesta": 0.05, "mate con hielo": 0.04,
      "mar del plata": 0.05, "villa gesell": 0.02, "aire acondicionado": 0.05,
    },
    longtailSize: 20,
  },
  {
    id: "invierno",
    category: "Estaciones",
    prompt: "Nombrá algo que hacés en invierno en Argentina.",
    type: "open",
    priors: {
      "mate caliente": 0.13, "estufa": 0.1, "esqui": 0.05, "bariloche": 0.04,
      "frazada": 0.06, "sopa": 0.06, "chocolate caliente": 0.06, "nieve": 0.05,
    },
    longtailSize: 20,
  },
  {
    id: "marca",
    category: "Marcas",
    prompt: "Nombrá una marca argentina.",
    type: "open",
    priors: {
      "havanna": 0.14, "arcor": 0.16, "quilmes": 0.14, "la serenisima": 0.08,
      "freddo": 0.07, "grido": 0.06, "alpargatas": 0.03, "molinos": 0.02,
    },
    longtailSize: 25,
  },
  {
    id: "tv",
    category: "TV y cine",
    prompt: "Nombrá un programa o serie de TV argentina.",
    type: "open",
    priors: {
      "casados con hijo": 0.13, "los simuladores": 0.09, "gran hermano": 0.13,
      "el marginal": 0.07, "okupas": 0.05, "showmatch": 0.06, "8 escalones": 0.04,
      "chiquitita": 0.05, "peter capusotto": 0.04, "bailando por un sueno": 0.05,
    },
    longtailSize: 30,
  },
  {
    id: "pelicula",
    category: "TV y cine",
    prompt: "Nombrá una película argentina.",
    type: "open",
    priors: {
      "el secreto de sus ojo": 0.14, "relatos salvaje": 0.14, "nueve reina": 0.08,
      "argentina 1985": 0.1, "el hijo de la novia": 0.05, "un cuento chino": 0.04,
      "el clan": 0.06, "la odisea de los gile": 0.03,
    },
    longtailSize: 30,
  },
  {
    id: "colegio",
    category: "Colegio",
    prompt: "Nombrá una materia que se estudia en el colegio argentino.",
    type: "open",
    priors: {
      "matematica": 0.18, "historia": 0.12, "geografia": 0.1, "lengua": 0.12,
      "educacion fisica": 0.1, "biologia": 0.08, "quimica": 0.06,
      "musica": 0.05, "plastica": 0.05, "ingles": 0.06,
    },
    longtailSize: 10,
  },
  {
    id: "feriado",
    category: "Historia",
    prompt: "Nombrá una fecha patria o feriado argentino.",
    type: "closed",
    synonyms: {
      "25 de Mayo": ["25 de mayo", "revolucion de mayo"],
      "9 de Julio": ["9 de julio", "independencia"],
      "20 de Junio": ["20 de junio", "dia de la bandera"],
      "17 de Agosto": ["17 de agosto", "muerte de san martin"],
      "24 de Marzo": ["24 de marzo", "dia de la memoria"],
      "2 de Abril": ["2 de abril", "dia del veterano", "malvinas"],
      "12 de Octubre": ["12 de octubre"], "Navidad": ["25 de diciembre"],
      "Año Nuevo": ["1 de enero", "ano nuevo"],
    },
    priors: {
      "25 de mayo": 0.28, "9 de julio": 0.26, "20 de junio": 0.1,
      "17 de agosto": 0.08, "24 de marzo": 0.07, "2 de abril": 0.06,
      "12 de octubre": 0.05, "navidad": 0.05, "ano nuevo": 0.05,
    },
    longtailSize: 3,
  },
  {
    id: "asado",
    category: "Comida",
    prompt: "Nombrá algo típico de un asado argentino.",
    type: "open",
    priors: {
      "chorizo": 0.16, "morcilla": 0.1, "achura": 0.08, "vacio": 0.1,
      "asado de tira": 0.08, "chimichurri": 0.1, "pan": 0.05,
      "ensalada": 0.06, "vino": 0.08, "parrillero": 0.03, "sobremesa": 0.03,
    },
    longtailSize: 20,
  },
];

/* -------------------- Utilidades de fecha y storage -------------------- */
function arDateString() {
  const now = new Date();
  const ar = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return ar.toISOString().slice(0, 10);
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return h;
}

function pickDailyQuestions(dateStr, count) {
  const rng = mulberry32(hashSeed(dateStr));
  const pool = [...QUESTIONS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

function msUntilNextArMidnight() {
  const now = new Date();
  const ar = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const next = new Date(Date.UTC(ar.getUTCFullYear(), ar.getUTCMonth(), ar.getUTCDate() + 1, 3, 0, 0));
  return next.getTime() - now.getTime();
}

function formatCountdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(total / 3600)).padStart(2, "0");
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

/* -------------------- Puntaje --------------------- */
const K_WEIGHT = 14;

function getPrior(q, canonical) {
  if (q.priors[canonical] !== undefined) return q.priors[canonical];
  const knownMass = Object.values(q.priors).reduce((a, b) => a + b, 0);
  const remaining = Math.max(0.02, 1 - knownMass);
  return remaining / Math.max(1, q.longtailSize);
}

function computeScore(q, canonical, liveCounts, liveTotal) {
  const prior = getPrior(q, canonical);
  const count = liveCounts[canonical] || 0;
  const p = (count + K_WEIGHT * prior) / (liveTotal + K_WEIGHT);
  const raw = 1000 * Math.pow(1 - p, 2.3);
  return Math.max(30, Math.min(1000, Math.round(raw / 10) * 10));
}

function tierFor(score) {
  if (score >= 850) return { level: 6, label: "Rarísima", color: "#8a5a2b" };
  if (score >= 650) return { level: 5, label: "Muy rara", color: "#a9762f" };
  if (score >= 450) return { level: 4, label: "Poco común", color: "#c99a3f" };
  if (score >= 280) return { level: 3, label: "Común", color: "#8f9b6e" };
  if (score >= 120) return { level: 2, label: "Muy común", color: "#6d7a55" };
  return { level: 1, label: "Clásica", color: "#586640" };
}

/* -------------------- Vizcacha SVG -------------------- */
function BurrowVisual({ level, animate }) {
  const depthPct = [0, 14, 26, 40, 55, 70, 86][level];
  return (
    <svg viewBox="0 0 200 260" style={{ width: 96, height: 124 }} aria-hidden="true">
      <rect x="0" y="0" width="200" height="40" fill="#7A8B69" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <rect key={i} x="0" y={40 + i * 36} width="200" height="36"
          fill={i % 2 === 0 ? "#3D2B1F" : "#33261B"} opacity={0.55 + i * 0.07} />
      ))}
      <path
        d={`M100,40 Q92,${40 + depthPct} 100,${40 + depthPct * 1.6} Q108,${40 + depthPct * 2} 100,${40 + depthPct * 2.4}`}
        stroke="#E8DCC4" strokeWidth="14" strokeLinecap="round" fill="none" opacity="0.9"
        style={{ transition: animate ? "d 0.6s ease" : "none" }}
      />
      <g transform={`translate(100 ${40 + depthPct * 2.4})`}>
        <ellipse cx="0" cy="0" rx="16" ry="11" fill="#B99A6B" />
        <circle cx="10" cy="-4" r="6" fill="#B99A6B" />
        <circle cx="13" cy="-6" r="1.6" fill="#211710" />
      </g>
    </svg>
  );
}

/* -------------------- Componente principal -------------------- */
export default function Vizcacha() {
  const [phase, setPhase] = useState("landing");
  const [dailyQuestions, setDailyQuestions] = useState([]);
  const [qIndex, setQIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(TIME_PER_Q);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [results, setResults] = useState([]);
  const [revealData, setRevealData] = useState(null);
  const [countdown, setCountdown] = useState("");
  const [playersToday, setPlayersToday] = useState(null);
  const [percentile, setPercentile] = useState(null);
  const [loadErr, setLoadErr] = useState("");

  const sessionRef = useRef(
    typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Math.random())
  );
  const dateStr = useRef(arDateString()).current;
  const timerRef = useRef(null);

  useEffect(() => {
    setDailyQuestions(pickDailyQuestions(dateStr, 7));
  }, [dateStr]);

  useEffect(() => {
    const id = setInterval(() => setCountdown(formatCountdown(msUntilNextArMidnight())), 1000);
    return () => clearInterval(id);
  }, []);

  const startTimer = useCallback(() => {
    clearInterval(timerRef.current);
    setTimeLeft(TIME_PER_Q);
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    if (phase === "playing" && timeLeft === 0) {
      handleSubmit(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, phase]);

  async function beginGame() {
    setPhase("playing");
    setQIndex(0);
    setResults([]);
    setInput("");
    setError("");
    startTimer();
  }

  function canonicalize(q, raw) {
    const norm = normalize(raw);
    if (q.type === "closed") {
      const idx = buildSynonymIndex(q.synonyms);
      return idx[norm] ? normalize(idx[norm]) : null;
    }
    return isStructurallyValid(norm) ? norm : null;
  }

  async function handleSubmit(timedOut) {
    const q = dailyQuestions[qIndex];
    if (!q) return;
    clearInterval(timerRef.current);

    if (timedOut && !input.trim()) {
      const rec = { question: q, canonical: null, raw: "", score: 0, tier: tierFor(0), skipped: true };
      setResults((r) => [...r, rec]);
      setRevealData(rec);
      setPhase("reveal");
      return;
    }

    const canonical = canonicalize(q, input);
    if (!canonical) {
      setError(
        q.type === "closed"
          ? "Esa no parece una respuesta válida para esta categoría. Probá de nuevo."
          : "Escribí una respuesta con letras, un poco más larga."
      );
      return;
    }
    setError("");

    let liveCounts = {};
    let liveTotal = 0;
    try {
      const key = `viz:${dateStr}:${q.id}`;
      let stored = null;
      try {
        stored = await window.storage.get(key, true);
      } catch {
        stored = null;
      }
      const data = stored?.value ? JSON.parse(stored.value) : { counts: {}, total: 0 };
      data.counts[canonical] = (data.counts[canonical] || 0) + 1;
      data.total = (data.total || 0) + 1;
      liveCounts = data.counts;
      liveTotal = data.total;
      await window.storage.set(key, JSON.stringify(data), true);
    } catch (e) {
      setLoadErr("No se pudo guardar en el servidor compartido, jugando en modo local.");
    }

    const score = computeScore(q, canonical, liveCounts, liveTotal);
    const tier = tierFor(score);
    const rec = { question: q, canonical, raw: input, score, tier, skipped: false };
    setResults((r) => [...r, rec]);
    setRevealData(rec);
    setInput("");
    setPhase("reveal");
  }

  async function goNext() {
    const next = qIndex + 1;
    if (next >= dailyQuestions.length) {
      await finishGame();
      return;
    }
    setQIndex(next);
    setInput("");
    setError("");
    setPhase("playing");
    startTimer();
  }

  async function finishGame() {
    const total = results.reduce((a, r) => a + r.score, 0);
    try {
      const key = `viz:${dateStr}:scores`;
      let stored = null;
      try {
        stored = await window.storage.get(key, true);
      } catch {
        stored = null;
      }
      const arr = stored?.value ? JSON.parse(stored.value) : [];
      arr.push(total);
      const trimmed = arr.length > 400 ? arr.slice(arr.length - 400) : arr;
      await window.storage.set(key, JSON.stringify(trimmed), true);
      setPlayersToday(trimmed.length);
      const below = trimmed.filter((s) => s <= total).length;
      setPercentile(Math.round((below / trimmed.length) * 100));
    } catch {
      setPlayersToday(null);
      setPercentile(null);
    }
    setPhase("summary");
  }

  function shareText() {
    const total = results.reduce((a, r) => a + r.score, 0);
    const squares = results
      .map((r) => (r.skipped ? "⬜" : ["🟫", "🟫", "🟤", "🟤", "🪵", "⬛"][r.tier.level - 1] || "🟫"))
      .join("");
    const text = `Vizcacha ${dateStr}\n${squares}\n${total} pts cavados${
      percentile !== null ? ` · top ${100 - percentile}%` : ""
    }\nvizcacha.ar`;
    if (navigator.clipboard) navigator.clipboard.writeText(text);
    return text;
  }

  const q = dailyQuestions[qIndex];
  const totalScore = results.reduce((a, r) => a + r.score, 0);

  return (
    <div style={styles.app}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@600;800&family=Work+Sans:wght@400;500;600&display=swap');
        * { box-sizing: border-box; font-family: 'Work Sans', sans-serif; }
        .vz-display { font-family: 'Big Shoulders Display', sans-serif; }
        .vz-btn { cursor: pointer; border: none; transition: transform 0.08s ease; }
        .vz-btn:active { transform: scale(0.97); }
        .vz-input:focus { outline: 2px solid #C9A227; }
      `}</style>

      {phase === "landing" && (
        <div style={styles.landingWrap}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
            <BurrowVisual level={3} animate={false} />
          </div>
          <h1 className="vz-display" style={styles.h1}>VIZCACHA</h1>
          <p style={styles.tagline}>
            Cuanto más rara tu respuesta, más hondo cava la vizcacha.
          </p>
          <p style={styles.sub}>
            7 preguntas por día, iguales para todos. Ganás puntos según cuán poco común
            sea lo que respondiste comparado con el resto de Argentina.
          </p>
          <button className="vz-btn" style={styles.primaryBtn} onClick={beginGame}>
            Jugar de hoy
          </button>
          <p style={styles.meta}>Partida del {dateStr} · nueva a las 00:00 (ARG)</p>
        </div>
      )}

      {phase === "playing" && q && (
        <div style={styles.card}>
          <div style={styles.progressRow}>
            <span style={styles.progressText}>Pregunta {qIndex + 1} de {dailyQuestions.length}</span>
            <span style={{ ...styles.progressText, color: timeLeft <= 5 ? "#b5533c" : "#8a8676" }}>
              {timeLeft}s
            </span>
          </div>
          <div style={styles.timerBar}>
            <div style={{ ...styles.timerFill, width: `${(timeLeft / TIME_PER_Q) * 100}%` }} />
          </div>
          <p style={styles.category}>{q.category}</p>
          <h2 className="vz-display" style={styles.question}>{q.prompt}</h2>
          <input
            className="vz-input"
            style={styles.input}
            value={input}
            onChange={(e) => { setInput(e.target.value); setError(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(false); }}
            placeholder="Escribí tu respuesta"
            autoFocus
          />
          {error && <p style={styles.errorText}>{error}</p>}
          <button className="vz-btn" style={styles.primaryBtn} onClick={() => handleSubmit(false)}>
            Confirmar
          </button>
        </div>
      )}

      {phase === "reveal" && revealData && (
        <div style={styles.card}>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <BurrowVisual level={revealData.tier.level} animate />
          </div>
          {revealData.skipped ? (
            <>
              <h2 className="vz-display" style={styles.question}>Se acabó el tiempo</h2>
              <p style={styles.sub}>No llegaste a responder esta. 0 puntos.</p>
            </>
          ) : (
            <>
              <p style={{ ...styles.category, textAlign: "center" }}>
                Respondiste: <strong style={{ color: "#E8DCC4" }}>{revealData.raw}</strong>
              </p>
              <h2 className="vz-display" style={{ ...styles.score, color: revealData.tier.color }}>
                +{revealData.score}
              </h2>
              <p style={styles.tierLabel}>{revealData.tier.label}</p>
            </>
          )}
          <button className="vz-btn" style={styles.primaryBtn} onClick={goNext}>
            {qIndex + 1 >= dailyQuestions.length ? "Ver resultado final" : "Siguiente pregunta"}
          </button>
        </div>
      )}

      {phase === "summary" && (
        <div style={styles.card}>
          <p style={styles.category}>Resultado de hoy</p>
          <h1 className="vz-display" style={styles.h1}>{totalScore} pts</h1>
          {percentile !== null && (
            <p style={styles.sub}>
              Cavaste más hondo que el {percentile}% de {playersToday} vizcachas hoy.
            </p>
          )}
          <div style={styles.summaryList}>
            {results.map((r, i) => (
              <div key={i} style={styles.summaryRow}>
                <span style={{ ...styles.dot, background: r.skipped ? "#4a4438" : r.tier.color }} />
                <span style={styles.summaryQ}>{r.question.category}</span>
                <span style={styles.summaryScore}>{r.skipped ? "0" : r.score}</span>
              </div>
            ))}
          </div>
          <button className="vz-btn" style={styles.primaryBtn} onClick={shareText}>
            Copiar resultado para compartir
          </button>
          <p style={styles.meta}>Próxima partida en {countdown}</p>
          {loadErr && <p style={styles.errorText}>{loadErr}</p>}
        </div>
      )}
    </div>
  );
}

const styles = {
  app: {
    minHeight: 480, background: "#1B140F", color: "#E8DCC4",
    padding: "2rem 1.25rem", display: "flex", justifyContent: "center",
    borderRadius: 16,
  },
  landingWrap: { maxWidth: 420, textAlign: "center" },
  h1: { fontSize: 48, fontWeight: 800, letterSpacing: 1, margin: "0 0 4px", color: "#E8DCC4" },
  tagline: { fontSize: 16, fontWeight: 500, color: "#C9A227", margin: "0 0 12px" },
  sub: { fontSize: 14, color: "#B3AB96", lineHeight: 1.6, margin: "0 0 24px" },
  meta: { fontSize: 12, color: "#7A7362", marginTop: 16 },
  primaryBtn: {
    background: "#C9A227", color: "#1B140F", fontWeight: 600, fontSize: 15,
    padding: "12px 28px", borderRadius: 8, width: "100%", maxWidth: 320,
  },
  card: {
    maxWidth: 420, width: "100%", background: "#241B14", borderRadius: 14,
    padding: "1.5rem", border: "1px solid #3D2B1F",
  },
  progressRow: { display: "flex", justifyContent: "space-between", marginBottom: 6 },
  progressText: { fontSize: 12, color: "#8a8676" },
  timerBar: { height: 4, background: "#3D2B1F", borderRadius: 2, overflow: "hidden", marginBottom: 20 },
  timerFill: { height: "100%", background: "#7A8B69", transition: "width 1s linear" },
  category: { fontSize: 12, textTransform: "none", color: "#7A8B69", margin: "0 0 6px", fontWeight: 500 },
  question: { fontSize: 26, fontWeight: 700, margin: "0 0 20px", lineHeight: 1.15, color: "#E8DCC4" },
  input: {
    width: "100%", padding: "12px 14px", fontSize: 15, borderRadius: 8,
    border: "1px solid #3D2B1F", background: "#1B140F", color: "#E8DCC4", marginBottom: 12,
  },
  errorText: { color: "#D08668", fontSize: 13, margin: "0 0 12px" },
  score: { fontSize: 44, fontWeight: 800, textAlign: "center", margin: "12px 0 2px" },
  tierLabel: { textAlign: "center", fontSize: 14, color: "#B3AB96", margin: "0 0 20px" },
  summaryList: { margin: "20px 0" },
  summaryRow: { display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #3D2B1F" },
  dot: { width: 10, height: 10, borderRadius: "50%", flexShrink: 0 },
  summaryQ: { flex: 1, fontSize: 13, color: "#B3AB96" },
  summaryScore: { fontSize: 14, fontWeight: 600 },
};
