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
// import { Redis } from "ioredis";

const AWS_REGION = env.get("AWS_REGION").required().asString();
const BUCKET_NAME = env.get("BUCKET_NAME").required().asString();
// const REDIS_URI = env.get("REDIS_URI").required().asString();

const textract = new TextractClient({ region: AWS_REGION });
// const redis = new Redis(REDIS_URI);

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
    console.log(`Processing ${validation.imagePath}`);

    const [parsed, timeParsed] = await time(() =>
      textract.send(
        new AnalyzeExpenseCommand({
          Document: {
            S3Object: { Bucket: BUCKET_NAME, Name: validation.imagePath },
          },
        })
      )
    );
    avgParsingTime = updateAverage(avgParsingTime, timeParsed);

    console.log(
      `Parsed ${validation.imagePath} in ${timeParsed}ms (avg: ${avgParsingTime})`
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
    // redis.set(`service-textract:insert:${validation.imagePath}`, result);
    avgInsertTime = updateAverage(avgInsertTime, timeInsert);

    console.log(
      `Updated ${validation.imagePath} in ${timeInsert}ms (avg: ${avgInsertTime})`
    );

    processed.push(validation.imagePath);
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
    if (item.ocrResultAws !== "" || item.ocrResultAzure !== "") {
      // console.log(`Skipping ${item.imagePath}`);
      continue;
    }
    await process(item);

    console.log(
      `Processed ${item.imagePath} (${processed.length}/${totalCount})`
    );
  }
}
