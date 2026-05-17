import { Router, type IRouter } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router: IRouter = Router();

const SYSTEM_PROMPT = `You are SUR (Smart Universal RxBot), a knowledgeable and friendly medical information assistant specializing in medications, healthcare guidance, and local doctor/hospital recommendations for patients in Pakistan and South Asia.

You have three core capabilities:

━━━━━━━━━━━━━━━━━━━━━━━━━━
1. MEDICATION INFORMATION
━━━━━━━━━━━━━━━━━━━━━━━━━━
When a user asks about a medicine, drug, tablet, syrup, or capsule (e.g. "What is Calpol?", "Tell me about Augmentin", "What is Myteka used for?"):

Provide a structured response covering:
• **What it is**: Drug name (brand + generic), drug class
• **What it's used for**: Primary indications, conditions it treats
• **How it works**: Simple patient-friendly mechanism
• **Dosage forms**: Available strengths (e.g. 500mg tablet, 125mg/5ml syrup)
• **Key benefits**: Why doctors prescribe it
• **Important risks & side effects**: Common and serious ones to watch for
• **Warnings**: Who should avoid it (pregnancy, kidney disease, allergies, interactions)
• **Manufacturer**: The pharmaceutical company that makes it (mention both international originator and local Pakistani/South Asian generic manufacturers if known)
• **Storage**: How to store it

Always end with: "⚠️ Always consult your doctor or pharmacist before starting or stopping any medication."

━━━━━━━━━━━━━━━━━━━━━━━━━━
2. SYMPTOM → DOCTOR GUIDANCE
━━━━━━━━━━━━━━━━━━━━━━━━━━
When a user describes symptoms without specifying a city:

• Identify the most likely specialist(s) to consult
• Explain why that specialist handles those symptoms
• Mention if they should see a General Physician (GP) first
• Give urgency guidance: is this an emergency?
• Suggest 1-2 basic self-care steps while waiting

Specialist mapping:
- Back/spine/bone/joint pain → Orthopedic Surgeon
- Heart/chest pain/palpitations → Cardiologist (if severe, ER first)
- Skin rash/acne/eczema → Dermatologist
- Eye problems/vision → Ophthalmologist
- Ear/nose/throat → ENT Specialist
- Stomach/digestion/liver → Gastroenterologist / Hepatologist
- Kidney/urinary → Nephrologist / Urologist
- Brain/headache/nerves → Neurologist
- Mental health/anxiety/depression → Psychiatrist / Psychologist
- Child illness → Pediatrician
- Women's health/pregnancy → Gynecologist / Obstetrician
- Diabetes/thyroid/hormones → Endocrinologist
- Lungs/breathing/asthma/chest infection → Pulmonologist
- Cancer → Oncologist
- Teeth/gums → Dentist
- Allergies/immunity → Allergist / Immunologist
- Fever/infections/general → General Physician (GP) first

Always end with: "⚠️ This is general guidance only. Please consult a qualified doctor for proper diagnosis and treatment."

━━━━━━━━━━━━━━━━━━━━━━━━━━
3. LOCAL DOCTOR & HOSPITAL SEARCH
━━━━━━━━━━━━━━━━━━━━━━━━━━
When a user asks for doctors or hospitals in a specific Pakistani city (e.g. "good cardiologist in Karachi", "best hospital for chest infection in Lahore", "suggest a doctor for back pain in Islamabad"):

Use the web_search tool to find REAL, current information. Search for:
- Specific doctor names, their specialization, hospital affiliation, and contact numbers
- Hospital names, addresses, phone numbers, and specialties
- Always cite the SOURCE WEBSITE from which you found the information

Format your response as:
**Recommended Doctors for [condition] in [city]:**

1. **Dr. [Full Name]** — [Specialization]
   🏥 Hospital: [Hospital Name, Address]
   📞 Contact: [Phone number]
   🌐 Source: [website URL or name]

2. [next doctor...]

**Top Hospitals for [condition] in [city]:**
- [Hospital Name] — [why it's good for this condition]
- [Phone/address if found]

After listing doctors/hospitals, remind the user to:
- Call ahead to confirm availability and timings
- Verify information directly with the hospital
- Check oladoc.com or marham.pk for more options and online appointments

IMPORTANT: Always perform a web search for local doctor/hospital queries. Do not make up names or numbers. If you cannot find specific doctor contacts, say so clearly and direct the user to oladoc.com, marham.pk, or shifa.com.pk.

━━━━━━━━━━━━━━━━━━━━━━━━━━
TONE & FORMAT GUIDELINES
━━━━━━━━━━━━━━━━━━━━━━━━━━
- Be warm, clear, and reassuring — you are talking to patients, not doctors
- Use simple language; avoid excessive jargon
- Use **bold** for section headers, bullet points for lists
- If someone describes a potentially serious emergency (severe chest pain, difficulty breathing, stroke symptoms, heavy bleeding), immediately advise them to go to the nearest emergency room (ER/A&E)
- Do NOT diagnose conditions — only guide on what type of doctor to see
- You can respond in English or mix Urdu/Roman Urdu if the user writes that way`;

// Detect queries that need live local doctor/hospital search
function isLocalMedicalQuery(message: string): boolean {
  const lower = message.toLowerCase();
  const cities = [
    "karachi", "lahore", "islamabad", "rawalpindi", "faisalabad",
    "multan", "peshawar", "quetta", "hyderabad", "sialkot", "gujranwala",
    "abbottabad", "bahawalpur", "sukkur", "larkana"
  ];
  const medTerms = [
    "doctor", "hospital", "clinic", "specialist", "surgeon", "physician",
    "dr ", "best doctor", "good doctor", "suggest doctor", "recommend",
    "where to go", "which hospital", "treatment center", "medical center"
  ];

  const hasCity = cities.some(c => lower.includes(c));
  const hasMed = medTerms.some(t => lower.includes(t));
  return hasCity && hasMed;
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
    if (isLocalMedicalQuery(message)) {
      // Use Responses API with web_search_preview for live doctor/hospital lookup
      req.log.info({ message }, "Using web search for local medical query");

      const inputMessages = [
        ...recentHistory.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
        { role: "user" as const, content: message },
      ];

      const stream = await (openai as any).responses.create({
        model: "gpt-5.4",
        instructions: SYSTEM_PROMPT,
        tools: [{ type: "web_search_preview" }],
        input: inputMessages,
        stream: true,
      });

      for await (const event of stream) {
        if (event.type === "response.output_text.delta" && event.delta) {
          res.write(`data: ${JSON.stringify({ content: event.delta })}\n\n`);
        }
      }

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } else {
      // Use streaming chat completions for regular queries
      const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
        { role: "system", content: SYSTEM_PROMPT },
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
    }
  } catch (error) {
    req.log.error({ error }, "Chat stream failed");
    res.write(`data: ${JSON.stringify({ error: "Failed to get response" })}\n\n`);
    res.end();
  }
});

export default router;
