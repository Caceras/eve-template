import { describe, expect, it } from "vitest";
import {
  deliveredTaskResultIds,
  pendingCompletionGroups,
  readTaskCompletion,
} from "#tasks/completion-delivery.js";

const cohorts = new Map([
  ["research", { cohortId: "report", createdByTurnId: "turn-1", settled: true }],
  ["review", { cohortId: "report", createdByTurnId: "turn-2", settled: false }],
  ["other", { cohortId: "other", createdByTurnId: "turn-3", settled: false }],
]);

describe("completion delivery", () => {
  it("holds a bundle without coupling independent groups", () => {
    expect(
      pendingCompletionGroups({
        cohorts,
        completedTaskIds: new Set(["review"]),
        cancelledTaskIds: new Set(),
        release: "all",
      }),
    ).toEqual(new Set(["other"]));
  });

  it("can release available results while another group member is pending", () => {
    const input = {
      cohorts,
      completedTaskIds: new Set<string>(),
      cancelledTaskIds: new Set<string>(),
    };
    expect(pendingCompletionGroups({ ...input, release: "all" })).toEqual(
      new Set(["report", "other"]),
    );
    expect(pendingCompletionGroups({ ...input, release: "available" })).toEqual(new Set());
  });

  it("includes terminal siblings from the delivered group only", () => {
    expect(deliveredTaskResultIds("research", cohorts)).toEqual(["research"]);
    expect(deliveredTaskResultIds("review", cohorts)).toEqual(["review", "research"]);
    expect(deliveredTaskResultIds(undefined, cohorts)).toEqual([]);
  });

  it("receives the explicit result even when the task snapshot is absent", () => {
    expect(deliveredTaskResultIds("research", new Map())).toEqual(["research"]);
  });

  it("does not confuse progress or human input with a terminal result", () => {
    for (const taskDeliveryId of ["task:input:request", "task:update:1", "task:message:1"]) {
      expect(readTaskCompletion({ kind: "deliver", payloads: [], taskDeliveryId })).toBeUndefined();
    }
    expect(
      readTaskCompletion({ kind: "deliver", payloads: [], taskDeliveryId: "task:ready:failed" }),
    ).toEqual({
      taskId: "task",
      status: "failed",
    });
  });
});
