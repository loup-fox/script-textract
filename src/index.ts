import {
  AnalyzeExpenseCommand,
  TextractClient,
} from "@aws-sdk/client-textract";
import { eq } from "drizzle-orm";
import env from "env-var";
import _ from "lodash";
import { db } from "./db.js";
import { OcrValidation, ocrValidations } from "./schema.js";

const AWS_REGION = env.get("AWS_REGION").required().asString();
const BUCKET_NAME = env.get("BUCKET_NAME").required().asString();

const textract = new TextractClient({ region: AWS_REGION });

console.log('Fetching records with empty "ocrResultAws" and "ocrResultAzure"');
const validations = await db.query.ocrValidations.findMany({
  where(fields, { eq, and }) {
    return and(eq(fields.ocrResultAzure, ""), eq(fields.ocrResultAws, ""));
  },
});

let processed: string[] = [];
let avgTime: number = 0;

const chunks = _.chunk(validations, 1);

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

    console.log(
      `[${(processed.length * 100) / validations.length}] - Processed ${
        validation.imagePath
      } (${processed.length}/${validations.length})`
    );
  } catch (e) {
    console.error(e);
  }
}

for (const items of chunks) {
  const start = Date.now();
  await Promise.all(items.map((validation) => process(validation)));
  const end = Date.now();
  const time = (end - start) / 2;
  avgTime = updateAverage(time);
  console.log(`Average time: ${avgTime}ms`);
  console.log(
    `Time to completion: ${
      (avgTime * (validations.length - processed.length)) / 1000
    }s`
  );
}

console.log(validations.length);
