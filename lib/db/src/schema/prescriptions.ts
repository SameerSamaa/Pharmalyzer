import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const prescriptionsTable = pgTable("prescriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  status: text("status").notNull().default("completed"),
  patientName: text("patient_name"),
  doctorName: text("doctor_name"),
  rawAnalysis: text("raw_analysis"),
  imageData: text("image_data"),
  imageMimeType: text("image_mime_type"),
});

export const medicationsTable = pgTable("medications", {
  id: serial("id").primaryKey(),
  prescriptionId: integer("prescription_id").notNull().references(() => prescriptionsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  genericName: text("generic_name"),
  drugClass: text("drug_class"),
  dosage: text("dosage"),
  frequency: text("frequency"),
  duration: text("duration"),
  purpose: text("purpose"),
  sideEffects: text("side_effects"),
  contraindications: text("contraindications"),
  notes: text("notes"),
});

export const insertPrescriptionSchema = createInsertSchema(prescriptionsTable).omit({ id: true, createdAt: true });
export const insertMedicationSchema = createInsertSchema(medicationsTable).omit({ id: true });

export type InsertPrescription = z.infer<typeof insertPrescriptionSchema>;
export type Prescription = typeof prescriptionsTable.$inferSelect;
export type InsertMedication = z.infer<typeof insertMedicationSchema>;
export type Medication = typeof medicationsTable.$inferSelect;
