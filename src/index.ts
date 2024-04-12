import {
  AnalyzeExpenseCommand,
  TextractClient,
} from "@aws-sdk/client-textract";
import { eq, sql } from "drizzle-orm";
import env from "env-var";
import _ from "lodash";
import { db } from "./db.js";
import { OcrValidation, ocrValidations } from "./schema.js";
import { time } from "./helpers.js";

const AWS_REGION = env.get("AWS_REGION").required().asString();
const BUCKET_NAME = env.get("BUCKET_NAME").required().asString();

const textract = new TextractClient({ region: AWS_REGION });

const [{ count: totalCount }] = await db
  .select({ count: sql<number>`count(*)` })
  .from(ocrValidations)
  .execute();

console.log(`Found ${totalCount} records`);

function updateAverage(avgTime: number, value: number) {
  return (processed.length * avgTime + value) / (processed.length + 1);
}

async function process(validation: OcrValidation) {
  try {
    const [parsed, timeParsed] = await time(() =>
      textract.send(
        new AnalyzeExpenseCommand({
          Document: {
            S3Object: { Bucket: BUCKET_NAME, Name: validation.imagePath },
          },
        })
      )
    );
    const documents = parsed.ExpenseDocuments;
    const pages = parsed.DocumentMetadata?.Pages;
    const result = JSON.stringify({
      documents,
      pages,
    });
    const [_, timeInsert] = await time(() =>
      db
        .update(ocrValidations)
        .set({ ocrResultAws: result })
        .where(eq(ocrValidations.idOcrValidation, validation.idOcrValidation))
    );
    processed.push(validation.imagePath);
    return { timeParsed, timeInsert };
  } catch (e) {
    console.error(e);
  }
}

let processed: string[] = [];
let avgInsertTime: number = 0;
let avgParsingTime: number = 0;

for (let i = 0; i < totalCount; i += 1000) {
  const validations = await db
    .select()
    .from(ocrValidations)
    .limit(1000)
    .offset(i)
    .execute();

  for (const item of validations) {
    if (item.ocrResultAws === "" && item.ocrResultAzure === "") {
      const times = await process(item);
      if (times) {
        avgInsertTime = updateAverage(avgInsertTime, times.timeInsert);
        avgParsingTime = updateAverage(avgParsingTime, times.timeParsed);
      }
    }

    processed.push(item.imagePath);

    console.log(
      `[${((processed.length / totalCount) * 100).toFixed(2)}] - Processed ${
        item.imagePath
      } (${processed.length}/${totalCount})`
    );
    console.log(
      `Avg Insert Time: ${avgInsertTime} | Avg Parsing Time: ${avgParsingTime}`
    );
  }
}
