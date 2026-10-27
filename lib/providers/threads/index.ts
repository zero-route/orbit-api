import { AppError } from "../../errors";
import { profileUrlFor } from "../../detect/profile";
import { deadlineIn, rapidJson } from "../../rapidapi/client";
import { hostConfig } from "../../rapidapi/hosts";
import { expiryFromNow, proxyPath } from "../../sign";
import { buildMedia } from "../instagram";
import { httpUrl, mediaList, rootOf, type IgMedia } from "../instagram/media";
import { isObj, str } from "../pick";
import type {
  DetectedInput,
  MediaPatch,
  MediaResult,
  Provider,
  DetailsProvider,
} from "../types";
import { fetchDetails } from "./details";
import { candidatesOf, resolveThread } from "./target";

const MAIN_BUDGET_MS = 40_000;
const DETAILS_BUDGET_MS = 25_000;

async function fetchMedia(candidates: string[], deadlineAt: number) {
  const { host, path } = hostConfig("threads");

  let lastError: AppError | null = null;
  let answered = false;

  for (const post of candidates) {
    try {
      const payload = await rapidJson({
        host,
        path,
        query: { post },
        deadlineAt,
        retries: 3,
      });

      answered = true;

      const items: IgMedia[] = mediaList(payload);

      if (items.length > 0) {
        return { payload, items };
      }
    } catch (error) {
      if (!(error instanceof AppError)) {
        throw error;
      }

      lastError = error;

      if (error.status === 429) {
        break;
      }
    }
  }

  if (answered) {
    throw new AppError(
      "Postingan ini tidak berisi video atau foto yang bisa diunduh.",
      422
    );
  }

  if (lastError && lastError.status !== 404) {
    throw lastError;
  }

  throw new AppError(
    "Postingan tidak ditemukan. Pastikan tautan benar dan akunnya tidak privat.",
    404
  );
}

export const threadsProvider: Provider = async (
  input: DetectedInput
): Promise<MediaResult> => {
  const startedAt = Date.now();
  const deadlineAt = deadlineIn(MAIN_BUDGET_MS);
  const target = await resolveThread(input.url);
  const { payload, items } = await fetchMedia(candidatesOf(target), deadlineAt);

  console.info(`[threads] media ${Date.now() - startedAt}ms items=${items.length}`);

  const expires = expiryFromNow();
  const built = buildMedia(items, expires);
  const root = rootOf(payload);
  const owner = root && isObj(root.author) ? root.author : undefined;
  const username = str(owner?.username) ?? target.username;
  const avatar = httpUrl(owner?.profile_picture);

  return {
    platform: "threads",
    kind: built.kind,
    sourceUrl: input.url,
    postId: str(root?.code) ?? target.code,
    author:
      username || owner
        ? {
            name: str(owner?.full_name),
            username,
            avatarUrl: avatar ? proxyPath(avatar, expires) : undefined,
            profileUrl: profileUrlFor("threads", username),
          }
        : undefined,
    coverUrl: built.cover,
    videos: built.videos,
    photos: built.photos,
    expiresAt: expires * 1000,
    detailsPending: true,
  };
};

export const threadsDetails: DetailsProvider = async (
  input: DetectedInput
): Promise<MediaPatch | null> => {
  const startedAt = Date.now();
  const deadlineAt = deadlineIn(DETAILS_BUDGET_MS);
  const target = await resolveThread(input.url);
  const details = await fetchDetails(candidatesOf(target), deadlineAt);

  console.info(`[threads] details ${Date.now() - startedAt}ms ok=${Boolean(details)}`);

  if (!details) {
    return null;
  }

  const expires = expiryFromNow();

  return {
    caption: details.text,
    author: {
      name: details.name,
      username: details.username,
      avatarUrl: details.avatar ? proxyPath(details.avatar, expires) : undefined,
      profileUrl: profileUrlFor("threads", details.username),
    },
    stats: {
      likes: details.likes,
      comments: details.replies,
      reposts: details.reposts,
      shares: details.shares,
    },
  };
};
