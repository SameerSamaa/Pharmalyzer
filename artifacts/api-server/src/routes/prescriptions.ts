import { Router, type IRouter } from "express";
import { eq, count, desc } from "drizzle-orm";
import { db, prescriptionsTable, medicationsTable } from "@workspace/db";
import {
  AnalyzePrescriptionBody,
  GetPrescriptionParams,
  DeletePrescriptionParams,
} from "@workspace/api-zod";
import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "../lib/logger";

const router: IRouter = Router();

async function getPrescriptionWithMedications(id: number) {
  const [prescription] = await db
    .select()
    .from(prescriptionsTable)
    .where(eq(prescriptionsTable.id, id));

  if (!prescription) return null;

  const medications = await db
    .select()
    .from(medicationsTable)
    .where(eq(medicationsTable.prescriptionId, id));

  return { ...prescription, medications };
}

router.get("/prescriptions", async (req, res): Promise<void> => {
  const prescriptions = await db
    .select()
    .from(prescriptionsTable)
    .orderBy(desc(prescriptionsTable.createdAt));

  const withMeds = await Promise.all(
    prescriptions.map((p) => getPrescriptionWithMedications(p.id))
  );

  res.json(withMeds.filter(Boolean));
});

router.get("/prescriptions/summary", async (req, res): Promise<void> => {
  const [scanCount] = await db.select({ value: count() }).from(prescriptionsTable);
  const [medCount] = await db.select({ value: count() }).from(medicationsTable);

  const recentPrescriptions = await db
    .select()
    .from(prescriptionsTable)
    .orderBy(desc(prescriptionsTable.createdAt))
    .limit(5);

  const recentWithMeds = await Promise.all(
    recentPrescriptions.map((p) => getPrescriptionWithMedications(p.id))
  );

  res.json({
    totalScans: scanCount?.value ?? 0,
    totalMedications: medCount?.value ?? 0,
    recentScans: recentWithMeds.filter(Boolean),
  });
});

router.post("/prescriptions/analyze", async (req, res): Promise<void> => {
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
      max_completion_tokens: 4096,
      messages: [
        {
          role: "system",
          content: `You are a medical prescription reader. Analyze the handwritten prescription image and extract all medications listed.

Respond ONLY with a valid JSON object in this exact format:
{
  "patientName": "string or null",
  "doctorName": "string or null",
  "medications": [
    {
      "name": "medication name",
      "dosage": "dosage amount and form (e.g. 500mg tablet) or null",
      "frequency": "how often to take (e.g. twice daily, TDS) or null",
      "purpose": "what this medication is used to treat (explain clearly for a patient)",
      "notes": "any special instructions or null"
    }
  ]
}

Rules:
- Extract ALL medications visible in the prescription
- For purpose, always provide a clear patient-friendly explanation of what the drug treats
- If you cannot read part of the prescription clearly, make your best attempt and note it
- Expand common medical abbreviations (e.g. TDS = three times daily, BD = twice daily, OD = once daily)
- If no medications can be identified, return an empty medications array`
        },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${imageData}`,
              },
            },
            {
              type: "text",
              text: "Please analyze this prescription and extract all medications with their dosages, frequencies, and purposes.",
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
      medications: Array<{
        name: string;
        dosage?: string | null;
        frequency?: string | null;
        purpose?: string | null;
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
        status: "completed",
        patientName: analysisData.patientName ?? null,
        doctorName: analysisData.doctorName ?? null,
        rawAnalysis: content,
      })
      .returning();

    if (analysisData.medications?.length > 0) {
      await db.insert(medicationsTable).values(
        analysisData.medications.map((med) => ({
          prescriptionId: prescription.id,
          name: med.name,
          dosage: med.dosage ?? null,
          frequency: med.frequency ?? null,
          purpose: med.purpose ?? null,
          notes: med.notes ?? null,
        }))
      );
    }

    const result = await getPrescriptionWithMedications(prescription.id);
    res.json(result);
  } catch (error) {
    req.log.error({ error }, "Failed to analyze prescription");
    res.status(500).json({ error: "Failed to analyze prescription" });
  }
});

router.get("/prescriptions/:id", async (req, res): Promise<void> => {
  const params = GetPrescriptionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const result = await getPrescriptionWithMedications(params.data.id);
  if (!result) {
    res.status(404).json({ error: "Prescription not found" });
    return;
  }

  res.json(result);
});

router.delete("/prescriptions/:id", async (req, res): Promise<void> => {
  const params = DeletePrescriptionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db
    .delete(prescriptionsTable)
    .where(eq(prescriptionsTable.id, params.data.id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Prescription not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
