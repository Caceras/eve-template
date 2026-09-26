"use client";

import { DownloadIcon, Share2Icon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { shareableImage } from "@/lib/pwa/share";

export type ViewedImage = { readonly url: string; readonly alt: string; readonly name?: string };

const fileName = (url: string) => decodeURIComponent(url.split("/").pop() || "image.png");

/**
 * The image as a file, fetched ahead of a tap on Share: the share sheet only
 * opens within a moment of the tap, too soon to download it then.
 */
export function useShareableImage(image: ViewedImage | null) {
  const [file, setFile] = useState<File | null>(null);
  const url = image?.url;
  const name = image?.name;
  useEffect(() => {
    setFile(null);
    if (!url) return;
    let current = true;
    shareableImage(url, name || fileName(url))
      .then((shareable) => current && setFile(shareable))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [url, name]);
  return file;
}

const toolClass = "size-11 rounded-full text-white hover:bg-white/15 hover:text-white";

/**
 * A full-screen viewer, as a native app opens a picture: black backdrop, the
 * image fitted to the screen (pinch to zoom), Share with the picture itself,
 * Save, and back or Escape to close. It replaces opening the raw file in a
 * browser tab.
 */
export function ImageViewer({
  image,
  onClose,
}: {
  readonly image: ViewedImage | null;
  readonly onClose: () => void;
}) {
  const file = useShareableImage(image);
  const name = image ? image.name || fileName(image.url) : "";
  return (
    <Dialog
      open={Boolean(image)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="top-0 left-0 flex h-full w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 bg-black p-0 text-white shadow-none sm:max-w-none"
        data-image-viewer
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">Image</DialogTitle>
        <DialogDescription className="sr-only">{image?.alt || "Generated image"}</DialogDescription>
        <div className="flex shrink-0 items-center justify-end gap-1 px-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
          {file ? (
            <Button
              aria-label="Share image"
              className={toolClass}
              onClick={() => void navigator.share({ files: [file] }).catch(() => undefined)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Share2Icon className="size-5" />
            </Button>
          ) : null}
          {image ? (
            <Button asChild className={toolClass} size="icon" variant="ghost">
              <a aria-label="Save image" download={name} href={image.url}>
                <DownloadIcon className="size-5" />
              </a>
            </Button>
          ) : null}
          <DialogClose asChild>
            <Button aria-label="Close" className={toolClass} size="icon" variant="ghost">
              <XIcon className="size-5" />
            </Button>
          </DialogClose>
        </div>
        {/* A tap beside the picture closes it, as in a photo viewer. */}
        <div
          className="flex min-h-0 flex-1 items-center justify-center p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
          onClick={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          {image ? (
            <img alt={image.alt} className="max-h-full max-w-full object-contain" src={image.url} />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
