import {
  int,
  varchar,
  date,
  longtext,
  mysqlTable,
} from "drizzle-orm/mysql-core";
import { type InferSelectModel } from "drizzle-orm";

export const ocrValidations = mysqlTable("ocr_validations", {
  idOcrValidation: int("id_ocr_validation").autoincrement().primaryKey(),
  originalReceiptId: int("original_receipt_id").notNull(),
  imagePath: varchar("image_path", { length: 255 }).notNull(),
  ocrResultOriginal: longtext("ocr_result_original").notNull(),
  ocrResultAws: longtext("ocr_result_aws").notNull(),
  ocrResultAzure: longtext("ocr_result_azure").notNull(),
  ocrStatus: int("ocr_status").notNull(),
  validationPayload: longtext("validation_payload").notNull(),
  createdAt: date("created_at", { mode: "date" }).notNull(),
});

export type OcrValidation = InferSelectModel<typeof ocrValidations>;
