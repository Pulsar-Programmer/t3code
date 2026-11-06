import { describe, expect, it } from "vite-plus/test";

import { shouldTypeToFocusComposer } from "./composerFocusRedirect";

describe("shouldTypeToFocusComposer", () => {
  it("leaves letters to an open context menu so its item shortcuts work", () => {
    const menu = document.createElement("div");
    menu.dataset.contextMenu = "true";
    menu.setAttribute("role", "menu");
    menu.tabIndex = -1;
    document.body.append(menu);
    try {
      menu.focus();
      const event = new KeyboardEvent("keydown", { key: "r", bubbles: true });
      menu.dispatchEvent(event);
      expect(shouldTypeToFocusComposer(event)).toBe(false);
    } finally {
      menu.remove();
    }
  });
});
