import { useEffect, useState } from 'react';

import {
  fetchContractInvitations,
  fetchContractTemplate,
  sendContractInvitation,
} from '../lib/api';
import { getAdminToken } from '../lib/auth-storage';
import { useAdminAuth } from '../contexts/AdminAuthContext';

export function ContractsPage() {
  const { hasPermission } = useAdminAuth();
  const token = getAdminToken();
  const [tab, setTab] = useState<'send' | 'list'>('send');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [subject, setSubject] = useState('');
  const [messageText, setMessageText] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token || !hasPermission('contract-invitations', 'view')) return;
    if (tab === 'list') {
      fetchContractInvitations(token)
        .then((resp) => setItems(resp.items))
        .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'));
    }
  }, [token, tab, hasPermission]);

  useEffect(() => {
    if (!token || tab !== 'send') return;
    fetchContractTemplate(token, { recipientName, businessName })
      .then((tpl) => {
        setSubject(tpl.subject || '');
        setMessageText(tpl.messageText || '');
      })
      .catch(() => undefined);
  }, [token, tab, recipientName, businessName]);

  async function send() {
    if (!token || !hasPermission('contract-invitations', 'edit')) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await sendContractInvitation(token, {
        recipientEmail,
        recipientName,
        businessName,
        subject,
        messageText,
        templateType: 'CUSTOM',
      });
      setSuccess('Invitation sent');
      setRecipientEmail('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-slate-900">Contract invitations</h1>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => setTab('send')}
          className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
            tab === 'send' ? 'bg-green-600 text-white' : 'border border-slate-200 bg-white'
          }`}
        >
          Send
        </button>
        <button
          type="button"
          onClick={() => setTab('list')}
          className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
            tab === 'list' ? 'bg-green-600 text-white' : 'border border-slate-200 bg-white'
          }`}
        >
          Sent list
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {success && <p className="mt-3 text-sm text-green-700">{success}</p>}

      {tab === 'send' && hasPermission('contract-invitations', 'edit') && (
        <div className="mt-4 max-w-2xl space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <input
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="Recipient email"
            value={recipientEmail}
            onChange={(e) => setRecipientEmail(e.target.value)}
          />
          <input
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="Recipient name"
            value={recipientName}
            onChange={(e) => setRecipientName(e.target.value)}
          />
          <input
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="Business name"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
          />
          <input
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="Subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
          <textarea
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            rows={10}
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void send()}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white"
          >
            Send invitation
          </button>
        </div>
      )}

      {tab === 'list' && (
        <div className="mt-4 space-y-2">
          {items.map((item) => (
            <div key={item.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
              <div className="font-semibold">{item.recipientEmail}</div>
              <div className="text-slate-500">{item.subject}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
