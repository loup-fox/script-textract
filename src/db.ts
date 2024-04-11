import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import env from "env-var";
import * as schema from "./schema.js";

const MYSQL_HOST = env.get("MYSQL_HOST").required().asString();
const MYSQL_USER = env.get("MYSQL_USER").required().asString();
const MYSQL_PASSWORD = env.get("MYSQL_PASSWORD").required().asString();
const MYSQL_DATABASE = env.get("MYSQL_DATABASE").required().asString();

const connection = await mysql.createConnection({
  host: MYSQL_HOST,
  user: MYSQL_USER,
  database: MYSQL_DATABASE,
  password: MYSQL_PASSWORD,
});

export const db = drizzle(connection, { schema, mode: "default" });
