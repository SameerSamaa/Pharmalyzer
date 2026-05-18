import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq, count, desc, and } from "drizzle-orm";
import { db, prescriptionsTable, medicationsTable } from "@workspace/db";
import {
  AnalyzePrescriptionBody,
  GetPrescriptionParams,
  DeletePrescriptionParams,
} from "@workspace/api-zod";
import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ── Auth guard ─────────────────────────────────────────────────────────────
function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}

// Apply to every prescription route
router.use("/prescriptions", requireAuth);

// ── Helpers ────────────────────────────────────────────────────────────────
async function getPrescriptionWithMedications(id: number, userId: number) {
  const [prescription] = await db
    .select()
    .from(prescriptionsTable)
    .where(and(eq(prescriptionsTable.id, id), eq(prescriptionsTable.userId, userId)));

  if (!prescription) return null;

  const medications = await db
    .select()
    .from(medicationsTable)
    .where(eq(medicationsTable.prescriptionId, id));

  return { ...prescription, medications };
}

// ── Routes ─────────────────────────────────────────────────────────────────

router.get("/prescriptions", async (req, res): Promise<void> => {
  const userId = req.session.userId!;

  const prescriptions = await db
    .select()
    .from(prescriptionsTable)
    .where(eq(prescriptionsTable.userId, userId))
    .orderBy(desc(prescriptionsTable.createdAt));

  const withMeds = await Promise.all(
    prescriptions.map((p) => getPrescriptionWithMedications(p.id, userId))
  );

  res.json(withMeds.filter(Boolean));
});

router.get("/prescriptions/summary", async (req, res): Promise<void> => {
  const userId = req.session.userId!;

  const [scanCount] = await db
    .select({ value: count() })
    .from(prescriptionsTable)
    .where(eq(prescriptionsTable.userId, userId));

  // Count medications that belong to this user's prescriptions
  const userPrescriptions = await db
    .select({ id: prescriptionsTable.id })
    .from(prescriptionsTable)
    .where(eq(prescriptionsTable.userId, userId));

  const prescriptionIds = userPrescriptions.map((p) => p.id);

  let medCount = 0;
  if (prescriptionIds.length > 0) {
    const medResults = await Promise.all(
      prescriptionIds.map((pid) =>
        db
          .select({ value: count() })
          .from(medicationsTable)
          .where(eq(medicationsTable.prescriptionId, pid))
      )
    );
    medCount = medResults.reduce((sum, r) => sum + Number(r[0]?.value ?? 0), 0);
  }

  const recentPrescriptions = await db
    .select()
    .from(prescriptionsTable)
    .where(eq(prescriptionsTable.userId, userId))
    .orderBy(desc(prescriptionsTable.createdAt))
    .limit(5);

  const recentWithMeds = await Promise.all(
    recentPrescriptions.map((p) => getPrescriptionWithMedications(p.id, userId))
  );

  res.json({
    totalScans: scanCount?.value ?? 0,
    totalMedications: medCount,
    recentScans: recentWithMeds.filter(Boolean),
  });
});

const PRESCRIPTION_SYSTEM_PROMPT = `You are an expert clinical pharmacist and medical OCR specialist with 20+ years of experience reading handwritten prescriptions from South Asian (Pakistan, India, Bangladesh) and international medical practices.

Your task is to extract ALL medication information from the prescription image, even if it is:
- Blurry, out of focus, or low resolution
- Poorly lit, overexposed, or underexposed
- Photographed at an angle or partially obscured
- Written in difficult-to-read handwriting
- Using heavy abbreviations, shorthand, or regional medical terminology
- Mixed languages (English + Urdu/Hindi script)
- Faded ink or stained paper

EXTRACTION STRATEGY FOR DIFFICULT IMAGES:
1. Use contextual medical knowledge to infer partially legible drug names — e.g., "Augment" → Augmentin, "Parace" → Paracetamol, "Metform" → Metformin
2. Cross-reference dosage patterns: if you see "500" near a drug, it's likely the strength in mg
3. Common South Asian prescription abbreviations to recognize:
   - OD / O.D. = Once daily
   - BD / B.D. = Twice daily  
   - TDS / T.D.S. = Three times daily
   - QDS / QID = Four times daily
   - HS / H.S. = At bedtime
   - AC = Before meals, PC = After meals
   - SOS / PRN = As needed
   - Tabs / Cap / Syr / Inj / Susp / Supp / Drops = dosage form
   - × or x followed by number = duration in days
   - Rx or ℞ = prescription symbol (ignore this)
4. If a drug name is partially visible, use your pharmacological knowledge to identify the most likely drug based on: visible letters, associated dosage, condition context, common prescribing patterns in South Asia
5. Look for the doctor's clinical context clues: diagnosis hints, specialty (cardiologist → cardiac drugs, etc.)

Respond ONLY with a valid JSON object in this EXACT format (no markdown, no extra text):
{
  "patientName": "string or null",
  "doctorName": "string or null",
  "imageQuality": "good|fair|poor",
  "medications": [
    {
      "name": "Brand name as written on prescription",
      "genericName": "INN/generic name of the active ingredient",
      "drugClass": "Pharmacological class (e.g. Antibiotic - Penicillin, NSAID, Proton Pump Inhibitor, ACE Inhibitor, Antidiabetic - Biguanide)",
      "dosage": "Strength and form (e.g. 500mg tablet, 125mg/5ml syrup, 40mg capsule)",
      "frequency": "Full plain-English frequency (e.g. Twice daily after meals, Once at bedtime)",
      "duration": "Treatment duration (e.g. 7 days, 2 weeks, 1 month, or null if not specified)",
      "purpose": "Clear patient-friendly explanation of what this drug treats or does (2-3 sentences)",
      "sideEffects": "The 3-4 most important common side effects the patient should know about",
      "contraindications": "Key warnings: who should NOT take this drug or important interactions (e.g. Avoid in pregnancy, Do not take with alcohol, Monitor blood sugar)",
      "notes": "Special instructions from the prescription (e.g. Take with food, Avoid sunlight, Complete full course) or null"
    }
  ]
}

CRITICAL RULES:
- Extract EVERY medication visible, even if only partially legible — make your best inference
- NEVER return an empty medications array unless the image contains absolutely no prescription content
- For purpose: write for a patient, not a doctor. Be specific about what condition it treats
- For sideEffects: list practical ones the patient will notice (nausea, drowsiness, etc.)
- For contraindications: include pregnancy category if relevant, major drug interactions, key warnings
- If image quality is poor, still attempt extraction and set imageQuality to "poor"
- Expand ALL abbreviations in frequency field to full readable text
- Include duration only if explicitly written on prescription`;

router.post("/prescriptions/analyze", async (req, res): Promise<void> => {
  const userId = req.session.userId!;

  const parsed = AnalyzePrescriptionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { imageData, mimeType } = parsed.data;
  req.log.info("Analyzing prescription image");

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 8192,
      messages: [
        { role: "system", content: PRESCRIPTION_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${imageData}`,
                detail: "high",
              },
            },
            {
              type: "text",
              text: "Please analyze this prescription image carefully. Extract every medication you can identify, even if the image is blurry or handwriting is unclear. Use your medical knowledge to infer partially legible drug names. Provide complete medication details including generic names, drug class, side effects and contraindications.",
            },
          ],
        },
      ],
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    req.log.info({ content }, "AI response received");

    let analysisData: {
      patientName?: string | null;
      doctorName?: string | null;
      imageQuality?: string | null;
      medications: Array<{
        name: string;
        genericName?: string | null;
        drugClass?: string | null;
        dosage?: string | null;
        frequency?: string | null;
        duration?: string | null;
        purpose?: string | null;
        sideEffects?: string | null;
        contraindications?: string | null;
        notes?: string | null;
      }>;
    };

    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      analysisData = JSON.parse(jsonMatch ? jsonMatch[0] : content);
    } catch (e) {
      req.log.error({ error: e, content }, "Failed to parse AI response");
      analysisData = { medications: [] };
    }

    const [prescription] = await db
      .insert(prescriptionsTable)
      .values({
        userId,
        status: "completed",
        patientName: analysisData.patientName ?? null,
        doctorName: analysisData.doctorName ?? null,
        rawAnalysis: content,
        imageData,
        imageMimeType: mimeType,
      })
      .returning();

    if (analysisData.medications?.length > 0) {
      await db.insert(medicationsTable).values(
        analysisData.medications.map((med) => ({
          prescriptionId: prescription.id,
          name: med.name,
          genericName: med.genericName ?? null,
          drugClass: med.drugClass ?? null,
          dosage: med.dosage ?? null,
          frequency: med.frequency ?? null,
          duration: med.duration ?? null,
          purpose: med.purpose ?? null,
          sideEffects: med.sideEffects ?? null,
          contraindications: med.contraindications ?? null,
          notes: med.notes ?? null,
        }))
      );
    }

    const result = await getPrescriptionWithMedications(prescription.id, userId);
    res.json(result);
  } catch (error) {
    req.log.error({ error }, "Failed to analyze prescription");
    res.status(500).json({ error: "Failed to analyze prescription" });
  }
});

router.get("/prescriptions/:id", async (req, res): Promise<void> => {
  const userId = req.session.userId!;

  const params = GetPrescriptionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const result = await getPrescriptionWithMedications(params.data.id, userId);
  if (!result) {
    res.status(404).json({ error: "Prescription not found" });
    return;
  }

  res.json(result);
});

router.delete("/prescriptions/:id", async (req, res): Promise<void> => {
  const userId = req.session.userId!;

  const params = DeletePrescriptionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // Only delete if it belongs to the current user
  const [deleted] = await db
    .delete(prescriptionsTable)
    .where(
      and(
        eq(prescriptionsTable.id, params.data.id),
        eq(prescriptionsTable.userId, userId)
      )
    )
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Prescription not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
