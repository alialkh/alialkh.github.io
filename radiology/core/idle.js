// Control bar auto-hide. While busy() allows it, the stage goes idle after a few still seconds and the bar fades.
const IDLE_MS = 3000;

// :focus-visible needs Safari 15.4. Before that, any focus inside the bar keeps it up.
const keyboardFocus = el => {
  try {
    return el.matches(':focus-visible');
  } catch {
    return true;
  }
};

// Returns wake(), which shows the bar and restarts the countdown. Pointer, focus and keys already call it.
export function autoHide(stage, bar, busy) {
  let timer = 0;
  const engaged = () => bar.matches(':hover') || (bar.contains(document.activeElement) && keyboardFocus(document.activeElement));
  function wake() {
    stage.classList.remove('idle');
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (busy() && !engaged()) stage.classList.add('idle');
    }, IDLE_MS);
  }
  for (const type of ['pointermove', 'pointerdown', 'focusin']) stage.addEventListener(type, wake);
  addEventListener('keydown', wake);
  return wake;
}
