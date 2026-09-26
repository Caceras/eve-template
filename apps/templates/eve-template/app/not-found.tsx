import { NotFoundState } from "@/app/_components/not-found-state";

export default function NotFound() {
  return (
    <NotFoundState
      standalone
      title="Page not found"
      description="This address doesn't lead anywhere in Ægentica."
    />
  );
}
