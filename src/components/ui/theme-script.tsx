const STORAGE_KEY = "nextset-theme";

export function ThemeScript() {
  const source = `
(() => {
  try {
    const stored = localStorage.getItem("${STORAGE_KEY}");
    const mode = stored === "dark" || stored === "light" ? stored : "system";
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const dark = mode === "dark" || (mode === "system" && prefersDark);
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  } catch {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.classList.toggle("dark", prefersDark);
    document.documentElement.style.colorScheme = prefersDark ? "dark" : "light";
  }
})();
`;

  return <script dangerouslySetInnerHTML={{ __html: source }} />;
}
