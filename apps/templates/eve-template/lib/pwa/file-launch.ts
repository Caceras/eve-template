"use client";
import {
  ATTACHABLE,
  asAttachment,
  readComposerDraft,
  updateComposerDraft,
} from "@/lib/chat/composer-draft";

type LaunchQueue = {
  setConsumer: (consumer: (params: { files?: readonly FileSystemFileHandle[] }) => void) => void;
};

/**
 * Desktop "Open with Ægentica" (the manifest's file_handlers): the operating
 * system launches the app on /, and the files become attachments of the
 * new-chat draft, as a share from Android's share sheet does.
 */
export function receiveLaunchedFiles() {
  const queue = (window as unknown as { launchQueue?: LaunchQueue }).launchQueue;
  queue?.setConsumer(({ files }) => {
    if (!files?.length) return;
    void Promise.all(files.map((handle) => handle.getFile()))
      .then(async (opened) => {
        const attachable = opened.map(asAttachment).filter((file) => ATTACHABLE.test(file.type));
        if (!attachable.length) return;
        const draft = await readComposerDraft("new");
        await updateComposerDraft("new", { files: [...draft.files, ...attachable].slice(-4) });
      })
      .catch(() => undefined);
  });
}
