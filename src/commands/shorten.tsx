import { getSpooClient, withAuthRetry } from "@/api/spoo";
import { AuthGate } from "@/components/auth-gate";
import { LinkForm, type LinkFormValues } from "@/components/link-form";
import { LinkQrView } from "@/components/link-qr";
import { getPreferences } from "@/constants";
import { useAuth } from "@/hooks/use-auth";
import { readActiveUrl } from "@/lib/clipboard";
import { reportError } from "@/lib/errors";
import { createdToLinkItem } from "@/lib/links";
import {
  Clipboard,
  type LaunchProps,
  Toast,
  popToRoot,
  showHUD,
  showToast,
  useNavigation,
} from "@raycast/api";
import { useEffect, useRef, useState } from "react";

interface ShortenLaunchContext {
  prefillUrl?: string;
  autoSubmit?: boolean;
}

export default function Shorten(
  props: LaunchProps<{ launchContext?: ShortenLaunchContext }>,
) {
  return (
    <AuthGate>
      <ShortenForm launchContext={props.launchContext} />
    </AuthGate>
  );
}

function ShortenForm({
  launchContext,
}: {
  launchContext?: ShortenLaunchContext;
}) {
  const { push } = useNavigation();
  const { isAuthenticated } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const autoSubmittedRef = useRef(false);
  const [prefillUrl, setPrefillUrl] = useState(launchContext?.prefillUrl ?? "");

  useEffect(() => {
    if (launchContext?.prefillUrl) return;
    readActiveUrl().then((url) => {
      if (url) setPrefillUrl(url);
    });
  }, [launchContext?.prefillUrl]);

  const handleSubmit = async (values: LinkFormValues) => {
    setSubmitting(true);
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Shortening…",
    });
    try {
      const maxClicksNumber = values.maxClicks
        ? Number.parseInt(values.maxClicks, 10)
        : undefined;
      // The form emits a duration in seconds; the API wants an absolute time.
      const expiresAt =
        values.expireSeconds && values.expireSeconds > 0
          ? new Date(Date.now() + values.expireSeconds * 1000)
          : undefined;

      const result = await withAuthRetry(() =>
        getSpooClient().links.create({
          long_url: values.longUrl,
          alias: values.alias || undefined,
          password: values.password || undefined,
          max_clicks: Number.isFinite(maxClicksNumber as number)
            ? maxClicksNumber
            : undefined,
          expire_after: expiresAt,
          block_bots: values.blockBots,
          private_stats: values.privateStats,
        }),
      );

      const { autoCopy, celebrate } = getPreferences();
      if (autoCopy) await Clipboard.copy(result.short_url);

      if (launchContext?.autoSubmit) {
        toast.hide();
        const emojiLike = /\p{Extended_Pictographic}/u.test(result.alias);
        const prefix = celebrate && emojiLike ? "🎉" : "🔗";
        await showHUD(
          `${prefix} ${autoCopy ? "Copied" : "Shortened"} ${result.short_url}`,
        );
        await popToRoot();
        return;
      }

      toast.style = Toast.Style.Success;
      toast.title = "Shortened";
      toast.message = result.short_url;
      push(
        <LinkQrView
          link={createdToLinkItem(result, {
            passwordSet: !!values.password,
            blockBots: values.blockBots,
            privateStats: values.privateStats,
            maxClicks: maxClicksNumber,
            expiresAt,
          })}
        />,
      );
    } catch (err) {
      toast.hide();
      await reportError(err);
    } finally {
      setSubmitting(false);
    }
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: handleSubmit is recreated every render; the ref guard ensures this fires once.
  useEffect(() => {
    if (!launchContext?.autoSubmit) return;
    if (!isAuthenticated) return;
    if (!prefillUrl) return;
    if (autoSubmittedRef.current) return;
    autoSubmittedRef.current = true;
    handleSubmit({
      longUrl: prefillUrl,
      alias: "",
      password: "",
      maxClicks: "",
      expireSeconds: null,
      blockBots: true,
      privateStats: false,
      removePassword: false,
      removeMaxClicks: false,
    });
  }, [isAuthenticated, prefillUrl, launchContext?.autoSubmit]);

  return (
    <LinkForm
      mode="create"
      initialValues={{ longUrl: prefillUrl }}
      isLoading={submitting}
      onSubmit={handleSubmit}
      skipClipboardPrefill
    />
  );
}
