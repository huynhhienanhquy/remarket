import { useState } from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Dialog } from "./Dialog";
import { Drawer } from "../Drawer/Drawer";

afterEach(() => vi.restoreAllMocks());

function Modals() {
  const [drawer, setDrawer] = useState(false);
  const [dialog, setDialog] = useState(false);
  return <>
    <button onClick={() => setDrawer(true)}>Open drawer</button>
    <Drawer open={drawer} onClose={() => setDrawer(false)} title="Drawer">
      <button onClick={() => setDialog(true)}>Confirm action</button>
    </Drawer>
    <Dialog open={dialog} onClose={() => setDialog(false)} title="Confirm">
      <button>First</button><button>Last</button>
      <button onClick={() => setDrawer(false)}>Remove parent</button>
    </Dialog>
  </>;
}

describe("stacked modal interaction", () => {
  it("traps only the top panel, closes only it on Escape, and restores focus/scroll", async () => {
    vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
    document.body.style.overflow = "auto";
    render(<Modals />);
    const user = userEvent.setup();
    await user.click(screen.getByText("Open drawer"));
    await user.click(screen.getByText("Confirm action"));
    const panel = screen.getByRole("dialog", { name: "Confirm" });
    within(panel).getByText("First").focus();
    await user.tab();
    expect(within(panel).getByText("Last")).toHaveFocus();
    await user.tab({ shift: true });
    expect(within(panel).getByText("First")).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Confirm" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Drawer" })).toBeInTheDocument();
    expect(screen.getByText("Confirm action")).toHaveFocus();
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByText("Open drawer")).toHaveFocus();
    expect(document.body.style.overflow).toBe("auto");
    document.body.style.overflow = "";
  });
  it("keeps scroll locked when a lower modal unmounts first", async () => {
    render(<Modals />);
    const user = userEvent.setup();
    await user.click(screen.getByText("Open drawer"));
    await user.click(screen.getByText("Confirm action"));
    await user.click(screen.getByText("Remove parent"));
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.body.style.overflow).toBe("");
    expect(screen.getByText("Open drawer")).toHaveFocus();
  });
});
