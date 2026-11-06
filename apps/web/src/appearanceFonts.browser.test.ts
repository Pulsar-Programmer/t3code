import { describe, expect, it } from "vite-plus/test";

import "~/index.css";
import "~/celedus.css";
import { applyAppearanceFontVariables } from "./appearanceFonts";

function renderedFontSize(style: (probe: HTMLElement) => void): string {
  const probe = document.createElement("div");
  style(probe);
  document.body.append(probe);
  try {
    return getComputedStyle(probe).fontSize;
  } finally {
    probe.remove();
  }
}

const composerFontSize = () =>
  renderedFontSize((probe) => {
    // The composer editor's own size class.
    probe.className = "text-(length:--font-size-prompt,var(--text-sm))";
  });

const touchComposerFontSize = () =>
  renderedFontSize((probe) => {
    probe.style.fontSize = "var(--font-size-prompt-touch)";
  });

describe("applyAppearanceFontVariables", () => {
  it("sizes the composer from the interface size until fonts are set separately", () => {
    const root = document.documentElement;
    const style = root.getAttribute("style");
    const preferences = {
      sans: "",
      code: "",
      composer: "",
      sizeInterface: 20,
      sizePrompt: 14,
      sizeCode: 13,
      smoothing: true,
    };
    try {
      applyAppearanceFontVariables(root, { ...preferences, separate: false });
      expect(composerFontSize()).toBe("17.5px");
      expect(touchComposerFontSize()).toBe("17.5px");

      applyAppearanceFontVariables(root, { ...preferences, separate: true });
      expect(composerFontSize()).toBe("14px");
      // iOS zooms into inputs under 16px.
      expect(touchComposerFontSize()).toBe("16px");
    } finally {
      if (style === null) root.removeAttribute("style");
      else root.setAttribute("style", style);
    }
  });

  it("keeps Celedus fonts as defaults only, so user font preferences win", () => {
    const root = document.documentElement;
    const style = root.getAttribute("style");
    const uiTheme = root.dataset.uiTheme;
    const preferences = {
      sans: "",
      code: "",
      composer: "",
      sizeInterface: 16,
      sizePrompt: 14,
      sizeCode: 13,
      smoothing: true,
      separate: false,
    };
    const code = document.createElement("code");
    document.body.append(code);
    try {
      root.dataset.uiTheme = "celedus";
      applyAppearanceFontVariables(root, preferences);
      expect(getComputedStyle(document.body).fontFamily).toContain("P22 Mackinac Pro");
      expect(getComputedStyle(code).fontFamily).toContain("Fira Code");

      applyAppearanceFontVariables(root, {
        ...preferences,
        sans: "Comic Sans MS",
        code: "Courier",
        smoothing: false,
      });
      expect(getComputedStyle(document.body).fontFamily).toMatch(/^"Comic Sans MS"/);
      expect(getComputedStyle(code).fontFamily).toMatch(/^Courier/);
      expect(getComputedStyle(document.body).getPropertyValue("-webkit-font-smoothing")).toBe(
        "auto",
      );
    } finally {
      code.remove();
      if (uiTheme === undefined) delete root.dataset.uiTheme;
      else root.dataset.uiTheme = uiTheme;
      if (style === null) root.removeAttribute("style");
      else root.setAttribute("style", style);
    }
  });

  it("lets color themes, contrast, and glass opacity reach Celedus components", () => {
    const root = document.documentElement;
    const style = root.getAttribute("style");
    const kbd = document.createElement("kbd");
    kbd.dataset.slot = "kbd";
    document.body.append(kbd);
    const kbdColors = () => {
      const computed = getComputedStyle(kbd);
      return { background: computed.backgroundColor, border: computed.borderTopColor };
    };
    const panels = ["dropdown-glass", "dialog-glass", "surface-glass", "alert-glass"].map(
      (className) => {
        const panel = document.createElement("div");
        panel.className = className;
        document.body.append(panel);
        return panel;
      },
    );
    try {
      root.dataset.uiTheme = "celedus";
      // Theme tokens are generated at runtime; the contrast mix needs a foreground.
      root.style.setProperty("--foreground", "rgb(250, 250, 250)");
      const paper = kbdColors();

      root.dataset.themeId = "test-theme";
      root.style.setProperty("--secondary", "rgb(1, 2, 3)");
      root.style.setProperty("--border", "rgb(4, 5, 6)");
      expect(kbdColors().background).toBe("rgb(1, 2, 3)");
      expect(kbdColors().border).toBe("color(srgb 0.0156863 0.0196078 0.0235294)");

      delete root.dataset.themeId;
      root.style.removeProperty("--secondary");
      root.style.removeProperty("--border");
      root.style.setProperty("--appearance-contrast-border-boost", "50%");
      expect(kbdColors().border).not.toBe(paper.border);

      root.style.setProperty("--glass-opacity", "100%");
      root.style.setProperty("--glass-backdrop-filter", "none");
      const solid = panels.map((panel) => getComputedStyle(panel).backgroundColor);
      panels.forEach((panel) => expect(getComputedStyle(panel).backdropFilter).toBe("none"));
      root.style.setProperty("--glass-opacity", "40%");
      root.style.removeProperty("--glass-backdrop-filter");
      panels.forEach((panel, index) => {
        expect(getComputedStyle(panel).backgroundColor).not.toBe(solid[index]);
        expect(getComputedStyle(panel).backdropFilter).toContain("blur(12px)");
      });
    } finally {
      panels.forEach((panel) => panel.remove());
      kbd.remove();
      delete root.dataset.uiTheme;
      delete root.dataset.themeId;
      if (style === null) root.removeAttribute("style");
      else root.setAttribute("style", style);
    }
  });
});
