(() => {
  window.GROWTH_VERSION = "7.9";
  const versionLabel = `v${window.GROWTH_VERSION}`;
  document.title = `Growth OS ${versionLabel}`;
  const version = document.querySelector(".brand small");
  if (version) {
    const applyVersion = () => {
      if (version.textContent !== versionLabel) version.textContent = versionLabel;
    };
    applyVersion();
    new MutationObserver(applyVersion).observe(version, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }
  document.documentElement.dataset.designSystem = "growth-v79";
})();
