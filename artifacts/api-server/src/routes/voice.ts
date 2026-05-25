import { Router, type IRouter } from "express";
import express from "express";
import { toFile } from "openai";
import { openai } from "@workspace/integrations-openai-ai-server";

const router: IRouter = Router();

const MEDICAL_PROMPT = [
  "The user is asking a medical question in English (US, Indian, or Pakistani accent).",
  "Common medicines they may mention: Calpol, Panadol, Augmentin, Brufen, Myteka, Risek,",
  "Disprin, Flagyl, Ciproxin, Ventolin, Nexum, Concor, Cardiprin, Velosef, Septran, Klaricid,",
  "Glucophage, Norvasc, Tenoric, Inderal, Lipiget, Rosuvas, Tegral, Lexotanil, Xanax,",
  "Loprin, Aspirin, Paracetamol, Ibuprofen, Amoxicillin, Metformin, Omeprazole.",
  "Common specialties: cardiologist, neurologist, dermatologist, pulmonologist, gastroenterologist,",
  "orthopedic, ENT, paediatrician, gynaecologist, urologist, ophthalmologist, dentist, oncologist, psychiatrist.",
  "Common cities: Karachi, Lahore, Islamabad, Rawalpindi, Faisalabad, Multan, Peshawar, Quetta.",
  "Common hospitals: AKUH (Aga Khan), Saifee, LNH (Liaquat National), KMH (Kulsum International),",
  "Shifa, Indus, Doctors Hospital, Hameed Latif, Shaukat Khanum.",
].join(" ");

router.post(
  "/voice/transcribe",
  express.raw({ type: ["audio/*", "application/octet-stream"], limit: "25mb" }),
  async (req, res) => {
    try {
      const buffer = req.body as Buffer;
      if (!buffer || buffer.length === 0) {
        return res.status(400).json({ error: "Empty audio body" });
      }

      const formatParam = (req.query["format"] as string) || "webm";
      const format = ["webm", "wav", "mp3", "mp4", "m4a", "ogg"].includes(formatParam) ? formatParam : "webm";

      const file = await toFile(buffer, `audio.${format}`);

      const response = await openai.audio.transcriptions.create({
        file,
        model: "gpt-4o-mini-transcribe",
        language: "en",
        prompt: MEDICAL_PROMPT,
      });

      const transcript = (response.text || "").trim();
      req.log.info({ transcriptLength: transcript.length, audioBytes: buffer.length }, "Transcribed voice input");
      return res.json({ transcript });
    } catch (err) {
      req.log.error({ err }, "Voice transcription failed");
      return res.status(500).json({ error: "Transcription failed" });
    }
  }
);

export default router;
