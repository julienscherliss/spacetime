#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";

const BUCKETS = new Set(["feedback-screenshots", "task-attachments"]);
const OLD_FEEDBACK_PREFIX =
  "https://rhguyvbysqmcwzeuqipr.supabase.co/storage/v1/object/public/feedback-screenshots/";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MIME_TYPES = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".mp3", "audio/mpeg"],
  [".pdf", "application/pdf"],
  [".zip", "application/zip"],
]);

function parseArgs(argv) {
  const options = { source: null, dryRun: false, verifyOnly: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--source") options.source = argv[++index];
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--verify-only") options.verifyOnly = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.source) throw new Error("Pass --source <export-storage-directory>.");
  if (options.dryRun && options.verifyOnly) throw new Error("Use either --dry-run or --verify-only.");
  return options;
}

function loadEnvFile(path) {
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const splitAt = line.indexOf("=");
    const key = line.slice(0, splitAt);
    if (process.env[key] !== undefined) continue;
    let value = line.slice(splitAt + 1).trim();
    if (value.length >= 2 && value[0] === value.at(-1) && ['"', "'"].includes(value[0])) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function posixPath(path) {
  return path.split(sep).join("/");
}

function walkFiles(root) {
  const result = [];
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    const stats = lstatSync(path);
    if (stats.isSymbolicLink()) throw new Error("Storage source may not contain symbolic links.");
    if (stats.isDirectory()) result.push(...walkFiles(path));
    else if (stats.isFile()) result.push(path);
  }
  return result;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function inventorySource(source) {
  const root = resolve(source);
  const manifestPath = join(root, "manifest.txt");
  const manifest = new Set(
    readFileSync(manifestPath, "utf8").split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
  );
  const objects = [];
  for (const bucket of [...BUCKETS].sort()) {
    const bucketRoot = join(root, bucket);
    for (const filePath of walkFiles(bucketRoot)) {
      const objectPath = posixPath(relative(bucketRoot, filePath));
      if (!objectPath || objectPath.startsWith("../") || objectPath.includes("/../")) {
        throw new Error("Unsafe storage object path in source.");
      }
      const ownerPrefix = objectPath.split("/")[0];
      if (!UUID.test(ownerPrefix)) throw new Error(`Storage path in ${bucket} lacks a UUID owner prefix.`);
      const bytes = readFileSync(filePath);
      objects.push({
        bucket,
        objectPath,
        filePath,
        bytes,
        size: bytes.byteLength,
        digest: sha256(bytes),
        contentType: MIME_TYPES.get(extname(filePath).toLowerCase()) ?? "application/octet-stream",
      });
    }
  }
  const inventoryPaths = new Set(objects.map((object) => `${object.bucket}/${object.objectPath}`));
  if (manifest.size !== inventoryPaths.size || [...manifest].some((path) => !inventoryPaths.has(path))) {
    throw new Error("storage/manifest.txt does not exactly match the source object tree.");
  }
  if (new Set(objects.map((object) => `${object.bucket}/${object.objectPath}`)).size !== objects.length) {
    throw new Error("Duplicate storage object path in source.");
  }
  return objects.sort((a, b) => `${a.bucket}/${a.objectPath}`.localeCompare(`${b.bucket}/${b.objectPath}`));
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

async function listFolder(supabase, bucket, prefix = "") {
  const results = [];
  const limit = 100;
  for (let offset = 0; ; offset += limit) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, {
      limit,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new Error(`Could not list ${bucket}: ${error.message}`);
    const batch = data ?? [];
    for (const item of batch) {
      const child = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id) results.push(child);
      else results.push(...await listFolder(supabase, bucket, child));
    }
    if (batch.length < limit) break;
  }
  return results;
}

async function downloadBytes(supabase, bucket, objectPath) {
  const { data, error } = await supabase.storage.from(bucket).download(objectPath);
  if (error || !data) throw new Error(`Could not download an object from ${bucket}: ${error?.message ?? "no data"}`);
  return Buffer.from(await data.arrayBuffer());
}

async function inspectLegacyFeedback(supabase, sourcePaths) {
  const { data, error } = await supabase.from("feedback").select("id,screenshot_url");
  if (error) throw new Error(`Could not inspect feedback screenshot references: ${error.message}`);
  const updates = [];
  let privateReferencesVerified = 0;
  for (const row of data ?? []) {
    if (typeof row.screenshot_url !== "string" || row.screenshot_url.length === 0) continue;
    if (row.screenshot_url.startsWith(OLD_FEEDBACK_PREFIX)) {
      const objectPath = decodeURIComponent(row.screenshot_url.slice(OLD_FEEDBACK_PREFIX.length));
      if (!sourcePaths.has(`feedback-screenshots/${objectPath}`)) {
        throw new Error("A legacy feedback URL does not resolve to an exported object.");
      }
      updates.push({ id: row.id, objectPath });
    } else if (!row.screenshot_url.startsWith("http://") && !row.screenshot_url.startsWith("https://")) {
      if (!sourcePaths.has(`feedback-screenshots/${row.screenshot_url}`)) {
        throw new Error("A private feedback screenshot path does not resolve to an exported object.");
      }
      privateReferencesVerified += 1;
    }
  }
  return { updates, privateReferencesVerified };
}

async function assertBuckets(supabase) {
  for (const bucket of BUCKETS) {
    const { data, error } = await supabase.storage.getBucket(bucket);
    if (error || !data) throw new Error(`Missing storage bucket ${bucket}.`);
    if (data.public) throw new Error(`Storage bucket ${bucket} must be private.`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  loadEnvFile(resolve(process.cwd(), ".env.local"));
  const projectRef = process.env.SUPABASE_PROJECT_REF;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!projectRef || !supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase migration credentials in .env.local.");
  }
  if (new URL(supabaseUrl).hostname !== `${projectRef}.supabase.co`) {
    throw new Error("SUPABASE_URL does not match SUPABASE_PROJECT_REF.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const source = inventorySource(options.source);
  const sourcePaths = new Set(source.map((object) => `${object.bucket}/${object.objectPath}`));
  await assertBuckets(supabase);

  const users = await listAllUsers(supabase);
  const userIds = new Set(users.map((user) => user.id));
  const historicalOwnerObjects = source.filter((object) => !userIds.has(object.objectPath.split("/")[0])).length;
  const targetByBucket = new Map();
  for (const bucket of BUCKETS) {
    targetByBucket.set(bucket, new Set(await listFolder(supabase, bucket)));
  }
  const targetPaths = new Set(
    [...targetByBucket].flatMap(([bucket, paths]) => [...paths].map((path) => `${bucket}/${path}`)),
  );
  const targetExtras = [...targetPaths].filter((path) => !sourcePaths.has(path));
  if (!options.dryRun && targetExtras.length > 0) {
    throw new Error("Target storage contains objects absent from the export; refusing to continue.");
  }

  let existingExact = 0;
  let uploaded = 0;
  let verified = 0;
  for (const object of source) {
    const exists = targetByBucket.get(object.bucket).has(object.objectPath);
    if (exists) {
      const remote = await downloadBytes(supabase, object.bucket, object.objectPath);
      if (remote.byteLength !== object.size || sha256(remote) !== object.digest) {
        throw new Error(`Existing target object differs from source in ${object.bucket}.`);
      }
      existingExact += 1;
      continue;
    }
    if (options.verifyOnly) throw new Error(`Target storage is missing an object in ${object.bucket}.`);
    if (options.dryRun) continue;
    const { error } = await supabase.storage.from(object.bucket).upload(object.objectPath, object.bytes, {
      contentType: object.contentType,
      cacheControl: "3600",
      upsert: false,
    });
    if (error) throw new Error(`Could not upload an object to ${object.bucket}: ${error.message}`);
    uploaded += 1;
  }

  const feedbackInspection = await inspectLegacyFeedback(supabase, sourcePaths);
  const legacyFeedback = feedbackInspection.updates;
  let privateFeedbackReferencesVerified = feedbackInspection.privateReferencesVerified;
  if (!options.dryRun) {
    for (const object of source) {
      const remote = await downloadBytes(supabase, object.bucket, object.objectPath);
      if (remote.byteLength !== object.size || sha256(remote) !== object.digest) {
        throw new Error(`Post-upload verification failed in ${object.bucket}.`);
      }
      verified += 1;
    }
    for (const update of legacyFeedback) {
      const { error } = await supabase
        .from("feedback")
        .update({ screenshot_url: update.objectPath })
        .eq("id", update.id);
      if (error) throw new Error(`Could not rewrite a legacy feedback reference: ${error.message}`);
    }
    const finalFeedbackInspection = await inspectLegacyFeedback(supabase, sourcePaths);
    if (finalFeedbackInspection.updates.length > 0) {
      throw new Error("A legacy feedback screenshot URL remained after the private-path rewrite.");
    }
    privateFeedbackReferencesVerified = finalFeedbackInspection.privateReferencesVerified;
    const finalPaths = new Set();
    for (const bucket of BUCKETS) {
      for (const objectPath of await listFolder(supabase, bucket)) finalPaths.add(`${bucket}/${objectPath}`);
    }
    if (finalPaths.size !== sourcePaths.size || [...sourcePaths].some((path) => !finalPaths.has(path))) {
      throw new Error("Final target storage path set does not exactly match the export.");
    }
  }

  console.log(JSON.stringify({
    mode: options.verifyOnly ? "verify-only" : options.dryRun ? "dry-run" : "upload",
    sourceObjects: source.length,
    sourceBytes: source.reduce((sum, object) => sum + object.size, 0),
    objectsToUpload: source.length - existingExact,
    existingExact,
    uploaded,
    verified,
    targetExtras: targetExtras.length,
    historicalOwnerObjects,
    legacyFeedbackReferencesToRewrite: legacyFeedback.length,
    privateFeedbackReferencesVerified,
    bucketCounts: Object.fromEntries(
      [...BUCKETS].sort().map((bucket) => [bucket, source.filter((object) => object.bucket === bucket).length]),
    ),
  }, null, 2));
}

main().catch((error) => {
  console.error(`Storage migration failed: ${error.message}`);
  process.exitCode = 1;
});
