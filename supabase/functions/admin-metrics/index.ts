import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Verify admin role from auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // ─── USER HEALTH ───
    const { data: allSubs } = await supabase.from("subscriptions").select("user_id, status, lifetime_access, trial_end, trial_start, created_at, plan, stripe_customer_id");
    const { data: allProfiles } = await supabase.from("profiles").select("id, display_name, created_at");
    const { data: allTasks } = await supabase.from("tasks").select("user_id, created_at, updated_at, completed");

    const totalUsers = allSubs?.length || 0;
    const newUsers24h = (allSubs || []).filter(s => new Date(s.created_at) >= oneDayAgo).length;
    const newUsers7d = (allSubs || []).filter(s => new Date(s.created_at) >= sevenDaysAgo).length;

    // DAU: users who updated a task today
    const today = now.toISOString().split("T")[0];
    const activeToday = new Set((allTasks || []).filter(t => t.updated_at?.startsWith(today)).map(t => t.user_id));
    const dau = activeToday.size;

    // WAU: users active in last 7 days
    const activeWeek = new Set(
      (allTasks || []).filter(t => new Date(t.updated_at) >= sevenDaysAgo).map(t => t.user_id)
    );
    const wau = activeWeek.size;

    // Retention proxy: users active >1 day in last 7
    const userDayCounts = new Map<string, Set<string>>();
    (allTasks || []).filter(t => new Date(t.updated_at) >= sevenDaysAgo).forEach(t => {
      const day = t.updated_at.split("T")[0];
      if (!userDayCounts.has(t.user_id)) userDayCounts.set(t.user_id, new Set());
      userDayCounts.get(t.user_id)!.add(day);
    });
    const multiDayUsers = Array.from(userDayCounts.values()).filter(days => days.size > 1).length;
    const retentionPct = totalUsers > 0 ? Math.round((multiDayUsers / totalUsers) * 100) : 0;

    // Tasks per user
    const tasksByUser = new Map<string, number>();
    (allTasks || []).forEach(t => {
      tasksByUser.set(t.user_id, (tasksByUser.get(t.user_id) || 0) + 1);
    });
    const avgTasksPerUser = totalUsers > 0 ? Math.round(Array.from(tasksByUser.values()).reduce((a, b) => a + b, 0) / totalUsers) : 0;

    // Dormant users (no activity in 7+ days)
    const dormantUsers = totalUsers > 0
      ? (allSubs || []).filter(s => !activeWeek.has(s.user_id)).length
      : 0;
    const dormantPct = totalUsers > 0 ? Math.round((dormantUsers / totalUsers) * 100) : 0;

    // DAU over time (last 14 days)
    const dauOverTime: { date: string; value: number }[] = [];
    const newUsersOverTime: { date: string; value: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const ds = d.toISOString().split("T")[0];
      const dayActive = new Set(
        (allTasks || []).filter(t => t.updated_at?.startsWith(ds)).map(t => t.user_id)
      );
      dauOverTime.push({ date: ds, value: dayActive.size });
      const newU = (allSubs || []).filter(s => s.created_at.startsWith(ds)).length;
      newUsersOverTime.push({ date: ds, value: newU });
    }

    // ─── RELIABILITY ───
    const totalTaskOps = (allTasks || []).length;
    const completedTasks = (allTasks || []).filter(t => t.completed).length;

    // ─── DATABASE SIZE ───
    let dbSizeBytes = 0;
    try {
      const { data: dbSize } = await supabase.rpc('pg_database_size' as any, {} as any).maybeSingle();
      // Fallback: estimate from row counts
    } catch {}
    // Use task count as rough proxy: ~1KB per task row
    const estimatedDbBytes = totalTaskOps * 1024 + (allSubs?.length || 0) * 512;

    // ─── STORAGE / COST ───
    const { data: storageObjects } = await supabase
      .storage
      .from("task-attachments")
      .list("", { limit: 1000 });

    // Get all files recursively by listing user folders
    let totalStorageBytes = 0;
    let totalFiles = 0;
    const userStorageMap = new Map<string, number>();

    // List top-level folders (task IDs and library/ prefix)
    const topFolders = storageObjects || [];
    for (const folder of topFolders) {
      if (folder.metadata) {
        // It's a file at root level
        totalStorageBytes += (folder.metadata as any)?.size || 0;
        totalFiles++;
      } else {
        // It's a folder, list contents
        const { data: files } = await supabase
          .storage
          .from("task-attachments")
          .list(folder.name, { limit: 500 });
        if (files) {
          for (const f of files) {
            const size = (f.metadata as any)?.size || 0;
            totalStorageBytes += size;
            totalFiles++;
            // Attribute to folder (task id or library/id)
            const uid = folder.name;
            userStorageMap.set(uid, (userStorageMap.get(uid) || 0) + size);
          }
        }
      }
    }

    const totalStorageGB = totalStorageBytes / (1024 * 1024 * 1024);
    const avgFileSize = totalFiles > 0 ? totalStorageBytes / totalFiles : 0;
    const filesPerUser = totalUsers > 0 ? Math.round(totalFiles / totalUsers * 10) / 10 : 0;

    // Top storage users
    const topStorageUsers = Array.from(userStorageMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, bytes]) => ({ id: id.slice(0, 12), bytes }));

    // Subscription breakdown
    const activeUsers = (allSubs || []).filter(s =>
      s.status === "active" || (s.status === "trialing" && new Date(s.trial_end) > now)
    ).length;
    const paidUsers = (allSubs || []).filter(s => s.status === "active" && !s.lifetime_access).length;
    const lifetimeUsers = (allSubs || []).filter(s => s.lifetime_access).length;
    const trialUsers = (allSubs || []).filter(s => s.status === "trialing" && new Date(s.trial_end) > now).length;

    // Revenue
    const monthlyRevenue = (allSubs || [])
      .filter(s => s.status === "active" && !s.lifetime_access)
      .reduce((sum, s) => sum + (s.plan === "yearly" ? 2 : 3), 0);

    // ─── ALERTS ───
    const alerts: { severity: "critical" | "warning" | "info"; message: string; source: string; time: string }[] = [];

    if (dormantPct > 60) {
      alerts.push({ severity: "warning", message: `${dormantPct}% of users dormant (7d+)`, source: "users", time: now.toISOString() });
    }
    if (dau === 0 && totalUsers > 0) {
      alerts.push({ severity: "warning", message: "No active users today", source: "users", time: now.toISOString() });
    }
    if (retentionPct < 30 && totalUsers > 2) {
      alerts.push({ severity: "warning", message: `Low repeat usage: ${retentionPct}% retention`, source: "users", time: now.toISOString() });
    }
    if (newUsers7d === 0 && totalUsers > 0) {
      alerts.push({ severity: "info", message: "No new users in 7 days", source: "users", time: now.toISOString() });
    }
    if (totalStorageGB > 1) {
      alerts.push({ severity: "warning", message: `Storage at ${totalStorageGB.toFixed(2)} GB`, source: "cost", time: now.toISOString() });
    }

    // Health status
    const criticalAlerts = alerts.filter(a => a.severity === "critical").length;
    const warningAlerts = alerts.filter(a => a.severity === "warning").length;
    const healthStatus = criticalAlerts > 0 ? "critical" : warningAlerts > 0 ? "warning" : "healthy";
    const healthMessage = criticalAlerts > 0
      ? alerts.find(a => a.severity === "critical")!.message
      : warningAlerts > 0
        ? alerts.find(a => a.severity === "warning")!.message
        : "All systems nominal";

    const metrics = {
      health: { status: healthStatus, message: healthMessage },
      userHealth: {
        totalUsers,
        newUsers24h,
        newUsers7d,
        dau,
        wau,
        retentionPct,
        avgTasksPerUser,
        dormantPct,
        dauOverTime,
        newUsersOverTime,
        activeUsers,
        paidUsers,
        lifetimeUsers,
        trialUsers,
        monthlyRevenue,
      },
      reliability: {
        totalTaskOps,
        completedTasks,
        completionRate: totalTaskOps > 0 ? Math.round((completedTasks / totalTaskOps) * 100) : 0,
      },
      performance: {
        // These would need real APM data; using DB task count as proxy
        totalQueries: totalTaskOps,
      },
      cost: {
        totalStorageGB: Math.round(totalStorageGB * 1000) / 1000,
        totalStorageBytes,
        totalFiles,
        avgFileSize: Math.round(avgFileSize / 1024), // KB
        filesPerUser,
        topStorageUsers,
        estimatedDbBytes,
        // Free tier (ci_pico) limits
        limits: {
          storageBytes: 1 * 1024 * 1024 * 1024,       // 1 GB
          egressBytes: 2 * 1024 * 1024 * 1024,         // 2 GB
          dbSizeBytes: 500 * 1024 * 1024,              // 500 MB
          mau: 50000,
          edgeFunctionInvocations: 500000,
          edgeFunctionCount: 25,
          realtimeMessages: 2000000,
          realtimeConnections: 200,
        },
      },
      alerts,
      users: (allSubs || []).map(s => ({
        user_id: s.user_id,
        status: s.status,
        plan: s.plan,
        lifetime_access: s.lifetime_access,
        trial_end: s.trial_end,
        created_at: s.created_at,
        stripe_customer_id: s.stripe_customer_id,
        display_name: (allProfiles || []).find(p => p.id === s.user_id)?.display_name || null,
        taskCount: tasksByUser.get(s.user_id) || 0,
        lastActive: (allTasks || [])
          .filter(t => t.user_id === s.user_id)
          .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0]?.updated_at || null,
      })),
    };

    return new Response(JSON.stringify(metrics), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Admin metrics error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
