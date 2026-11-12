import { defineConfig, devices } from "@playwright/test";

function normalizeBasePath(raw?: string): string {
  if (!raw || raw.trim() === "" || raw.trim() === "/") {
    return "/";
  }
  const trimmed = raw.trim().replace(/^\/+|\/+$/g, "");
  return trimmed ? `/${trimmed}/` : "/";
}

const basePath = normalizeBasePath(process.env.VITE_BASE_PATH ?? "/sgi-bestiary/");
const previewBaseUrl = `http://localhost:4173${basePath}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  fullyParallel: false,
  reporter: "list",
  use: {
    baseURL: previewBaseUrl,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run preview",
    url: previewBaseUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 20000,
  },
});
