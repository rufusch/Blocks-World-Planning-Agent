const host = document.getElementById("hero-workcell");
const motion = matchMedia("(prefers-reduced-motion: reduce)");

if (!motion.matches && "IntersectionObserver" in window) {
  const observer = new IntersectionObserver(async ([entry]) => {
    if (!entry.isIntersecting) return;
    observer.disconnect();
    const fallback = host.firstElementChild;
    try {
      const { FactoryScene } = await import("./factory.js?v=3");
      const scene = new FactoryScene(host);
      scene.scene.background.set(0x332778);
      scene.scene.fog.color.set(0x332778);
      scene.controls.enabled = false;
      scene.load("automotive");
      scene.setCameraPreset("hero");
      let elapsed = 0, previous = 0, visible = true;
      new IntersectionObserver(([item]) => { visible = item.isIntersecting; }).observe(host);
      function animate(now) {
        if (visible && !document.hidden && !motion.matches) {
          elapsed += previous ? Math.min(now - previous, 70) : 0;
          scene.renderCycle(elapsed % (scene.duration + 1050));
        }
        previous = now;
        requestAnimationFrame(animate);
      }
      requestAnimationFrame(animate);
    } catch {
      host.replaceChildren(fallback);
    }
  });
  observer.observe(host);
}
