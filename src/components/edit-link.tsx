import { getSpooClient, withAuthRetry } from "@/api/spoo";
import { LinkForm, type LinkFormValues } from "@/components/link-form";
import { reportError } from "@/lib/errors";
import type { LinkItem } from "@/lib/links";
import { Toast, showToast, useNavigation } from "@raycast/api";
import { useState } from "react";
import type { UpdateLinkParams } from "spoo.me";

interface EditLinkViewProps {
  link: LinkItem;
  onMutated: () => void;
}

export function EditLinkView({ link, onMutated }: EditLinkViewProps) {
  const { pop } = useNavigation();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (values: LinkFormValues) => {
    setSubmitting(true);
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Saving…",
    });
    try {
      const maxClicks = values.maxClicks
        ? Number.parseInt(values.maxClicks, 10)
        : undefined;
      // The form emits a duration; the API wants an absolute timestamp.
      // -1 = "keep current" (omit), null = "no expiry" (clear when one exists),
      // >0 = new duration from now.
      const expireAfter: UpdateLinkParams["expire_after"] =
        values.expireSeconds === -1
          ? undefined
          : values.expireSeconds === null
            ? link.expire_after !== null
              ? null
              : undefined
            : new Date(Date.now() + values.expireSeconds * 1000);

      const originalAlias = link.alias ?? link.id;
      const aliasChanged = values.alias && values.alias !== originalAlias;

      await withAuthRetry(() =>
        getSpooClient().links.update(link.id, {
          long_url: values.longUrl,
          alias: aliasChanged ? values.alias : undefined,
          password: values.removePassword ? null : values.password || undefined,
          max_clicks: values.removeMaxClicks
            ? null
            : Number.isFinite(maxClicks as number)
              ? maxClicks
              : undefined,
          expire_after: expireAfter,
          block_bots: values.blockBots,
          private_stats: values.privateStats,
        }),
      );

      toast.style = Toast.Style.Success;
      toast.title = "Link updated";
      onMutated();
      pop();
    } catch (err) {
      toast.hide();
      await reportError(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <LinkForm
      mode="edit"
      initialValues={{
        longUrl: link.long_url ?? "",
        alias: link.alias ?? link.id,
        maxClicks: link.max_clicks ? String(link.max_clicks) : "",
        blockBots: link.block_bots ?? false,
        privateStats: link.private_stats ?? false,
      }}
      isLoading={submitting}
      onSubmit={handleSubmit}
      skipClipboardPrefill
      hasPassword={link.password_set}
      hasMaxClicks={!!link.max_clicks}
      hasExpiry={link.expire_after !== null}
    />
  );
}
