import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { previewStateForWorkspace } from "../scripts/public-preview.mjs";

describe("public preview workspace ownership", () => {
  const workspace = path.resolve("current-project");
  const previous = { workspace: path.resolve("old-project"), server: { pid: 10 }, tunnel: { pid: 20 } };

  it("allows a moved project to replace a stopped preview record", async () => {
    const checked = [];
    const state = await previewStateForWorkspace(previous, workspace, async (record) => {
      checked.push(record.pid);
      return false;
    });
    assert.equal(state, null);
    assert.deepEqual(checked.sort((a, b) => a - b), [10, 20]);
  });

  for (const livePid of [10, 20]) {
    it(`protects another project's live ${livePid === 10 ? "server" : "tunnel"}`, async () => {
      await assert.rejects(
        previewStateForWorkspace(previous, workspace, async (record) => record.pid === livePid),
        /running from another workspace/,
      );
    });
  }

  it("retains this project's records for normal status and cleanup", async () => {
    const state = { ...previous, workspace };
    assert.equal(await previewStateForWorkspace(state, workspace, () => assert.fail("Ownership already matches.")), state);
    assert.equal(await previewStateForWorkspace(null, workspace), null);
  });

  it("recognizes Windows paths regardless of drive and folder capitalization", { skip: process.platform !== "win32" }, async () => {
    const state = { ...previous, workspace: workspace.toUpperCase() };
    assert.equal(await previewStateForWorkspace(state, workspace, () => assert.fail("Ownership already matches.")), state);
  });
});
