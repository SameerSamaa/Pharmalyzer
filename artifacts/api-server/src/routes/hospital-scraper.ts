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

const COMMON_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

// ── KMH scraper ────────────────────────────────────────────────────────────

async function fetchKMHDoctors(): Promise<Doctor[]> {
  const res = await fetch("https://kmh.org.pk/doctors/", {
    headers: COMMON_HEADERS,
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
// BUG FIX: WordPress encodes & as &#038; in href attributes.
// We normalize HTML entities before parsing so the URL pattern is found correctly.

async function fetchSaifeeDoctors(): Promise<Doctor[]> {
  const res = await fetch("https://saifeehospital.com.pk/doctors/", {
    headers: COMMON_HEADERS,
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) throw new Error(`Saifee fetch failed: ${res.status}`);
  const rawHtml = await res.text();

  // Normalize HTML entities so URL ampersands parse correctly
  // WordPress encodes & as &#038; inside href attributes
  const html = rawHtml.replace(/&#038;/g, "&").replace(/&amp;/g, "&");

  const doctors: Doctor[] = [];
  const seen = new Set<string>();

  // Pattern: book-an-appointment?speciality=SPECIALITY&doctor=Dr.+Name
  // Both speciality and doctor name are URL-encoded with + for spaces
  const urlRegex = /book-an-appointment\?speciality=([^&"#\s]+)&doctor=([^"&\s]+)/g;

  let m: RegExpExecArray | null;
  while ((m = urlRegex.exec(html)) !== null) {
    const speciality = decodeURIComponent(m[1].replace(/\+/g, " ")).trim();
    const name = decodeURIComponent(m[2].replace(/\+/g, " ")).trim();
    if (!name || !speciality || seen.has(name)) continue;
    seen.add(name);

    doctors.push({
      name,
      speciality: speciality
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

  return doctors;
}

// ── LNH scraper ────────────────────────────────────────────────────────────
// LNH only renders 12 doctors per page initial load, but supports per-specialty
// filtering via ?spe={uuid}. We fetch ALL specialties in parallel and combine.
// This is cached for 6 hours so the cost is paid once.

const LNH_SPECIALTY_UUIDS: { name: string; uuid: string }[] = [
  { name: "Accident & Emergency",               uuid: "85985c2e-ded8-49ab-8052-bee2cfd07db0" },
  { name: "Anaesthesiology",                    uuid: "7da52c73-ba32-4441-98b3-dc96f8938b58" },
  { name: "Breast Surgery",                     uuid: "9acfc35f-1eea-4f0d-bc30-b1dc2fe70625" },
  { name: "Cardiac Surgery",                    uuid: "48d84bb9-dfcb-4b1a-a8f6-485434c12aae" },
  { name: "Cardiology",                         uuid: "48bcf1cb-e521-489a-9828-89acae7d23f5" },
  { name: "Chest Medicine",                     uuid: "7132a8d8-a8fd-48f6-acf1-c5b8a00f9dca" },
  { name: "Clinical Biochemistry",              uuid: "61d491b7-01b3-4bc2-8793-7167716a9ed3" },
  { name: "Dental and Maxillofacial Surgery",   uuid: "470124db-13e7-4cdf-9a72-f387120a691b" },
  { name: "Dermatology",                        uuid: "d949c730-3dfe-47b3-8964-cd9c8833f3b3" },
  { name: "Diabetes, Endocrinology & Metabolism", uuid: "d6e197a4-eeb3-4c9a-aac1-462f03b550f4" },
  { name: "E.N.T - Head and Neck Surgery",      uuid: "ecae73ea-b91a-4c20-8c56-d68388595fb3" },
  { name: "Family Medicine",                    uuid: "520788ca-3cc6-49ab-a233-47c04716b9d2" },
  { name: "Gastroenterology",                   uuid: "a119b08f-ff99-4600-9a0c-24d29d59a432" },
  { name: "General Surgery",                    uuid: "0e0bd9d8-d3e5-400a-81b9-9e07bde02edf" },
  { name: "Haematology & Bloodbank",            uuid: "71d491b7-01b3-4bc2-8793-7197716a9ed3" },
  { name: "Histopathology and Cytology",        uuid: "51d491b7-01b3-4bc2-8793-7197716a9ed1" },
  { name: "Internal Medicine",                  uuid: "b8530778-810a-42e3-9d91-fb0ae463c30e" },
  { name: "Mental Health",                      uuid: "63e6f67d-617a-4649-9304-2b0de78670ab" },
  { name: "Microbiology",                       uuid: "ad019ed5-ac35-43fa-b4bb-2a13f94ade41" },
  { name: "Molecular Pathology",                uuid: "c1fbcdd6-c625-498e-8fd7-dc1dce7e47f8" },
  { name: "Nephrology",                         uuid: "44225de1-87fd-43f4-b5e1-e174d5f808d1" },
  { name: "Neurology",                          uuid: "207825fb-4313-43ca-9398-398ed6fbb0cf" },
  { name: "Obstetrics and Gynaecology",         uuid: "6a463011-ba8e-47db-9536-f03e8cd26c93" },
  { name: "Occupational Therapy",               uuid: "cc8aeb21-8a62-4624-8d66-d97a28dfc719" },
  { name: "Oncology",                           uuid: "6ea35170-e61c-49c9-b041-200d0c4bdccb" },
  { name: "Ophthalmology",                      uuid: "9878db75-d956-4724-a213-e1b12673a510" },
  { name: "Orthopaedic Surgery",                uuid: "850e0c72-4519-4d76-8b69-afd48e4bebf4" },
  { name: "Paediatric Cardiology",              uuid: "244a847e-d31c-4edb-a2a0-5f9b475be64c" },
  { name: "Paediatric Surgery",                 uuid: "837cdba4-bf74-4a77-aa22-f7157c1c2cf9" },
  { name: "Paeds Medicine",                     uuid: "7e729d7a-31bb-4fe0-9637-7e211768e0c4" },
  { name: "Plastic and Reconstructive Surgery", uuid: "68037211-873c-4e34-a021-09fc72eb8581" },
  { name: "Radiology & Imaging",                uuid: "86960002-3d98-4705-b03a-923571dfb63d" },
  { name: "Rheumatology",                       uuid: "78b94340-0c5e-4b7f-b5c1-0664fbd1a1bc" },
  { name: "Speech Therapy",                     uuid: "5dab48b5-d0a7-403f-9202-4ebe8d330ec6" },
  { name: "Spinal and Neurosurgery",            uuid: "86629d6d-6b37-4352-ae56-859d295123ac" },
  { name: "Thoracic Surgery",                   uuid: "9ddda56a-11fe-4bf1-8eff-71a17b7074a3" },
  { name: "Urology",                            uuid: "40d3b353-a78f-419b-8767-ba3a2f643015" },
  { name: "Vascular Surgery",                   uuid: "be5170ad-7426-440f-9d6d-0663f124c22d" },
];

// Individual specialty-page cache so we avoid re-fetching pages already loaded
const lnhSpecialtyCache = new Map<string, { doctors: Doctor[]; fetchedAt: number }>();

async function fetchLNHSpecialtyPage(uuid: string, specialtyName: string): Promise<Doctor[]> {
  const cached = lnhSpecialtyCache.get(uuid);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.doctors;
  }

  const res = await fetch(`https://www.lnh.edu.pk/doctors?spe=${uuid}`, {
    headers: COMMON_HEADERS,
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) return [];
  const html = await res.text();

  const doctors: Doctor[] = [];

  // Doctor name: <h5 class="name mb-0 mt-0 text-theme-colored">Dr. Name</h5>
  const nameRegex = /<h5 class="name mb-0 mt-0 text-theme-colored">([\s\S]*?)<\/h5>/g;
  let m: RegExpExecArray | null;
  while ((m = nameRegex.exec(html)) !== null) {
    const name = m[1].replace(/\s+/g, " ").trim();
    if (!name) continue;
    doctors.push({
      name,
      speciality: specialtyName,
      opd: "Mon–Sat",
      timing: "Contact LNH for OPD timings",
      hospital: HOSPITALS.lnh.name,
      hospitalPhone: HOSPITALS.lnh.phone,
      hospitalAddress: HOSPITALS.lnh.address,
      hospitalUrl: HOSPITALS.lnh.url,
      city: HOSPITALS.lnh.city,
    });
  }

  lnhSpecialtyCache.set(uuid, { doctors, fetchedAt: Date.now() });
  return doctors;
}

async function fetchLNHDoctors(): Promise<Doctor[]> {
  // Fetch ALL specialty pages in parallel — each page is individually cached.
  // First call takes ~3-5s; subsequent calls within 6h are instant from cache.
  const results = await Promise.allSettled(
    LNH_SPECIALTY_UUIDS.map(({ name, uuid }) => fetchLNHSpecialtyPage(uuid, name))
  );

  const allDoctors: Doctor[] = [];
  const seen = new Set<string>();

  for (const result of results) {
    if (result.status === "fulfilled") {
      for (const doc of result.value) {
        if (!seen.has(doc.name)) {
          seen.add(doc.name);
          allDoctors.push(doc);
        }
      }
    }
  }

  return allDoctors;
}

// ── AKUH scraper ───────────────────────────────────────────────────────────
// AKUH is a SharePoint site that server-renders only 12 doctors per page load.
// The remaining doctors require ASP.NET ViewState postback (not feasible to scrape).
// We extract what's available from the initial page HTML.

async function fetchAKUHDoctors(): Promise<Doctor[]> {
  const res = await fetch("https://hospitals.aku.edu/pakistan/patientservices/Pages/findadoctor.aspx", {
    headers: COMMON_HEADERS,
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
  const specialtyKeywords = extractSpecialtyKeywords(message);

  const relevantHospitals = city
    ? Object.keys(HOSPITALS).filter(key => HOSPITALS[key].city === city.toLowerCase())
    : Object.keys(HOSPITALS);

  if (relevantHospitals.length === 0) return [];

  // Fetch all hospitals in parallel to minimise total latency
  const fetchResults = await Promise.allSettled(
    relevantHospitals.map(key => getDoctorsFromHospital(key))
  );

  return relevantHospitals.map((key, idx) => {
    const hosp = HOSPITALS[key];
    const result = fetchResults[idx];

    if (result.status === "rejected") {
      return {
        doctors: [],
        source: hosp.name,
        sourceUrl: hosp.url,
        fetchedAt: "",
        error: `Could not fetch data: ${(result.reason as Error).message}`,
        hospitalKey: key,
      };
    }

    const allDoctors = result.value;
    const filtered = filterDoctorsBySpecialty(allDoctors, specialtyKeywords);

    return {
      doctors: filtered.slice(0, 50),
      source: hosp.name,
      sourceUrl: hosp.url,
      fetchedAt: new Date().toLocaleString("en-PK", { timeZone: "Asia/Karachi" }),
      hospitalKey: key,
    };
  });
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
