"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ImageIcon, PlusIcon, DownloadIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useChatShell } from "./chat-shell-context";
import { updateComposerDraft } from "@/lib/chat/composer-draft";
import type { MediaItem } from "@/lib/media-store";
export function ImagesPage() {
  const { viewer, requestSignIn } = useChatShell();
  const router = useRouter();
  const [images, setImages] = useState<MediaItem[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const load = useCallback(
    async (offset = 0) => {
      if (!viewer) {
        setImages([]);
        return;
      }
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/images?offset=${offset}`, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load images.");
        setImages((previous) => (offset ? [...previous, ...data.images] : data.images));
        setNext(data.next);
        setTruncated(data.truncated);
      } catch (error) {
        setError(error instanceof Error ? error.message : "Could not load images.");
      } finally {
        setLoading(false);
      }
    },
    [viewer],
  );
  useEffect(() => {
    void load();
  }, [load]);
  async function create() {
    if (!viewer) {
      requestSignIn();
      return;
    }
    try {
      await updateComposerDraft("new", { mode: "image" });
      router.push("/");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not prepare chat.");
    }
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
          <Button className="min-h-11 shrink-0" onClick={() => void create()}>
            <PlusIcon className="size-4" />
            Create
          </Button>
        </div>
        {error && (
          <p className="mt-4 text-sm text-destructive" role="alert">
            {error}{" "}
            <button className="underline" onClick={() => void load()}>
              Retry
            </button>
          </p>
        )}
        {!viewer ? (
          <div className="mt-8 rounded-xl border p-6">
            <p className="mb-4 text-sm text-muted-foreground">
              Sign in to view your private images.
            </p>
            <Button onClick={() => requestSignIn()}>Sign in</Button>
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
        ) : (
          !loading && (
            <div className="mt-8 rounded-xl border border-dashed p-10 text-center">
              <ImageIcon className="mx-auto size-8 text-muted-foreground" />
              <h2 className="mt-4 font-medium">Your first image starts in chat</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Choose Image in the composer and describe what to make. Generation requires a
                working provider key.
              </p>
              <Button className="mt-5 min-h-11" variant="outline" onClick={() => void create()}>
                Create an image
              </Button>
            </div>
          )
        )}
        {loading && (
          <p role="status" className="py-6 text-sm text-muted-foreground">
            Loading images...
          </p>
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
          <DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Image</DialogTitle>
              <DialogDescription>{selected?.model || "Generated in chat"}</DialogDescription>
            </DialogHeader>
            {selected && (
              <>
                <img
                  src={selected.url}
                  alt={selected.prompt?.slice(0, 200) || "Generated image"}
                  className="max-h-[55dvh] w-full rounded-lg object-contain"
                />
                {selected.prompt && <p className="text-sm leading-6">{selected.prompt}</p>}
                <div className="flex flex-wrap justify-between gap-3">
                  <Button asChild variant="outline" className="min-h-11">
                    <a href={selected.url} download={selected.name}>
                      <DownloadIcon className="size-4" />
                      Save image
                    </a>
                  </Button>
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
      </div>
    </div>
  );
}
