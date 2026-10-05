#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";

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

function client(url, key) {
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function mustSucceed(promise, label) {
  const result = await promise;
  if (result.error) throw new Error(`${label} failed: ${result.error.message}`);
  return result.data;
}

async function mustFail(promise, label) {
  const result = await promise;
  if (!result.error) throw new Error(`${label} unexpectedly succeeded.`);
}

async function signIn(url, anonKey, email, password) {
  const supabase = client(url, anonKey);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`Controlled storage-test sign-in failed: ${error?.message}`);
  return supabase;
}

async function exactCount(supabase, table) {
  const { count, error } = await supabase.from(table).select("*", { head: true, count: "exact" });
  if (error || count === null) throw new Error(`Could not count ${table}: ${error?.message}`);
  return count;
}

async function downloadExpected(supabase, bucket, path, expected, label) {
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    const downloaded = await mustSucceed(supabase.storage.from(bucket).download(path), label);
    if (Buffer.from(await downloaded.arrayBuffer()).equals(expected)) return;
    if (attempt < 12) await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }
  throw new Error(`${label} bytes did not converge to the expected content.`);
}

async function main() {
  loadEnvFile(resolve(process.cwd(), ".env.local"));
  const projectRef = process.env.SUPABASE_PROJECT_REF;
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!projectRef || !url || !serviceKey || !anonKey) throw new Error("Missing Supabase test credentials.");
  if (new URL(url).hostname !== `${projectRef}.supabase.co`) throw new Error("Supabase project identity mismatch.");

  const service = client(url, serviceKey);
  const anonymous = client(url, anonKey);
  const suffix = randomUUID();
  const users = [
    { id: randomUUID(), email: `storage-owner-${suffix}@example.invalid`, password: `St-${randomUUID()}!` },
    { id: randomUUID(), email: `storage-other-${suffix}@example.invalid`, password: `St-${randomUUID()}!` },
  ];
  const testObjects = [
    { bucket: "task-attachments", path: `${users[0].id}/policy-test/${randomUUID()}.txt` },
    { bucket: "feedback-screenshots", path: `${users[0].id}/${Date.now()}-policy-test.txt` },
  ];
  let owner;
  let other;
  let tests = 0;
  let operationError;
  const cleanupErrors = [];

  try {
    for (const user of users) {
      const { data, error } = await service.auth.admin.createUser({
        id: user.id,
        email: user.email,
        password: user.password,
        email_confirm: true,
      });
      if (error || data.user?.id !== user.id) throw new Error(`Could not create controlled storage-test user: ${error?.message}`);
    }
    owner = await signIn(url, anonKey, users[0].email, users[0].password);
    other = await signIn(url, anonKey, users[1].email, users[1].password);

    for (const object of testObjects) {
      const initial = Buffer.from(`storage-policy-initial-${object.bucket}`);
      const updated = Buffer.from(`storage-policy-updated-${object.bucket}`);

      await mustSucceed(owner.storage.from(object.bucket).upload(object.path, initial, {
        contentType: "text/plain",
        upsert: false,
      }), `${object.bucket} owner upload`);
      tests += 1;

      const downloaded = await mustSucceed(
        owner.storage.from(object.bucket).download(object.path),
        `${object.bucket} owner download`,
      );
      assert(Buffer.from(await downloaded.arrayBuffer()).equals(initial), `${object.bucket} owner bytes changed.`);
      tests += 1;

      await mustFail(other.storage.from(object.bucket).download(object.path), `${object.bucket} cross-user download`);
      await mustFail(anonymous.storage.from(object.bucket).download(object.path), `${object.bucket} anonymous download`);
      await mustFail(other.storage.from(object.bucket).upload(object.path, updated, { upsert: false }), `${object.bucket} cross-user upload`);
      tests += 3;

      const otherList = await mustSucceed(
        other.storage.from(object.bucket).list(users[0].id, { limit: 100 }),
        `${object.bucket} cross-user list`,
      );
      assert(otherList.length === 0, `${object.bucket} cross-user list exposed an object.`);
      tests += 1;

      await mustSucceed(owner.storage.from(object.bucket).upload(object.path, updated, {
        contentType: "text/plain",
        upsert: true,
      }), `${object.bucket} owner update`);
      await downloadExpected(
        owner,
        object.bucket,
        object.path,
        updated,
        `${object.bucket} updated owner download`,
      );
      tests += 2;

      const signed = await mustSucceed(
        owner.storage.from(object.bucket).createSignedUrl(object.path, 60),
        `${object.bucket} owner signed URL`,
      );
      const signedResponse = await fetch(`${signed.signedUrl}&policy_test=${randomUUID()}`, { cache: "no-store" });
      assert(signedResponse.ok, `${object.bucket} signed URL was not downloadable.`);
      assert(Buffer.from(await signedResponse.arrayBuffer()).equals(updated), `${object.bucket} signed URL bytes changed.`);
      tests += 1;

      const publicUrl = owner.storage.from(object.bucket).getPublicUrl(object.path).data.publicUrl;
      const publicResponse = await fetch(publicUrl);
      assert(!publicResponse.ok, `${object.bucket} private object was exposed by a public URL.`);
      tests += 1;

      // Storage delete may intentionally return a successful no-op when RLS
      // hides the target row. Verify authorization by checking the bytes remain.
      await other.storage.from(object.bucket).remove([object.path]);
      await downloadExpected(
        owner,
        object.bucket,
        object.path,
        updated,
        `${object.bucket} post-cross-user-delete owner download`,
      );
      tests += 1;

      if (object.bucket === "task-attachments") {
        await mustSucceed(owner.storage.from(object.bucket).remove([object.path]), `${object.bucket} owner delete`);
        tests += 1;
      } else {
        await owner.storage.from(object.bucket).remove([object.path]);
        await downloadExpected(
          owner,
          object.bucket,
          object.path,
          updated,
          `${object.bucket} post-owner-delete download`,
        );
        tests += 1;
      }
    }

    await mustSucceed(
      service.from("user_roles").insert({ user_id: users[1].id, role: "admin" }),
      "controlled admin grant",
    );
    const feedback = testObjects.find((object) => object.bucket === "feedback-screenshots");
    const adminList = await mustSucceed(
      other.storage.from(feedback.bucket).list(users[0].id, { limit: 100 }),
      "feedback admin list",
    );
    assert(adminList.length === 1, "Feedback admin could not list the owner's object.");
    await mustSucceed(other.storage.from(feedback.bucket).download(feedback.path), "feedback admin download");
    await mustSucceed(other.storage.from(feedback.bucket).remove([feedback.path]), "feedback admin delete");
    tests += 3;
  } catch (error) {
    operationError = error;
  } finally {
    for (const object of testObjects) {
      const { error } = await service.storage.from(object.bucket).remove([object.path]);
      if (error) cleanupErrors.push(`${object.bucket} object cleanup: ${error.message}`);
    }
    for (const user of [...users].reverse()) {
      const { error } = await service.auth.admin.deleteUser(user.id);
      if (error) cleanupErrors.push(`Auth user cleanup: ${error.message}`);
    }
    const { data: remainingData, error: remainingError } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (remainingError) {
      cleanupErrors.push(`Auth cleanup verification: ${remainingError.message}`);
    } else {
      const controlledIds = new Set(users.map((user) => user.id));
      for (const user of remainingData.users.filter((candidate) => controlledIds.has(candidate.id))) {
        const { error } = await service.auth.admin.deleteUser(user.id);
        if (error) cleanupErrors.push(`Auth user cleanup retry: ${error.message}`);
      }
    }
  }

  if (operationError) {
    if (cleanupErrors.length > 0) operationError.message += ` Cleanup also failed: ${cleanupErrors.join("; ")}`;
    throw operationError;
  }
  if (cleanupErrors.length > 0) throw new Error(`Controlled test cleanup failed: ${cleanupErrors.join("; ")}`);

  const { data: authData, error: authError } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (authError) throw new Error(`Could not verify Auth cleanup: ${authError.message}`);
  assert(authData.users.length === 25, "Controlled Auth users were not fully cleaned up.");
  assert(await exactCount(service, "profiles") === 24, "Controlled profile rows were not fully cleaned up.");
  assert(await exactCount(service, "subscriptions") === 24, "Controlled subscription rows were not fully cleaned up.");
  assert(await exactCount(service, "user_roles") === 1, "Controlled role rows were not fully cleaned up.");
  for (const bucket of ["feedback-screenshots", "task-attachments"]) {
    const controlled = testObjects.find((object) => object.bucket === bucket);
    const { data, error } = await service.storage.from(bucket).list(controlled.path.split("/").slice(0, -1).join("/"), {
      limit: 100,
    });
    if (error) throw new Error(`Could not verify ${bucket} controlled-object cleanup: ${error.message}`);
    assert(
      !(data ?? []).some((item) => item.name === controlled.path.split("/").at(-1)),
      `${bucket} controlled object cleanup was incomplete.`,
    );
  }

  console.log(JSON.stringify({
    policyAssertionsPassed: tests,
    authUsersAfterCleanup: authData.users.length,
    profilesAfterCleanup: 24,
    subscriptionsAfterCleanup: 24,
    userRolesAfterCleanup: 1,
    storageObjectsAfterCleanup: 43,
  }, null, 2));
}

main().catch((error) => {
  console.error(`Storage policy test failed: ${error.message}`);
  process.exitCode = 1;
});
