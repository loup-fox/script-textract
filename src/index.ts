import {
  AnalyzeExpenseCommand,
  TextractClient,
} from "@aws-sdk/client-textract";
import { eq, sql } from "drizzle-orm";
import env from "env-var";
import _ from "lodash";
import { db } from "./db.js";
import { OcrValidation, ocrValidations } from "./schema.js";

const AWS_REGION = env.get("AWS_REGION").required().asString();
const BUCKET_NAME = env.get("BUCKET_NAME").required().asString();

const textract = new TextractClient({ region: AWS_REGION });

const [{ count: totalCount }] = await db
  .select({ count: sql<number>`count(*)` })
  .from(ocrValidations)
  .execute();

console.log(`Found ${totalCount} records`);

function updateAverage(value: number) {
  return (processed.length * avgTime + value) / (processed.length + 1);
}

async function process(validation: OcrValidation) {
  try {
    console.log(`Processing ${validation.imagePath}`);
    const parsed = await textract.send(
      new AnalyzeExpenseCommand({
        Document: {
          S3Object: { Bucket: BUCKET_NAME, Name: validation.imagePath },
        },
      })
    );
    const documents = parsed.ExpenseDocuments;
    const pages = parsed.DocumentMetadata?.Pages;
    const result = JSON.stringify({
      documents,
      pages,
    });

    await db
      .update(ocrValidations)
      .set({ ocrResultAws: result })
      .where(eq(ocrValidations.imagePath, validation.imagePath));

    processed.push(validation.imagePath);
  } catch (e) {
    console.error(e);
  }
}

let processed: string[] = [];
let avgTime: number = 0;

for (let i = 0; i < totalCount; i += 1000) {
  const validations = await db
    .select()
    .from(ocrValidations)
    .limit(1000)
    .offset(i)
    .execute();

  for (const item of validations) {
    if (item.ocrResultAws !== "" || item.ocrResultAzure !== "") {
      // console.log(`Skipping ${item.imagePath}`);
      continue;
    }
    const start = Date.now();
    await process(item);
    const end = Date.now();
    const time = (end - start) / 2;
    avgTime = updateAverage(time);

    console.log(
      `[${
        (processed.length * 100) / totalCount
      }] (time: ${time}, avg: ${avgTime}) - Processed ${item.imagePath} (${
        processed.length
      }/${totalCount})`
    );
  }
}
