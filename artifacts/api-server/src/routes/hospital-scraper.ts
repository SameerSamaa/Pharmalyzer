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

const HOSPITALS: Record<string, { name: string; phone: string; address: string; url: string; city: string; fetchFn: () => Promise<Doctor[]> }> = {
  kmh: {
    name: "Kutiyana Memon Hospital (KMH)",
    phone: "021-111-564-111",
    address: "45-47 New M.A. Jinnah Road, Karachi",
    url: "https://kmh.org.pk/doctors/",
    city: "karachi",
    fetchFn: fetchKMHDoctors,
  },
};

async function fetchKMHDoctors(): Promise<Doctor[]> {
  const res = await fetch("https://kmh.org.pk/doctors/", {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) throw new Error(`KMH fetch failed: ${res.status}`);
  const html = await res.text();

  // Extract the JavaScript doctors array embedded in the page
  const match = html.match(/const doctors\s*=\s*(\[[\s\S]*?\]);/);
  if (!match) throw new Error("KMH: doctors array not found in page");

  const rawJs = match[1];
  const doctors: Doctor[] = [];

  // Parse each { name: "...", speciality: "...", opd: "...", timing: "..." } block
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

// Map user query keywords → speciality substrings to match
const SPECIALTY_KEYWORDS: Record<string, string[]> = {
  "chest": ["chest", "pulmonolog", "respirator", "lung"],
  "chest infection": ["chest", "pulmonolog"],
  "heart": ["cardiolog", "cardiac"],
  "cardiac": ["cardiolog", "cardiac"],
  "cardiology": ["cardiolog", "cardiac"],
  "skin": ["dermatolog", "skin"],
  "rash": ["dermatolog", "skin"],
  "eczema": ["dermatolog"],
  "bone": ["orthopedic", "orthopaedic"],
  "back pain": ["orthopedic", "orthopaedic"],
  "joint": ["orthopedic", "orthopaedic"],
  "fracture": ["orthopedic", "orthopaedic"],
  "stomach": ["gastroenterolog"],
  "digestion": ["gastroenterolog"],
  "liver": ["gastroenterolog", "hepatolog"],
  "gut": ["gastroenterolog"],
  "child": ["pediatric"],
  "children": ["pediatric"],
  "baby": ["pediatric", "neonatal"],
  "newborn": ["neonatal"],
  "eye": ["ophthalmolog"],
  "vision": ["ophthalmolog"],
  "ear": ["e.n.t", "ent"],
  "nose": ["e.n.t", "ent"],
  "throat": ["e.n.t", "ent"],
  "ent": ["e.n.t", "ent"],
  "brain": ["neurolog"],
  "headache": ["neurolog"],
  "migraine": ["neurolog"],
  "nerves": ["neurolog"],
  "diabetes": ["diabetolog", "endocrinolog"],
  "sugar": ["diabetolog", "endocrinolog"],
  "thyroid": ["endocrinolog"],
  "teeth": ["dentist", "dental"],
  "dental": ["dentist", "dental"],
  "urine": ["urolog"],
  "kidney": ["urolog", "nephrolog"],
  "bladder": ["urolog"],
  "cancer": ["oncolog"],
  "tumor": ["oncolog"],
  "blood vessel": ["vascular"],
  "plastic": ["plastic"],
  "mental": ["psychiatr", "psycholog"],
  "anxiety": ["psychiatr"],
  "depression": ["psychiatr"],
  "gynecolog": ["gynecolog", "obstetric"],
  "pregnancy": ["gynecolog", "obstetric"],
  "women": ["gynecolog"],
  "general": ["general physician"],
  "fever": ["general physician", "pediatric"],
  "infection": ["general physician", "chest"],
};

function extractSpecialtyKeywords(message: string): string[] {
  const lower = message.toLowerCase();
  const matches = new Set<string>();

  for (const [kw, specialties] of Object.entries(SPECIALTY_KEYWORDS)) {
    if (lower.includes(kw)) {
      specialties.forEach(s => matches.add(s));
    }
  }

  // Also check if user directly mentions a specialty
  const directSpecialties = [
    "cardiolog", "dermatolog", "orthopedic", "gastroenterolog",
    "pediatric", "ophthalmolog", "neurolog", "urolog", "oncolog",
    "psychiatr", "gynecolog", "pulmonolog", "dentist",
  ];
  for (const sp of directSpecialties) {
    if (lower.includes(sp)) matches.add(sp);
  }

  return Array.from(matches);
}

function filterDoctorsBySpecialty(doctors: Doctor[], specialtyKeywords: string[]): Doctor[] {
  if (specialtyKeywords.length === 0) return doctors;

  return doctors.filter(d => {
    const sp = d.speciality.toLowerCase();
    return specialtyKeywords.some(kw => sp.includes(kw));
  });
}

export interface HospitalSearchResult {
  doctors: Doctor[];
  source: string;
  sourceUrl: string;
  fetchedAt: string;
  error?: string;
}

export async function searchDoctorsInCity(
  message: string,
  city: string
): Promise<HospitalSearchResult[]> {
  const results: HospitalSearchResult[] = [];
  const specialtyKeywords = extractSpecialtyKeywords(message);

  // Find hospitals in the requested city
  const cityLower = city.toLowerCase();
  const relevantHospitals = Object.keys(HOSPITALS).filter(
    key => HOSPITALS[key].city === cityLower
  );

  if (relevantHospitals.length === 0) {
    return [];
  }

  for (const key of relevantHospitals) {
    const hosp = HOSPITALS[key];
    try {
      const allDoctors = await getDoctorsFromHospital(key);
      const filtered = filterDoctorsBySpecialty(allDoctors, specialtyKeywords);

      results.push({
        doctors: filtered.slice(0, 10), // Cap at 10 per hospital
        source: hosp.name,
        sourceUrl: hosp.url,
        fetchedAt: new Date().toLocaleString("en-PK", { timeZone: "Asia/Karachi" }),
      });
    } catch (err) {
      results.push({
        doctors: [],
        source: hosp.name,
        sourceUrl: hosp.url,
        fetchedAt: "",
        error: `Could not fetch data: ${(err as Error).message}`,
      });
    }
  }

  return results;
}

export function detectCity(message: string): string | null {
  const cities: Record<string, string[]> = {
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

  const lower = message.toLowerCase();
  for (const [city, aliases] of Object.entries(cities)) {
    if (aliases.some(a => lower.includes(a))) return city;
  }
  return null;
}

export function isLocalDoctorQuery(message: string): boolean {
  const lower = message.toLowerCase();
  const medTerms = [
    "doctor", "hospital", "clinic", "specialist", "surgeon", "physician",
    "dr ", "best doctor", "good doctor", "suggest doctor", "recommend doctor",
    "treatment", "where to go", "which hospital",
  ];
  const city = detectCity(message);
  const hasMed = medTerms.some(t => lower.includes(t));
  return !!(city && hasMed);
}
