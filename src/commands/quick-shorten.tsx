import { getStoredTokens } from "@/api/auth";
import { getSpooClient, withAuthRetry } from "@/api/spoo";
import { getPreferences } from "@/constants";
import { isUrl, readActiveUrl } from "@/lib/clipboard";
import { reportError } from "@/lib/errors";
import {
  Clipboard,
  type LaunchProps,
  LaunchType,
  Toast,
  launchCommand,
  showHUD,
  showToast,
} from "@raycast/api";

interface QuickShortenArgs {
  url?: string;
}

export default async function QuickShorten(
  props: LaunchProps<{ arguments: QuickShortenArgs }>,
) {
  const url = await resolveUrl(props.arguments.url);
  if (!url) {
    await showToast({
      style: Toast.Style.Failure,
      title: "No URL found",
      message: "Copy a URL or open a browser tab first.",
    });
    return;
  }

  const tokens = await getStoredTokens();
  if (!tokens?.accessToken) {
    // OAuth needs a view context — hand off to the Shorten command.
    await launchCommand({
      name: "shorten",
      type: LaunchType.UserInitiated,
      context: { prefillUrl: url, autoSubmit: true },
    });
    return;
  }

  const toast = await showToast({
    style: Toast.Style.Animated,
    title: "Shortening…",
  });
  try {
    const result = await withAuthRetry(() =>
      getSpooClient().links.create({ long_url: url }),
    );
    const { autoCopy, celebrate } = getPreferences();
    if (autoCopy) await Clipboard.copy(result.short_url);

    toast.hide();
    const emojiLike = /\p{Extended_Pictographic}/u.test(result.alias);
    const prefix = celebrate && emojiLike ? "🎉" : "🔗";
    await showHUD(`${prefix} Copied ${result.short_url}`);
  } catch (err) {
    toast.hide();
    await reportError(err);
  }
}

async function resolveUrl(argUrl: string | undefined): Promise<string | null> {
  if (argUrl && isUrl(argUrl)) return argUrl.trim();
  return readActiveUrl();
}
