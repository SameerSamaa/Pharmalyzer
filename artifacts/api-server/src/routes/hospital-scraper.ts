export interface Doctor {
  name: string;
  speciality: string;
  opd: string;
  timing: string;
  hospital: string;
  hospitalPhone: string;
  hospitalAddress: string;
  hospitalUrl: string;
  city: string;
}

interface CacheEntry {
  doctors: Doctor[];
  fetchedAt: number;
}

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const cache = new Map<string, CacheEntry>();

// ── Hospital registry ──────────────────────────────────────────────────────

const HOSPITALS: Record<string, {
  name: string;
  phone: string;
  address: string;
  url: string;
  city: string;
  fetchFn: () => Promise<Doctor[]>;
}> = {
  kmh: {
    name: "Kutiyana Memon Hospital (KMH)",
    phone: "021-111-564-111",
    address: "45-47 New M.A. Jinnah Road, Karachi",
    url: "https://kmh.org.pk/doctors/",
    city: "karachi",
    fetchFn: fetchKMHDoctors,
  },
  saifee: {
    name: "Saifee Hospital",
    phone: "021-36601700",
    address: "Karachi Cantonment, Karachi",
    url: "https://saifeehospital.com.pk/doctors/",
    city: "karachi",
    fetchFn: fetchSaifeeDoctors,
  },
  lnh: {
    name: "Liaquat National Hospital (LNH)",
    phone: "021-111-588-588",
    address: "Stadium Road, Karachi",
    url: "https://www.lnh.edu.pk/doctors",
    city: "karachi",
    fetchFn: fetchLNHDoctors,
  },
  akuh: {
    name: "Aga Khan University Hospital (AKUH)",
    phone: "021-111-911-911",
    address: "Stadium Road, Karachi",
    url: "https://hospitals.aku.edu/pakistan/patientservices/Pages/findadoctor.aspx",
    city: "karachi",
    fetchFn: fetchAKUHDoctors,
  },
};

// ── KMH scraper ────────────────────────────────────────────────────────────

async function fetchKMHDoctors(): Promise<Doctor[]> {
  const res = await fetch("https://kmh.org.pk/doctors/", {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) throw new Error(`KMH fetch failed: ${res.status}`);
  const html = await res.text();

  const match = html.match(/const doctors\s*=\s*(\[[\s\S]*?\]);/);
  if (!match) throw new Error("KMH: doctors array not found in page");

  const rawJs = match[1];
  const doctors: Doctor[] = [];

  const entryRegex =
    /\{\s*name:\s*"([^"]+)",\s*speciality:\s*"([^"]+)",\s*opd:\s*"([^"]*)",\s*timing:\s*"([^"]*)"\s*\}/g;

  let m: RegExpExecArray | null;
  while ((m = entryRegex.exec(rawJs)) !== null) {
    doctors.push({
      name: m[1].trim(),
      speciality: m[2].replace(/<br>/gi, " / ").trim(),
      opd: m[3].replace(/<br>/gi, " / ").trim(),
      timing: m[4].replace(/<br>/gi, " / ").trim(),
      hospital: HOSPITALS.kmh.name,
      hospitalPhone: HOSPITALS.kmh.phone,
      hospitalAddress: HOSPITALS.kmh.address,
      hospitalUrl: HOSPITALS.kmh.url,
      city: HOSPITALS.kmh.city,
    });
  }

  return doctors;
}

// ── Saifee Hospital scraper ────────────────────────────────────────────────

async function fetchSaifeeDoctors(): Promise<Doctor[]> {
  const res = await fetch("https://saifeehospital.com.pk/doctors/", {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) throw new Error(`Saifee fetch failed: ${res.status}`);
  const html = await res.text();

  const doctors: Doctor[] = [];

  // Each doctor card has an appointment URL with speciality and doctor name
  // Pattern: book-an-appointment?speciality=SPECIALITY&doctor=Dr.+Name
  // Doctor display name is in .doctor-content a
  const cardRegex =
    /book-an-appointment\?speciality=([^&"]+)&(?:amp;)?doctor=([^"]+)["'][^>]*>[\s\S]*?<div class="doctor-content">\s*<a[^>]*>([^<]+)<\/a>/g;

  let m: RegExpExecArray | null;
  while ((m = cardRegex.exec(html)) !== null) {
    const rawSpeciality = decodeURIComponent(m[1].replace(/\+/g, " ")).trim();
    const displayName = m[3].trim();
    if (!displayName) continue;

    // Try to extract timing from the hidden span after this card
    // Pattern: <span class="timing" style="display: none;">...timingText...
    doctors.push({
      name: displayName,
      speciality: rawSpeciality
        .split(" ")
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" "),
      opd: "Mon–Sat",
      timing: "Contact hospital for timings",
      hospital: HOSPITALS.saifee.name,
      hospitalPhone: HOSPITALS.saifee.phone,
      hospitalAddress: HOSPITALS.saifee.address,
      hospitalUrl: HOSPITALS.saifee.url,
      city: HOSPITALS.saifee.city,
    });
  }

  // Deduplicate by name
  const seen = new Set<string>();
  return doctors.filter(d => {
    if (seen.has(d.name)) return false;
    seen.add(d.name);
    return true;
  });
}

// ── LNH scraper ────────────────────────────────────────────────────────────

async function fetchLNHDoctors(): Promise<Doctor[]> {
  const res = await fetch("https://www.lnh.edu.pk/doctors", {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) throw new Error(`LNH fetch failed: ${res.status}`);
  const html = await res.text();

  const doctors: Doctor[] = [];

  // Doctor name: <h5 class="name mb-0 mt-0 text-theme-colored">Dr. Name</h5>
  // Speciality: <p class="font-14 font-weight-500">\n  Designation\n  <br />\n  Speciality\n</p>
  const cardRegex =
    /<h5 class="name mb-0 mt-0 text-theme-colored">([\s\S]*?)<\/h5>[\s\S]*?<p class="font-14 font-weight-500">([\s\S]*?)<\/p>/g;

  let m: RegExpExecArray | null;
  while ((m = cardRegex.exec(html)) !== null) {
    const name = m[1].replace(/\s+/g, " ").trim();
    if (!name) continue;

    // The <p> block contains: Designation<br />Speciality
    const pContent = m[2];
    const parts = pContent.split(/<br\s*\/?>/i).map(p => p.replace(/\s+/g, " ").trim()).filter(Boolean);
    // Last non-empty part is the speciality
    const speciality = parts[parts.length - 1] || "General";

    doctors.push({
      name,
      speciality,
      opd: "Mon–Sat",
      timing: "Contact hospital for OPD timings",
      hospital: HOSPITALS.lnh.name,
      hospitalPhone: HOSPITALS.lnh.phone,
      hospitalAddress: HOSPITALS.lnh.address,
      hospitalUrl: HOSPITALS.lnh.url,
      city: HOSPITALS.lnh.city,
    });
  }

  return doctors;
}

// ── AKUH scraper ───────────────────────────────────────────────────────────

async function fetchAKUHDoctors(): Promise<Doctor[]> {
  const res = await fetch("https://hospitals.aku.edu/pakistan/patientservices/Pages/findadoctor.aspx", {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) throw new Error(`AKUH fetch failed: ${res.status}`);
  const html = await res.text();

  const doctors: Doctor[] = [];

  // Pattern from Angular ng-click:
  // ng-click='getScheduleDoc("CODE" , "Speciality","Doctor Name ")'
  const scheduleRegex =
    /ng-click='getScheduleDoc\("[^"]*"\s*,\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)'\s+class="btn btn-xs btn-xs-Schedue/g;

  let m: RegExpExecArray | null;
  while ((m = scheduleRegex.exec(html)) !== null) {
    const speciality = m[1].trim();
    const name = m[2].trim();
    if (!name || !speciality) continue;

    doctors.push({
      name,
      speciality,
      opd: "Mon–Sat",
      timing: "Contact AKUH for OPD timings",
      hospital: HOSPITALS.akuh.name,
      hospitalPhone: HOSPITALS.akuh.phone,
      hospitalAddress: HOSPITALS.akuh.address,
      hospitalUrl: HOSPITALS.akuh.url,
      city: HOSPITALS.akuh.city,
    });
  }

  // If scraping produced no results (JS-heavy fallback), return sentinel
  if (doctors.length === 0) {
    return [{
      name: "Find Doctor via AKUH Directory",
      speciality: "All Specialities Available",
      opd: "Mon–Sat",
      timing: "8:00 AM – 8:00 PM (varies by doctor)",
      hospital: HOSPITALS.akuh.name,
      hospitalPhone: HOSPITALS.akuh.phone,
      hospitalAddress: HOSPITALS.akuh.address,
      hospitalUrl: HOSPITALS.akuh.url,
      city: HOSPITALS.akuh.city,
    }];
  }

  return doctors;
}

// ── Cache layer ────────────────────────────────────────────────────────────

async function getDoctorsFromHospital(key: string): Promise<Doctor[]> {
  const hosp = HOSPITALS[key];
  if (!hosp) return [];

  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.doctors;
  }

  const doctors = await hosp.fetchFn();
  cache.set(key, { doctors, fetchedAt: Date.now() });
  return doctors;
}

// ── Comprehensive symptom → specialty mapping ──────────────────────────────

const SYMPTOM_SPECIALTY_MAP: Record<string, string[]> = {
  // ── Heart / Cardiovascular ──
  "heart": ["cardiolog", "cardiac"],
  "heart pain": ["cardiolog", "cardiac"],
  "heart attack": ["cardiolog", "cardiac"],
  "chest pain": ["cardiolog", "cardiac", "chest"],
  "chest tightness": ["cardiolog", "cardiac"],
  "palpitation": ["cardiolog", "cardiac"],
  "irregular heartbeat": ["cardiolog", "cardiac"],
  "high blood pressure": ["cardiolog", "cardiac"],
  "hypertension": ["cardiolog", "cardiac"],
  "low blood pressure": ["cardiolog", "cardiac"],
  "cardiac": ["cardiolog", "cardiac"],
  "cardiologist": ["cardiolog", "cardiac"],
  "angina": ["cardiolog", "cardiac"],
  "heart failure": ["cardiolog", "cardiac"],

  // ── Lungs / Respiratory ──
  "breathing": ["pulmonolog", "chest"],
  "shortness of breath": ["pulmonolog", "chest", "cardiolog"],
  "difficulty breathing": ["pulmonolog", "chest"],
  "cough": ["pulmonolog", "chest", "general physician"],
  "asthma": ["pulmonolog", "chest"],
  "lung": ["pulmonolog", "chest"],
  "pneumonia": ["pulmonolog", "chest"],
  "tuberculosis": ["pulmonolog", "chest"],
  "tb": ["pulmonolog", "chest"],
  "chest infection": ["pulmonolog", "chest"],
  "wheezing": ["pulmonolog", "chest"],
  "pulmonologist": ["pulmonolog"],

  // ── Brain / Nervous System ──
  "brain": ["neurolog"],
  "headache": ["neurolog"],
  "severe headache": ["neurolog"],
  "migraine": ["neurolog"],
  "seizure": ["neurolog"],
  "epilepsy": ["neurolog"],
  "paralysis": ["neurolog"],
  "stroke": ["neurolog"],
  "memory loss": ["neurolog"],
  "forgetfulness": ["neurolog"],
  "dizziness": ["neurolog", "e.n.t"],
  "vertigo": ["neurolog", "e.n.t"],
  "numbness": ["neurolog"],
  "tingling": ["neurolog"],
  "tremor": ["neurolog"],
  "parkinson": ["neurolog"],
  "nerves": ["neurolog"],
  "spinal cord": ["neurolog", "orthopedic"],
  "neurologist": ["neurolog"],

  // ── Bones / Joints / Muscles ──
  "bone": ["orthopedic", "orthopaedic"],
  "fracture": ["orthopedic", "orthopaedic"],
  "broken bone": ["orthopedic", "orthopaedic"],
  "joint pain": ["orthopedic", "orthopaedic", "rheumatolog"],
  "knee pain": ["orthopedic", "orthopaedic"],
  "shoulder pain": ["orthopedic", "orthopaedic"],
  "hip pain": ["orthopedic", "orthopaedic"],
  "back pain": ["orthopedic", "orthopaedic", "neurolog"],
  "neck pain": ["orthopedic", "orthopaedic"],
  "spine": ["orthopedic", "orthopaedic"],
  "arthritis": ["orthopedic", "orthopaedic", "rheumatolog"],
  "sports injury": ["orthopedic", "orthopaedic"],
  "slip disc": ["orthopedic", "orthopaedic"],
  "disc": ["orthopedic", "orthopaedic"],
  "orthopedic": ["orthopedic", "orthopaedic"],

  // ── Stomach / Digestive ──
  "stomach": ["gastroenterolog"],
  "stomach ache": ["gastroenterolog"],
  "stomach pain": ["gastroenterolog"],
  "abdomen": ["gastroenterolog"],
  "abdominal pain": ["gastroenterolog"],
  "vomiting": ["gastroenterolog", "general physician"],
  "nausea": ["gastroenterolog", "general physician"],
  "diarrhea": ["gastroenterolog", "general physician"],
  "loose motion": ["gastroenterolog", "general physician"],
  "constipation": ["gastroenterolog"],
  "bloating": ["gastroenterolog"],
  "acidity": ["gastroenterolog"],
  "acid reflux": ["gastroenterolog"],
  "heartburn": ["gastroenterolog"],
  "ulcer": ["gastroenterolog"],
  "liver": ["gastroenterolog", "hepatolog"],
  "jaundice": ["gastroenterolog", "hepatolog"],
  "hepatitis": ["gastroenterolog", "hepatolog"],
  "fatty liver": ["gastroenterolog", "hepatolog"],
  "gallstone": ["gastroenterolog"],
  "colitis": ["gastroenterolog"],
  "ibs": ["gastroenterolog"],
  "gastroenterologist": ["gastroenterolog"],

  // ── Skin ──
  "skin": ["dermatolog"],
  "rash": ["dermatolog"],
  "eczema": ["dermatolog"],
  "psoriasis": ["dermatolog"],
  "acne": ["dermatolog"],
  "pimple": ["dermatolog"],
  "itching": ["dermatolog"],
  "hives": ["dermatolog"],
  "hair loss": ["dermatolog"],
  "dandruff": ["dermatolog"],
  "fungal": ["dermatolog"],
  "wart": ["dermatolog"],
  "wound": ["dermatolog", "general surgeon"],
  "dermatologist": ["dermatolog"],

  // ── Eyes ──
  "eye": ["ophthalmolog"],
  "eyes": ["ophthalmolog"],
  "vision": ["ophthalmolog"],
  "blurry vision": ["ophthalmolog"],
  "eye pain": ["ophthalmolog"],
  "cataract": ["ophthalmolog"],
  "glaucoma": ["ophthalmolog"],
  "spectacles": ["ophthalmolog"],
  "glasses": ["ophthalmolog"],
  "ophthalmologist": ["ophthalmolog"],

  // ── ENT ──
  "ear": ["e.n.t", "ent"],
  "ears": ["e.n.t", "ent"],
  "nose": ["e.n.t", "ent"],
  "throat": ["e.n.t", "ent"],
  "tonsil": ["e.n.t", "ent"],
  "hearing loss": ["e.n.t", "ent"],
  "sinus": ["e.n.t", "ent"],
  "sinusitis": ["e.n.t", "ent"],
  "runny nose": ["e.n.t", "ent"],
  "nasal": ["e.n.t", "ent"],
  "ent": ["e.n.t", "ent"],

  // ── Diabetes / Hormones / Thyroid ──
  "diabetes": ["diabetolog", "endocrinolog"],
  "sugar": ["diabetolog", "endocrinolog"],
  "blood sugar": ["diabetolog", "endocrinolog"],
  "thyroid": ["endocrinolog"],
  "hypothyroid": ["endocrinolog"],
  "hyperthyroid": ["endocrinolog"],
  "hormones": ["endocrinolog"],
  "obesity": ["endocrinolog"],
  "endocrinologist": ["endocrinolog"],

  // ── Kidneys / Urology ──
  "kidney": ["nephrolog", "urolog"],
  "kidney stone": ["urolog", "nephrolog"],
  "kidney failure": ["nephrolog"],
  "dialysis": ["nephrolog"],
  "urine": ["urolog"],
  "urinary": ["urolog"],
  "bladder": ["urolog"],
  "prostate": ["urolog"],
  "urologist": ["urolog"],
  "nephrologist": ["nephrolog"],

  // ── Children / Paediatrics ──
  "child": ["pediatric", "paediatric"],
  "children": ["pediatric", "paediatric"],
  "baby": ["pediatric", "paediatric", "neonatal"],
  "newborn": ["neonatal", "pediatric"],
  "infant": ["pediatric", "paediatric", "neonatal"],
  "paediatrician": ["pediatric", "paediatric"],
  "pediatrician": ["pediatric", "paediatric"],
  "fever child": ["pediatric", "paediatric"],

  // ── Cancer / Oncology ──
  "cancer": ["oncolog"],
  "tumor": ["oncolog"],
  "malignant": ["oncolog"],
  "chemotherapy": ["oncolog"],
  "oncologist": ["oncolog"],
  "blood cancer": ["oncolog", "hematolog"],
  "leukemia": ["oncolog", "hematolog"],
  "lymphoma": ["oncolog", "hematolog"],

  // ── Women's Health ──
  "gynecologist": ["gynecolog", "obstetric"],
  "gynecology": ["gynecolog", "obstetric"],
  "pregnancy": ["gynecolog", "obstetric"],
  "periods": ["gynecolog"],
  "menstruation": ["gynecolog"],
  "pcos": ["gynecolog", "endocrinolog"],
  "uterus": ["gynecolog"],
  "women": ["gynecolog"],

  // ── Mental Health ──
  "mental": ["psychiatr"],
  "anxiety": ["psychiatr"],
  "depression": ["psychiatr"],
  "stress": ["psychiatr"],
  "insomnia": ["psychiatr"],
  "sleep": ["psychiatr"],
  "panic attack": ["psychiatr"],
  "phobia": ["psychiatr"],
  "psychiatrist": ["psychiatr"],
  "psychologist": ["psycholog"],

  // ── Teeth / Dental ──
  "teeth": ["dentist", "dental"],
  "tooth": ["dentist", "dental"],
  "dental": ["dentist", "dental"],
  "gums": ["dentist", "dental"],
  "toothache": ["dentist", "dental"],
  "dentist": ["dentist", "dental"],
  "braces": ["dentist", "dental"],

  // ── Blood ──
  "blood": ["hematolog"],
  "anemia": ["hematolog", "general physician"],
  "thalassemia": ["hematolog"],
  "platelet": ["hematolog"],
  "hemoglobin": ["hematolog"],

  // ── General ──
  "fever": ["general physician", "pediatric"],
  "flu": ["general physician"],
  "cold": ["general physician"],
  "infection": ["general physician"],
  "weakness": ["general physician"],
  "fatigue": ["general physician"],
  "weight loss": ["general physician", "endocrinolog"],
  "checkup": ["general physician"],
  "general": ["general physician"],
};

// ── Specialty extraction ───────────────────────────────────────────────────

export function extractSpecialtyKeywords(message: string): string[] {
  const lower = message.toLowerCase();
  const matches = new Set<string>();

  for (const [kw, specialties] of Object.entries(SYMPTOM_SPECIALTY_MAP)) {
    if (lower.includes(kw)) {
      specialties.forEach(s => matches.add(s));
    }
  }

  const directSpecialties = [
    "cardiolog", "cardiac", "dermatolog", "orthopedic", "orthopaedic",
    "gastroenterolog", "pediatric", "paediatric", "ophthalmolog", "neurolog",
    "urolog", "nephrolog", "oncolog", "psychiatr", "gynecolog", "obstetric",
    "pulmonolog", "endocrinolog", "diabetolog", "hematolog", "e.n.t", "ent",
    "hepatolog", "dentist", "dental", "vascular", "plastic", "rheumatolog",
    "neonatal", "general physician", "general surgeon",
  ];
  for (const sp of directSpecialties) {
    if (lower.includes(sp)) matches.add(sp);
  }

  return Array.from(matches);
}

// ── Detect if this is a doctor/symptom query ──────────────────────────────

export function isDoctorOrSymptomQuery(message: string): boolean {
  const lower = message.toLowerCase();

  const doctorTerms = [
    "doctor", "hospital", "clinic", "specialist", "surgeon", "physician",
    "dr ", "dr.", "best doctor", "good doctor", "suggest doctor",
    "recommend doctor", "treatment", "where to go", "which hospital",
    "find doctor", "need doctor", "see a doctor", "consult",
    "appointment", "opd", "i need a", "can you suggest", "recommend",
  ];
  const hasDoctorTerm = doctorTerms.some(t => lower.includes(t));
  if (hasDoctorTerm) return true;

  const specialties = extractSpecialtyKeywords(message);
  if (specialties.length > 0) return true;

  return false;
}

// ── Legacy export for backward compat ─────────────────────────────────────
export const isLocalDoctorQuery = isDoctorOrSymptomQuery;

// ── City detection ────────────────────────────────────────────────────────

const CITY_ALIASES: Record<string, string[]> = {
  karachi: ["karachi"],
  lahore: ["lahore"],
  islamabad: ["islamabad"],
  rawalpindi: ["rawalpindi", "pindi"],
  faisalabad: ["faisalabad"],
  multan: ["multan"],
  peshawar: ["peshawar"],
  quetta: ["quetta"],
  hyderabad: ["hyderabad"],
  sialkot: ["sialkot"],
  abbottabad: ["abbottabad"],
};

export function detectCity(message: string): string | null {
  const lower = message.toLowerCase();
  for (const [city, aliases] of Object.entries(CITY_ALIASES)) {
    if (aliases.some(a => lower.includes(a))) return city;
  }
  return null;
}

// ── Filter doctors by specialty ───────────────────────────────────────────

function filterDoctorsBySpecialty(doctors: Doctor[], specialtyKeywords: string[]): Doctor[] {
  if (specialtyKeywords.length === 0) return doctors;
  return doctors.filter(d => {
    const sp = d.speciality.toLowerCase();
    return specialtyKeywords.some(kw => sp.includes(kw));
  });
}

// ── Hospital button info ──────────────────────────────────────────────────

export interface HospitalButton {
  key: string;
  label: string;
  fullName: string;
}

// ── Main search function ──────────────────────────────────────────────────

export interface HospitalSearchResult {
  doctors: Doctor[];
  source: string;
  sourceUrl: string;
  fetchedAt: string;
  error?: string;
  hospitalKey: string;
}

export async function searchDoctorsInCity(
  message: string,
  city: string | null
): Promise<HospitalSearchResult[]> {
  const results: HospitalSearchResult[] = [];
  const specialtyKeywords = extractSpecialtyKeywords(message);

  // If a city is given, filter to that city; otherwise search all hospitals
  const relevantHospitals = city
    ? Object.keys(HOSPITALS).filter(key => HOSPITALS[key].city === city.toLowerCase())
    : Object.keys(HOSPITALS);

  if (relevantHospitals.length === 0) return [];

  for (const key of relevantHospitals) {
    const hosp = HOSPITALS[key];
    try {
      const allDoctors = await getDoctorsFromHospital(key);
      const filtered = filterDoctorsBySpecialty(allDoctors, specialtyKeywords);

      results.push({
        doctors: filtered.slice(0, 12),
        source: hosp.name,
        sourceUrl: hosp.url,
        fetchedAt: new Date().toLocaleString("en-PK", { timeZone: "Asia/Karachi" }),
        hospitalKey: key,
      });
    } catch (err) {
      results.push({
        doctors: [],
        source: hosp.name,
        sourceUrl: hosp.url,
        fetchedAt: "",
        error: `Could not fetch data: ${(err as Error).message}`,
        hospitalKey: key,
      });
    }
  }

  return results;
}

// ── Get hospital buttons from search results ──────────────────────────────

export function getHospitalButtons(results: HospitalSearchResult[]): HospitalButton[] {
  return results.map(r => ({
    key: r.hospitalKey,
    label: HOSPITAL_SHORT_LABELS[r.hospitalKey] ?? r.source,
    fullName: r.source,
  }));
}

const HOSPITAL_SHORT_LABELS: Record<string, string> = {
  kmh: "KMH",
  saifee: "Saifee",
  lnh: "LNH",
  akuh: "AKUH",
};
