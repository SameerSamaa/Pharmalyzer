import { Router, type IRouter } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import {
  isDoctorOrSymptomQuery,
  detectCity,
  searchDoctorsInCity,
  extractSpecialtyKeywords,
  type HospitalSearchResult,
} from "./hospital-scraper.js";

const router: IRouter = Router();

const SYSTEM_PROMPT = `You are SUR (Smart Universal RxBot), a warm, knowledgeable medical information assistant for patients in Pakistan and South Asia.

You have four core capabilities:

━━━━━━━━━━━━━━━━━━━━━━━━━━
1. SYMPTOM → SPECIALIST MAPPING
━━━━━━━━━━━━━━━━━━━━━━━━━━
When a user describes ANY symptom or health problem:

Step 1 — Identify the right specialist:
• Heart pain / palpitations / high BP → **Cardiologist**
• Chest tightness / breathlessness / cough → **Pulmonologist / Chest Specialist**
• Headache / migraine / dizziness / seizures → **Neurologist**
• Bone / joint / back / knee pain / fracture → **Orthopedic Surgeon**
• Stomach / liver / acidity / diarrhea / jaundice → **Gastroenterologist**
• Skin / rash / hair loss / acne → **Dermatologist**
• Eye / vision problems → **Ophthalmologist**
• Ear / nose / throat / sinus / tonsil → **ENT Specialist**
• Diabetes / thyroid / hormonal issues → **Endocrinologist / Diabetologist**
• Kidney / urinary / prostate → **Urologist / Nephrologist**
• Child / baby health → **Paediatrician**
• Cancer / tumour → **Oncologist**
• Women's health / pregnancy → **Gynaecologist & Obstetrician**
• Mental health / anxiety / depression / sleep → **Psychiatrist**
• Teeth / gum / toothache → **Dentist**
• Blood disorders / anaemia → **Haematologist**
• General fever / flu / weakness → **General Physician**

Step 2 — Give brief reassurance + urgency guidance
Step 3 — If LIVE DOCTOR DATA is provided below, show the doctors
Step 4 — If no live data, guide them to the resources at the end

For EMERGENCIES (severe chest pain, stroke signs, heavy bleeding, difficulty breathing): tell them to go to ER IMMEDIATELY.

━━━━━━━━━━━━━━━━━━━━━━━━━━
2. LOCAL DOCTOR SEARCH (when LIVE DATA is provided)
━━━━━━━━━━━━━━━━━━━━━━━━━━
When LIVE HOSPITAL DATA is injected below, ALWAYS present it like this:

---
🏥 **Doctors found for [condition] — [Hospital Name], [City]**
*(Live data fetched: [date])*

**1. Dr. [Name]**
   🩺 Speciality: [Speciality]
   🗓 OPD Days: [days]
   ⏰ Timing: [timing]
   📞 Hospital: [phone]
   📍 Address: [address]

**2. Dr. [Name]** ...
---

After the list, ALWAYS add:
> 💡 *Call ahead to confirm availability and book an appointment. For more options across Pakistan visit **oladoc.com** or **marham.pk***

If no matching doctors found in live data, say:
"No doctors found in our live data for this speciality. Please call [hospital phone] or visit [url]."

IMPORTANT: Only present doctors from the LIVE DATA provided. Never invent names, timings or numbers.

━━━━━━━━━━━━━━━━━━━━━━━━━━
3. MEDICATION INFORMATION
━━━━━━━━━━━━━━━━━━━━━━━━━━
When asked about any medicine, drug, tablet, syrup, or capsule:
• Drug name (brand + generic) and drug class
• What it treats (patient-friendly)
• How it works (simple explanation)
• Dosage forms and strengths
• Key side effects the patient will notice
• Important warnings (pregnancy, interactions, etc.)
• Storage advice

Always end with: "⚠️ Always consult your doctor or pharmacist before starting or stopping any medication."

━━━━━━━━━━━━━━━━━━━━━━━━━━
4. GENERAL HEALTH GUIDANCE
━━━━━━━━━━━━━━━━━━━━━━━━━━
• Answer general health questions in simple, reassuring language
• For self-care while waiting for an appointment: give 1-2 practical tips
• You can respond in English or Roman Urdu if the user writes that way

━━━━━━━━━━━━━━━━━━━━━━━━━━
RESOURCES (mention when relevant)
━━━━━━━━━━━━━━━━━━━━━━━━━━
• **oladoc.com** — Find doctors by city, speciality, and availability
• **marham.pk** — Pakistan's largest doctor-finding platform
• **kmh.org.pk** — Kutiyana Memon Hospital, Karachi (021-111-564-111)
• **hospitals.aku.edu** — Aga Khan University Hospital, Karachi (021-111-911-911)

━━━━━━━━━━━━━━━━━━━━━━━━━━
TONE
━━━━━━━━━━━━━━━━━━━━━━━━━━
Warm, clear, and reassuring — you're talking to worried patients, not doctors.
Use **bold** for names and headers. Keep lists scannable. Avoid jargon.`;

function buildDoctorContext(
  results: HospitalSearchResult[],
  city: string | null,
  specialties: string[]
): string {
  const cityLabel = city
    ? city.charAt(0).toUpperCase() + city.slice(1)
    : "Pakistan (all available hospitals)";

  const specialtyLabel =
    specialties.length > 0
      ? specialties.slice(0, 3).join(", ")
      : "requested specialty";

  if (results.length === 0) {
    return `[LIVE DATA: No hospital data currently available for ${cityLabel}. Direct the user to oladoc.com or marham.pk for finding doctors, and remind them to call hospitals directly.]`;
  }

  let context = `[LIVE HOSPITAL DATA — fetched directly from hospital websites]\n`;
  context += `Specialty searched: ${specialtyLabel}\n`;
  context += `Location: ${cityLabel}\n\n`;

  for (const result of results) {
    if (result.error) {
      context += `⚠️ ${result.source} (${result.sourceUrl}): Could not fetch live data — ${result.error}\n`;
      context += `   → Still mention this hospital with its contact details so the user can call.\n\n`;
      continue;
    }

    context += `HOSPITAL: ${result.source}\n`;
    context += `SOURCE URL: ${result.sourceUrl}\n`;
    context += `FETCHED AT: ${result.fetchedAt} (Pakistan Time)\n`;

    if (result.doctors.length === 0) {
      context += `DOCTORS FOUND: 0 matching "${specialtyLabel}" in the live data.\n`;
      context += `→ Tell the user no matching doctors were found and direct them to call the hospital or visit the website.\n`;
    } else {
      context += `DOCTORS FOUND (${result.doctors.length}):\n`;
      result.doctors.forEach((d, i) => {
        context += `\n  ${i + 1}. Name: ${d.name}\n`;
        context += `     Speciality: ${d.speciality}\n`;
        context += `     OPD Days: ${d.opd || "Contact hospital"}\n`;
        context += `     Timing: ${d.timing || "Contact hospital"}\n`;
        context += `     Hospital: ${d.hospital}\n`;
        context += `     Phone: ${d.hospitalPhone}\n`;
        context += `     Address: ${d.hospitalAddress}\n`;
      });
    }
    context += `\n`;
  }

  return context;
}

router.post("/chat/message", async (req, res): Promise<void> => {
  const { message, history } = req.body as {
    message: string;
    history: Array<{ role: "user" | "assistant"; content: string }>;
  };

  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "message is required" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const recentHistory = Array.isArray(history) ? history.slice(-10) : [];

  try {
    let systemPrompt = SYSTEM_PROMPT;

    // Trigger doctor search on symptoms OR explicit doctor request — city is optional
    if (isDoctorOrSymptomQuery(message)) {
      const city = detectCity(message); // may be null
      const specialties = extractSpecialtyKeywords(message);

      req.log.info({ message, city, specialties }, "Doctor/symptom query — fetching hospital data");

      try {
        const results = await searchDoctorsInCity(message, city);
        const doctorContext = buildDoctorContext(results, city, specialties);
        systemPrompt = `${SYSTEM_PROMPT}\n\n${doctorContext}`;
        req.log.info(
          { city: city ?? "all", hospitalCount: results.length, specialties },
          "Hospital data fetched successfully"
        );
      } catch (fetchErr) {
        req.log.warn({ fetchErr }, "Failed to fetch hospital data, proceeding without it");
        systemPrompt =
          `${SYSTEM_PROMPT}\n\n` +
          `[LIVE DATA: Could not fetch hospital data at this time. ` +
          `Recommend the user visits oladoc.com or marham.pk to find doctors, ` +
          `or call KMH Karachi: 021-111-564-111 / AKUH Karachi: 021-111-911-911. ` +
          `Do not invent any doctor names or numbers.]`;
      }
    }

    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: systemPrompt },
      ...recentHistory,
      { role: "user", content: message },
    ];

    const stream = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 8192,
      messages,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (error) {
    req.log.error({ error }, "Chat stream failed");
    res.write(`data: ${JSON.stringify({ error: "Failed to get response. Please try again." })}\n\n`);
    res.end();
  }
});

export default router;
