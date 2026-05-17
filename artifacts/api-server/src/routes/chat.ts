import { Router, type IRouter } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { isLocalDoctorQuery, detectCity, searchDoctorsInCity, type HospitalSearchResult } from "./hospital-scraper.js";

const router: IRouter = Router();

const SYSTEM_PROMPT = `You are SUR (Smart Universal RxBot), a knowledgeable and friendly medical information assistant specializing in medications, healthcare guidance, and local doctor/hospital recommendations for patients in Pakistan and South Asia.

You have three core capabilities:

━━━━━━━━━━━━━━━━━━━━━━━━━━
1. MEDICATION INFORMATION
━━━━━━━━━━━━━━━━━━━━━━━━━━
When asked about a medicine, drug, tablet, syrup, or capsule:

Provide:
• **What it is**: Drug name (brand + generic), drug class
• **What it's used for**: Primary indications
• **How it works**: Simple patient-friendly explanation
• **Dosage forms**: Available strengths
• **Key benefits**
• **Important risks & side effects**
• **Warnings**: Who should avoid it
• **Manufacturer**: International originator + Pakistani generics if known
• **Storage**

Always end with: "⚠️ Always consult your doctor or pharmacist before starting or stopping any medication."

━━━━━━━━━━━━━━━━━━━━━━━━━━
2. SYMPTOM → DOCTOR GUIDANCE
━━━━━━━━━━━━━━━━━━━━━━━━━━
When a user describes symptoms:
• Identify the most likely specialist(s)
• Explain why that specialist handles those symptoms
• Give urgency guidance — is this an emergency?
• Suggest 1-2 basic self-care steps while waiting

For emergencies (severe chest pain, difficulty breathing, stroke, heavy bleeding): advise going to the nearest ER immediately.

Always end with: "⚠️ This is general guidance only. Please consult a qualified doctor for proper diagnosis and treatment."

━━━━━━━━━━━━━━━━━━━━━━━━━━
3. LOCAL DOCTOR & HOSPITAL SEARCH
━━━━━━━━━━━━━━━━━━━━━━━━━━
When provided with LIVE HOSPITAL DATA in the context below, present it in this format:

**Doctors found for [condition] at [Hospital Name], [City]:**
*(Source: [URL] — fetched [date])*

1. **[Doctor Name]** — [Speciality]
   🗓 OPD Days: [opd days]
   ⏰ Timing: [timing]
   🏥 Hospital: [Hospital Name]
   📍 Address: [address]
   📞 Contact: [phone]

[Repeat for each doctor]

After the list, add:
> 💡 *Call the hospital to confirm availability and book an appointment. For more options, visit oladoc.com or marham.pk*

If no matching doctors were found in the live data, say clearly: "No matching doctors were found in our live data for this specialty at [hospital]. Please call [hospital phone] or check [url] for the full list."

IMPORTANT: Only present doctors from the LIVE DATA provided to you. Do not make up or guess any names, numbers, or details.

━━━━━━━━━━━━━━━━━━━━━━━━━━
TONE & FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━
- Warm, clear, and reassuring — talking to patients, not doctors
- Use simple language; avoid jargon
- Use **bold** for headers, bullet points for lists
- You can respond in English or Roman Urdu if the user writes that way`;

function buildDoctorContext(results: HospitalSearchResult[], city: string): string {
  if (results.length === 0) {
    return `[LIVE DATA: No hospital data is currently available for ${city}. Direct the user to oladoc.com or marham.pk for finding doctors in ${city}, and remind them to call hospitals directly.]`;
  }

  let context = `[LIVE HOSPITAL DATA — fetched directly from hospital websites]\n\n`;

  for (const result of results) {
    if (result.error) {
      context += `⚠️ ${result.source}: Could not fetch data (${result.error}). URL: ${result.sourceUrl}\n\n`;
      continue;
    }

    context += `HOSPITAL: ${result.source}\n`;
    context += `SOURCE URL: ${result.sourceUrl}\n`;
    context += `FETCHED AT: ${result.fetchedAt} (Pakistan Time)\n`;
    context += `CITY: ${city}\n`;

    if (result.doctors.length === 0) {
      context += `DOCTORS FOUND: None matching the requested specialty.\n`;
    } else {
      context += `DOCTORS FOUND (${result.doctors.length}):\n`;
      result.doctors.forEach((d, i) => {
        context += `${i + 1}. Name: ${d.name}\n`;
        context += `   Specialty: ${d.speciality}\n`;
        context += `   OPD Days: ${d.opd}\n`;
        context += `   Timing: ${d.timing}\n`;
        context += `   Hospital Phone: ${d.hospitalPhone}\n`;
        context += `   Hospital Address: ${d.hospitalAddress}\n`;
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

    // If the user is asking about doctors/hospitals in a city, fetch live data
    if (isLocalDoctorQuery(message)) {
      const city = detectCity(message);
      if (city) {
        req.log.info({ message, city }, "Fetching live hospital data for local doctor query");

        try {
          const results = await searchDoctorsInCity(message, city);
          const doctorContext = buildDoctorContext(results, city);
          systemPrompt = `${SYSTEM_PROMPT}\n\n${doctorContext}`;
          req.log.info({ city, resultCount: results.length }, "Live hospital data fetched successfully");
        } catch (fetchErr) {
          req.log.warn({ fetchErr }, "Failed to fetch live hospital data, proceeding without it");
          systemPrompt = `${SYSTEM_PROMPT}\n\n[LIVE DATA: Failed to fetch hospital data. Advise the user to visit kmh.org.pk/doctors/ for Karachi, or check oladoc.com and marham.pk. Do not make up any doctor names or numbers.]`;
        }
      }
    }

    // Stream response using chat completions
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
