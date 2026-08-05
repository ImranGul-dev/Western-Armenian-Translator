(function () {
  try {
    var stored = localStorage.getItem("wat-theme");
    var systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    var theme = stored === "dark" || stored === "light" ? stored : systemDark ? "dark" : "light";
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch (_) {
    // The page remains usable with the default light theme when storage is unavailable.
  }
})();
