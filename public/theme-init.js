(function () {
  try {
    var stored = localStorage.getItem("wat-theme");
    var theme = stored === "dark" || stored === "light" ? stored : "light";
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch (_) {
    // The page remains usable with the default light theme when storage is unavailable.
  }
})();
