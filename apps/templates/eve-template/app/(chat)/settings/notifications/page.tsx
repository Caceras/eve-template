import type { Metadata } from "next";
import { NotificationSettings } from "@/app/_components/device-settings";

export const metadata: Metadata = { title: "Notifications" };

export default function NotificationsPage() {
  return <NotificationSettings />;
}
