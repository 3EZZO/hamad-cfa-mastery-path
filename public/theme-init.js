// Restore the explicit device preference before the application paints.
try {
  var masteryTheme = localStorage.getItem("hamad-mastery-theme") === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = masteryTheme;
  document.documentElement.style.colorScheme = masteryTheme === "dark" ? "dark" : "only light";
} catch (_) { /* The default light theme works without browser storage. */ }
