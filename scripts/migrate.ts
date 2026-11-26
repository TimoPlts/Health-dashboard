import "./_env";
import { env } from "../src/server/env";
import { openDatabase } from "../src/server/db/client";

openDatabase(env().DATABASE_PATH);
console.log(`Migrations applied to ${env().DATABASE_PATH}`);
