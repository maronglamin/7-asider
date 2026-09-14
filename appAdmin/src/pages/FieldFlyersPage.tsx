import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { Copy, Download, Link2, Megaphone, RectangleHorizontal, RectangleVertical, Search } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

import { FieldAdvertFlyer } from '../components/FieldAdvertFlyer';
import { assetUrl, fetchApprovedFields } from '../lib/api';
import { getAdminToken } from '../lib/auth-storage';
import { type FlyerField, type FlyerOrientation } from '../lib/fieldAdvertCopy';

const APP_PUBLIC_URL = (
  (import.meta.env.VITE_APP_PUBLIC_URL as string | undefined) ||
  'https://7a-side.phantommetrics.gm'
).replace(/\/+$/, '');

function buildLinks(fieldId: string) {
  const path = `/field/${fieldId}`;
  return {
    https: `${APP_PUBLIC_URL}${path}`,
    scheme: `sevenaside://field/${fieldId}`,
  };
}

export function FieldFlyersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const token = getAdminToken();
  const flyerRef = useRef<HTMLDivElement>(null);

  const [q, setQ] = useState('');
  const [fields, setFields] = useState<FlyerField[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('fieldId'));
  const [orientation, setOrientation] = useState<FlyerOrientation>(
    searchParams.get('layout') === 'landscape' ? 'landscape' : 'portrait',
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<'https' | 'scheme' | null>(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const resp = await fetchApprovedFields(token, { q: q.trim() || undefined, limit: 80 });
      setFields(resp.items);
      setSelectedId((current) => {
        if (current && resp.items.some((f) => f.id === current)) return current;
        return resp.items[0]?.id ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load fields');
    } finally {
      setLoading(false);
    }
  }, [token, q]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selectedId) return;
    setSearchParams(
      { fieldId: selectedId, layout: orientation },
      { replace: true },
    );
  }, [selectedId, orientation, setSearchParams]);

  const selected = useMemo(
    () => fields.find((f) => f.id === selectedId) || null,
    [fields, selectedId],
  );

  const imageUrl = useMemo(() => {
    if (!selected) return null;
    const raw = selected.thumbnail || selected.images?.[0]?.url || null;
    return assetUrl(raw);
  }, [selected]);

  const links = selected ? buildLinks(selected.id) : null;

  async function copy(kind: 'https' | 'scheme') {
    if (!links) return;
    const value = kind === 'https' ? links.https : links.scheme;
    await navigator.clipboard.writeText(value);
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 1600);
  }

  async function downloadPng() {
    if (!flyerRef.current || !selected) return;
    setExporting(true);
    setError('');
    try {
      const dataUrl = await toPng(flyerRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: '#f8fafc',
      });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `7aside-${selected.name.replace(/\s+/g, '-').toLowerCase()}-${orientation}.png`;
      a.click();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export flyer');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Field flyers</h1>
          <p className="mt-1 max-w-xl text-sm text-slate-500">
            Simple booking posters — QR-first. Customers scan to book this pitch.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-green-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-green-700">
          <Megaphone size={14} />
          Marketing
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search approved fields"
            className="w-full rounded-lg border border-slate-200 py-2 pr-3 pl-9 text-sm"
          />
        </div>
        <div className="flex overflow-hidden rounded-lg border border-slate-200 bg-white">
          <button
            type="button"
            onClick={() => setOrientation('portrait')}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold ${
              orientation === 'portrait' ? 'bg-green-600 text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <RectangleVertical size={16} />
            Portrait
          </button>
          <button
            type="button"
            onClick={() => setOrientation('landscape')}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold ${
              orientation === 'landscape' ? 'bg-green-600 text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <RectangleHorizontal size={16} />
            Landscape
          </button>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
        >
          Refresh
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-6 grid gap-6 xl:grid-cols-[220px_minmax(0,1fr)_260px]">
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-3 text-xs font-bold tracking-wide text-slate-500 uppercase">
            Approved fields
          </div>
          {loading ? (
            <p className="p-4 text-sm text-slate-500">Loading…</p>
          ) : (
            <div className="max-h-[40rem] space-y-1 overflow-y-auto p-2">
              {fields.map((field) => (
                <button
                  key={field.id}
                  type="button"
                  onClick={() => setSelectedId(field.id)}
                  className={`w-full rounded-lg px-3 py-2.5 text-left transition ${
                    selectedId === field.id
                      ? 'bg-green-50 ring-1 ring-green-200'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="truncate text-sm font-semibold text-slate-900">{field.name}</div>
                  <div className="truncate text-xs text-slate-500">
                    {[field.city, field.address].filter(Boolean).join(' · ') || 'No location set'}
                  </div>
                </button>
              ))}
              {!fields.length && (
                <p className="p-3 text-sm text-slate-500">No approved fields found.</p>
              )}
            </div>
          )}
        </div>

        <div className="overflow-auto rounded-xl border border-slate-200 bg-slate-200/70 p-3 sm:p-5">
          {selected && links ? (
            <div
              ref={flyerRef}
              className={`mx-auto bg-transparent ${
                orientation === 'landscape' ? 'max-w-[900px]' : 'max-w-[420px]'
              }`}
            >
              <FieldAdvertFlyer
                field={selected}
                imageUrl={imageUrl}
                bookingUrl={links.https}
                orientation={orientation}
                logoSrc="/icon.png"
              />
            </div>
          ) : (
            <div className="flex min-h-[360px] items-center justify-center text-sm text-slate-500">
              Select a field to preview the flyer
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-bold text-slate-900">Share links</h2>
            <p className="mt-1 text-xs text-slate-500">
              Same URL as the QR — opens this field for booking.
            </p>
            {links ? (
              <div className="mt-3 space-y-3">
                <div>
                  <div className="mb-1 text-[11px] font-bold tracking-wide text-slate-400 uppercase">
                    HTTPS
                  </div>
                  <div className="break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">
                    {links.https}
                  </div>
                  <button
                    type="button"
                    onClick={() => void copy('https')}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Copy size={14} />
                    {copied === 'https' ? 'Copied' : 'Copy link'}
                  </button>
                </div>
                <div>
                  <div className="mb-1 text-[11px] font-bold tracking-wide text-slate-400 uppercase">
                    App link
                  </div>
                  <div className="break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">
                    {links.scheme}
                  </div>
                  <button
                    type="button"
                    onClick={() => void copy('scheme')}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Link2 size={14} />
                    {copied === 'scheme' ? 'Copied' : 'Copy app link'}
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-500">Select a field first.</p>
            )}
          </div>

          <button
            type="button"
            disabled={!selected || exporting}
            onClick={() => void downloadPng()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
          >
            <Download size={16} />
            {exporting ? 'Exporting…' : `Download ${orientation} PNG`}
          </button>
        </div>
      </div>
    </div>
  );
}
