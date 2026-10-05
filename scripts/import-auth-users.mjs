#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_METADATA_KEYS = ["full_name", "name", "avatar_url", "picture"];

function parseArgs(argv) {
  const options = { dryRun: false, verifyOnly: false, expectedCount: null, source: null };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--verify-only") options.verifyOnly = true;
    else if (arg === "--source") options.source = argv[++index];
    else if (arg === "--expected-count") options.expectedCount = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.source) {
    throw new Error("Pass the private auth export with --source <path-to-users.json>.");
  }
  if (options.dryRun && options.verifyOnly) {
    throw new Error("Use either --dry-run or --verify-only, not both.");
  }
  if (options.expectedCount !== null && (!Number.isInteger(options.expectedCount) || options.expectedCount < 1)) {
    throw new Error("--expected-count must be a positive integer.");
  }

  return options;
}

function loadEnvFile(path) {
  const text = readFileSync(path, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    let value = rawValue.trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function normalizeEmail(value) {
  return String(value ?? "").trim().toLocaleLowerCase("en-US");
}

function safeUserMetadata(metadata) {
  const source = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
  return Object.fromEntries(
    SAFE_METADATA_KEYS
      .filter((key) => typeof source[key] === "string" && source[key].trim().length > 0)
      .map((key) => [key, source[key]]),
  );
}

function fingerprint(values) {
  return createHash("sha256").update([...values].sort().join("\n")).digest("hex").slice(0, 16);
}

function validateSource(rows, expectedCount) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("The auth export must be a non-empty JSON array.");
  if (expectedCount !== null && rows.length !== expectedCount) {
    throw new Error(`Expected ${expectedCount} source users, found ${rows.length}.`);
  }

  const ids = new Set();
  const emails = new Set();
  const allowedProviders = new Set(["email", "google"]);

  rows.forEach((row, index) => {
    const record = index + 1;
    if (!UUID_V4.test(String(row?.id ?? ""))) throw new Error(`Source record ${record} has an invalid UUID v4.`);
    const email = normalizeEmail(row?.email);
    if (!email || !email.includes("@")) throw new Error(`Source record ${record} has an invalid email.`);
    if (ids.has(row.id)) throw new Error(`Source record ${record} repeats a user ID.`);
    if (emails.has(email)) throw new Error(`Source record ${record} repeats an email.`);
    if (!row.email_confirmed_at) throw new Error(`Source record ${record} is not email-confirmed.`);
    if (row.is_anonymous) throw new Error(`Source record ${record} is anonymous; this importer does not support it.`);
    const provider = row?.app_metadata?.provider;
    if (!allowedProviders.has(provider)) throw new Error(`Source record ${record} has an unsupported provider.`);
    ids.add(row.id);
    emails.add(email);
  });

  return { ids, emails };
}

async function listAllUsers(supabase) {
  const users = [];
  const perPage = 1000;
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`Could not list Auth users: ${error.message}`);
    const batch = data?.users ?? [];
    users.push(...batch);
    if (batch.length < perPage) break;
  }
  return users;
}

function assertNoConflicts(sourceRows, remoteUsers) {
  const sourceIds = new Set(sourceRows.map((row) => row.id));
  const remoteById = new Map(remoteUsers.map((user) => [user.id, user]));
  const remoteByEmail = new Map(remoteUsers.map((user) => [normalizeEmail(user.email), user]));

  for (const user of remoteUsers) {
    if (!sourceIds.has(user.id)) throw new Error("The target project contains an Auth user absent from the export.");
  }

  sourceRows.forEach((row, index) => {
    const existingById = remoteById.get(row.id);
    const existingByEmail = remoteByEmail.get(normalizeEmail(row.email));
    if (existingById && normalizeEmail(existingById.email) !== normalizeEmail(row.email)) {
      throw new Error(`Target conflict at source record ${index + 1}: UUID belongs to a different email.`);
    }
    if (existingByEmail && existingByEmail.id !== row.id) {
      throw new Error(`Target conflict at source record ${index + 1}: email belongs to a different UUID.`);
    }
  });

  return remoteById;
}

async function selectAllRows(supabase, table, columns) {
  const { data, error } = await supabase.from(table).select(columns).limit(1000);
  if (error) throw new Error(`Could not verify ${table}: ${error.message}`);
  return data ?? [];
}

function assertExactSet(actualValues, expectedValues, label) {
  const actual = new Set(actualValues);
  const expected = new Set(expectedValues);
  if (actual.size !== expected.size || [...expected].some((value) => !actual.has(value))) {
    throw new Error(`${label} does not exactly match the source UUID set.`);
  }
}

async function verifyImport(supabase, sourceRows) {
  const users = await listAllUsers(supabase);
  assertNoConflicts(sourceRows, users);

  const expectedIds = sourceRows.map((row) => row.id);
  const expectedEmails = sourceRows.map((row) => normalizeEmail(row.email));
  assertExactSet(users.map((user) => user.id), expectedIds, "Auth users");
  assertExactSet(users.map((user) => normalizeEmail(user.email)), expectedEmails, "Auth emails");
  if (users.some((user) => !user.email_confirmed_at)) throw new Error("At least one imported user is not email-confirmed.");

  const profiles = await selectAllRows(supabase, "profiles", "id");
  const subscriptions = await selectAllRows(supabase, "subscriptions", "user_id");
  assertExactSet(profiles.map((row) => row.id), expectedIds, "Profiles");
  assertExactSet(subscriptions.map((row) => row.user_id), expectedIds, "Subscriptions");

  return {
    authUsers: users.length,
    confirmedUsers: users.filter((user) => Boolean(user.email_confirmed_at)).length,
    profiles: profiles.length,
    subscriptions: subscriptions.length,
    uuidSetFingerprint: fingerprint(expectedIds),
    emailSetFingerprint: fingerprint(expectedEmails),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  loadEnvFile(resolve(process.cwd(), ".env.local"));

  const projectRef = process.env.SUPABASE_PROJECT_REF;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!projectRef || !supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_PROJECT_REF, SUPABASE_URL, or SUPABASE_SERVICE_ROLE_KEY in .env.local.");
  }
  const hostname = new URL(supabaseUrl).hostname;
  if (hostname !== `${projectRef}.supabase.co`) {
    throw new Error("SUPABASE_URL does not match SUPABASE_PROJECT_REF.");
  }

  const sourceRows = JSON.parse(readFileSync(resolve(options.source), "utf8"));
  const source = validateSource(sourceRows, options.expectedCount);
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

  const before = await listAllUsers(supabase);
  const existingById = assertNoConflicts(sourceRows, before);

  if (options.dryRun) {
    console.log(JSON.stringify({
      mode: "dry-run",
      sourceUsers: sourceRows.length,
      existingUsers: before.length,
      usersToCreate: sourceRows.length - before.length,
      uuidSetFingerprint: fingerprint(source.ids),
      emailSetFingerprint: fingerprint(source.emails),
    }, null, 2));
    return;
  }

  let created = 0;
  let resumed = 0;
  if (!options.verifyOnly) {
    for (let index = 0; index < sourceRows.length; index += 1) {
      const row = sourceRows[index];
      if (existingById.has(row.id)) {
        resumed += 1;
        continue;
      }
      const { data, error } = await supabase.auth.admin.createUser({
        id: row.id,
        email: row.email,
        email_confirm: true,
        user_metadata: safeUserMetadata(row.user_metadata),
      });
      if (error) throw new Error(`Could not import source record ${index + 1}: ${error.message}`);
      if (data?.user?.id !== row.id) throw new Error(`Source record ${index + 1} was created with the wrong UUID.`);
      created += 1;
    }
  }

  const verified = await verifyImport(supabase, sourceRows);
  console.log(JSON.stringify({
    mode: options.verifyOnly ? "verify-only" : "import",
    sourceUsers: sourceRows.length,
    created,
    resumed,
    ...verified,
  }, null, 2));
}

main().catch((error) => {
  console.error(`Auth import failed: ${error.message}`);
  process.exitCode = 1;
});
