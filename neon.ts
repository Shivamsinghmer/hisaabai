import { defineConfig } from "@neon/config/v1";

const LONG_LIVED_BRANCHES = new Set(["dev", "test"]);

export default defineConfig({
  // Declare your Neon services here
  auth: true,
  // Branch policy: per-branch tuning
  branch: (branch) => {
    if (branch.isDefault) {
      // Default branch: no overrides, uses project defaults
      return {};
    }
    if (!branch.exists && LONG_LIVED_BRANCHES.has(branch.name)) {
      // Shared team branches (local development, CI tests): never expire
      return {};
    }
    if (!branch.exists) {
      // Other new non-default branches (experiments, previews): auto-expire
      // Run `neon checkout <name>` to create a new branch with these settings
      return { ttl: "7d" };
    }
    // Existing branch: no changes
    return {};
  },
});
