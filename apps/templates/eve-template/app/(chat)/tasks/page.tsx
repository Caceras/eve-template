import type { Metadata } from "next";
import { TasksPage } from "@/app/_components/tasks-page";

export const metadata: Metadata = { title: "Tasks" };

export default function Tasks() {
  return <TasksPage />;
}
