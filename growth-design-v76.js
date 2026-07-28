(() => {
  document.title = "Growth OS v7.6";
  const version = document.querySelector(".brand small");
  if (version) {
    const applyVersion = () => {
      if (version.textContent !== "v7.6") version.textContent = "v7.6";
    };
    applyVersion();
    new MutationObserver(applyVersion).observe(version, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }
  document.documentElement.dataset.designSystem = "growth-v76";
})();
