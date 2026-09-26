import { NotFoundState } from "@/app/_components/not-found-state";

export default function ChatNotFound() {
  return (
    <NotFoundState
      title="Chat not found"
      description="It may have been deleted, or it belongs to another sign-in."
    />
  );
}
