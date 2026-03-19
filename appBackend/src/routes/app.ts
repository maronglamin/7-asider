import { Request, Response, Router } from 'express';

const router = Router();

type ReleaseRef = {
  version: string | null;
  build: number | null;
};

function normalizeVersion(value: unknown): string | null {
  const version = String(value || '').trim();
  return version || null;
}

function normalizeBuild(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor(parsed));
}

function tokenizeVersion(version: string | null): number[] {
  if (!version) return [];
  return version
    .split('.')
    .map((part) => {
      const match = part.match(/\d+/);
      return match ? Number(match[0]) : 0;
    });
}

function compareRelease(a: ReleaseRef, b: ReleaseRef): number {
  const left = tokenizeVersion(a.version);
  const right = tokenizeVersion(b.version);
  const length = Math.max(left.length, right.length);

  for (let i = 0; i < length; i += 1) {
    const aValue = left[i] ?? 0;
    const bValue = right[i] ?? 0;
    if (aValue !== bValue) return aValue < bValue ? -1 : 1;
  }

  if (a.build != null && b.build != null && a.build !== b.build) {
    return a.build < b.build ? -1 : 1;
  }

  return 0;
}

function hasReleaseValue(ref: ReleaseRef): boolean {
  return ref.version != null || ref.build != null;
}

router.get('/release', (req: Request, res: Response) => {
  const current: ReleaseRef = {
    version: normalizeVersion(req.query.version),
    build: normalizeBuild(req.query.build),
  };

  const latest: ReleaseRef = {
    version: normalizeVersion(process.env.MOBILE_LATEST_VERSION),
    build: normalizeBuild(process.env.MOBILE_LATEST_BUILD),
  };

  const minimumSupported: ReleaseRef = {
    version: normalizeVersion(process.env.MOBILE_MIN_SUPPORTED_VERSION),
    build: normalizeBuild(process.env.MOBILE_MIN_SUPPORTED_BUILD),
  };

  const hasCurrent = hasReleaseValue(current);
  const hasLatest = hasReleaseValue(latest);
  const hasMinimum = hasReleaseValue(minimumSupported);

  const forceUpdate = hasCurrent && hasMinimum && compareRelease(current, minimumSupported) < 0;
  const updateAvailable = forceUpdate || (hasCurrent && hasLatest && compareRelease(current, latest) < 0);
  const mode = forceUpdate ? 'force' : updateAvailable ? 'optional' : 'none';

  const title = forceUpdate
    ? process.env.MOBILE_FORCE_UPDATE_TITLE || process.env.MOBILE_UPDATE_TITLE || 'Update required'
    : process.env.MOBILE_UPDATE_TITLE || 'Update available';

  const message = forceUpdate
    ? process.env.MOBILE_FORCE_UPDATE_MESSAGE || process.env.MOBILE_UPDATE_MESSAGE || 'Please update the app to continue.'
    : process.env.MOBILE_UPDATE_MESSAGE || 'A newer version of the app is available.';

  res.json({
    platform: String(req.query.platform || 'unknown'),
    mode,
    updateAvailable,
    forceUpdate,
    title,
    message,
    storeUrl: normalizeVersion(process.env.MOBILE_UPDATE_URL),
    currentVersion: current.version,
    currentBuild: current.build != null ? String(current.build) : null,
    latestVersion: latest.version,
    latestBuild: latest.build != null ? String(latest.build) : null,
    minSupportedVersion: minimumSupported.version,
    minSupportedBuild: minimumSupported.build != null ? String(minimumSupported.build) : null,
  });
});

export default router;
