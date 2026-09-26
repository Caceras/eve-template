"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ImageIcon, PlusIcon, DownloadIcon, Share2Icon, Trash2Icon } from "lucide-react";
import { ImageViewer, useShareableImage, type ViewedImage } from "@/components/chat/image-viewer";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useChatShell } from "./chat-shell-context";
import { PageSignInButton } from "./page-sign-in";
import { LoadError } from "./load-error";
import type { MediaItem } from "@/lib/media-store";
export function ImagesPage() {
  const { viewer, requestSignIn } = useChatShell();
  const router = useRouter();
  const [images, setImages] = useState<MediaItem[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // The first page: an empty state only after a load that worked.
  const [loaded, setLoaded] = useState(false);
  const [failedAt, setFailedAt] = useState<number | null>(null);
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [viewing, setViewing] = useState<ViewedImage | null>(null);
  const shareable = useShareableImage(
    selected ? { url: selected.url, alt: "", name: selected.name } : null,
  );
  const [confirm, setConfirm] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const load = useCallback(
    async (offset = 0) => {
      if (!viewer) {
        setImages([]);
        return;
      }
      setLoading(true);
      setFailedAt(null);
      try {
        const response = await fetch(`/api/images?offset=${offset}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Could not load images.");
        const data = await response.json();
        setImages((previous) => (offset ? [...previous, ...data.images] : data.images));
        setNext(data.next);
        setTruncated(data.truncated);
        setLoaded(true);
      } catch {
        setFailedAt(offset);
      } finally {
        setLoading(false);
      }
    },
    [viewer],
  );
  useEffect(() => {
    void load();
  }, [load]);
  function create() {
    if (!viewer) {
      requestSignIn();
      return;
    }
    try {
      window.sessionStorage.setItem("eve-chat-draft", "Create an image of ");
    } catch {
      // Without storage the chat simply opens empty.
    }
    router.push("/");
  }
  async function remove() {
    if (!selected || loading) return;
    if (!confirm) {
      setConfirm(true);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", name: selected.name }),
      });
      if (!response.ok) throw new Error("Could not delete the image.");
      setSelected(null);
      await load();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not delete image.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-4 pb-16 pt-16 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Images</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Images made in your conversations, kept on your server.
            </p>
          </div>
          <Button className="min-h-11 shrink-0" onClick={create}>
            <PlusIcon className="size-4" />
            Create
          </Button>
        </div>
        {!viewer ? (
          <div className="mt-8 rounded-xl border p-6">
            <p className="mb-4 text-sm text-muted-foreground">
              Sign in to view your private images.
            </p>
            <PageSignInButton />
          </div>
        ) : images.length ? (
          <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {images.map((image) => (
              <button
                key={image.name}
                className="group overflow-hidden rounded-xl border text-left focus-visible:outline-2 focus-visible:outline-ring"
                onClick={() => {
                  setSelected(image);
                  setConfirm(false);
                }}
              >
                <div className="aspect-square overflow-hidden bg-muted">
                  <img
                    loading="lazy"
                    src={image.url}
                    alt={image.prompt?.slice(0, 200) || "Generated image"}
                    className="size-full object-cover transition-transform group-hover:scale-[1.02] motion-reduce:transform-none"
                  />
                </div>
                <p className="truncate px-3 py-2 text-xs text-muted-foreground">
                  {image.prompt || new Date(image.createdAt).toLocaleDateString()}
                </p>
              </button>
            ))}
          </div>
        ) : failedAt !== null ? (
          <LoadError
            className="mt-8"
            message="Couldn't load your images. Check the connection and try again."
            onRetry={() => void load()}
          />
        ) : (
          loaded &&
          !loading && (
            <div className="mt-8 rounded-xl border border-dashed p-10 text-center">
              <ImageIcon className="mx-auto size-8 text-muted-foreground" />
              <h2 className="mt-4 font-medium">Your first image starts in chat</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Describe a picture in chat and Ægentica makes it; every image you create is kept
                here. Creating images needs a working provider key.
              </p>
              <Button className="mt-5 min-h-11" variant="outline" onClick={create}>
                Create an image
              </Button>
            </div>
          )
        )}
        {viewer && (loading || !loaded) && failedAt === null && (
          <p role="status" className="py-6 text-sm text-muted-foreground">
            Loading images...
          </p>
        )}
        {images.length > 0 && failedAt !== null && (
          <LoadError
            message="Couldn't load images. Check the connection and try again."
            onRetry={() => void load(failedAt)}
          />
        )}
        {next !== null && (
          <Button
            disabled={loading}
            className="mt-5 min-h-11"
            variant="outline"
            onClick={() => void load(next)}
          >
            Load more
          </Button>
        )}
        {truncated && (
          <p className="mt-4 text-xs text-muted-foreground">
            This view is limited to 1,000 files. Older images remain on the server.
          </p>
        )}
        <Dialog
          open={Boolean(selected)}
          onOpenChange={(open) => {
            if (!open) setSelected(null);
          }}
        >
          <DialogContent className="max-h-[90%] max-w-3xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Image</DialogTitle>
              <DialogDescription>{selected?.model || "Generated in chat"}</DialogDescription>
            </DialogHeader>
            {selected && (
              <>
                <button
                  aria-label="View full screen"
                  className="block rounded-lg focus-visible:outline-2 focus-visible:outline-ring"
                  onClick={() =>
                    setViewing({
                      url: selected.url,
                      alt: selected.prompt?.slice(0, 200) || "Generated image",
                      name: selected.name,
                    })
                  }
                  type="button"
                >
                  <img
                    src={selected.url}
                    alt={selected.prompt?.slice(0, 200) || "Generated image"}
                    className="max-h-[55dvh] w-full rounded-lg object-contain"
                  />
                </button>
                {selected.prompt && <p className="text-sm leading-6">{selected.prompt}</p>}
                <div className="flex flex-wrap justify-between gap-3">
                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline" className="min-h-11">
                      <a href={selected.url} download={selected.name}>
                        <DownloadIcon className="size-4" />
                        Save image
                      </a>
                    </Button>
                    {shareable ? (
                      <Button
                        className="min-h-11"
                        onClick={() =>
                          void navigator.share({ files: [shareable] }).catch(() => undefined)
                        }
                        variant="outline"
                      >
                        <Share2Icon className="size-4" />
                        Share
                      </Button>
                    ) : null}
                  </div>
                  <Button
                    disabled={loading}
                    variant={confirm ? "destructive" : "ghost"}
                    className="min-h-11"
                    onClick={() => void remove()}
                  >
                    <Trash2Icon className="size-4" />
                    {confirm ? "Confirm delete" : "Delete"}
                  </Button>
                </div>
                {confirm && (
                  <p className="text-xs text-muted-foreground">
                    This also removes the image from any conversation that displays it.
                  </p>
                )}
                {error && (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                )}
              </>
            )}
          </DialogContent>
        </Dialog>
        <ImageViewer image={viewing} onClose={() => setViewing(null)} />
      </div>
    </div>
  );
}
