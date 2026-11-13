import React, { useState, useEffect } from 'react';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { Trip, CollaboratorMember, CollaboratorRole, GeneralAccessType } from '../../types/itinerary';
import { Language } from '../../utils/i18n';
import { enableTripCollaboration } from '../../utils/firebase';
import { User } from 'firebase/auth';
import { getPublicShareBaseUrl } from '../../utils/url';
import {
  X,
  Users,
  Copy,
  Check,
  Send,
  QrCode,
  Shield,
  ShieldCheck,
  Eye,
  Edit3,
  UserPlus,
  Trash2,
  Lock,
  Globe,
  Loader2,
  Crown,
  ChevronDown,
} from 'lucide-react';

interface CollaborateModalProps {
  trip: Trip;
  currentUser: User | null;
  lang: Language;
  onRequireAuth?: () => void;
  onUpdateTrip: (updatedTrip: Trip) => void;
  onClose: () => void;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const CollaborateModal: React.FC<CollaborateModalProps> = ({
  trip,
  currentUser,
  lang,
  onRequireAuth,
  onUpdateTrip,
  onClose,
}) => {
  useBodyScrollLock(true);
  const [emailInput, setEmailInput] = useState('');
  const [roleInput, setRoleInput] = useState<CollaboratorRole>('editor');
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);

  const isOwner = !trip.ownerId || Boolean(currentUser && currentUser.uid === trip.ownerId);
  const ownerEmail = trip.ownerEmail || currentUser?.email || '建立者 (本機)';
  const currentMembers: CollaboratorMember[] = trip.collaborators || [
    {
      id: currentUser?.uid || 'owner',
      email: ownerEmail,
      name: currentUser?.displayName || '行程發起人',
      role: 'owner',
      addedAt: Date.now(),
    },
  ];

  const collabUrl = trip.collabId
    ? `${getPublicShareBaseUrl()}?collab=${trip.collabId}`
    : null;

  // Initialize collaboration room if not yet collaborative
  const ensureCollaborative = async (): Promise<string> => {
    if (!currentUser) {
      onRequireAuth?.();
      throw new Error(lang === 'zh' ? '請先登入 Google 帳號，再啟用或管理多人共編' : 'Please sign in first.');
    }
    if (!isOwner) {
      throw new Error(lang === 'zh' ? '僅行程建立者可變更成員與權限設定' : 'Only the trip owner can manage permissions.');
    }
    if (trip.collabId && trip.isCollaborative) return trip.collabId;
    setIsActivating(true);
    try {
      const normalizedTrip: Trip = {
        ...trip,
        ownerId: trip.ownerId || currentUser.uid,
        ownerEmail: trip.ownerEmail || currentUser.email || '',
        collaborators: currentMembers,
        generalAccess: trip.generalAccess || 'link_viewer',
      };
      const collabId = await enableTripCollaboration(normalizedTrip, currentUser);
      const updated: Trip = {
        ...normalizedTrip,
        collabId,
        isCollaborative: true,
        updatedAt: Date.now(),
      };
      onUpdateTrip(updated);
      return collabId;
    } finally {
      setIsActivating(false);
    }
  };

  // Add a new collaborator by email with selected role
  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwner) {
      setMemberError('僅行程建立者可新增或修改成員權限');
      return;
    }
    const cleanEmail = emailInput.trim().toLowerCase();
    if (!cleanEmail || !EMAIL_REGEX.test(cleanEmail)) {
      setMemberError(lang === 'zh' ? '請輸入有效的 Email 格式（例如 name@example.com）' : 'Invalid email address.');
      return;
    }

    // Check if already in list
    if (currentMembers.some((m) => m.email.toLowerCase() === cleanEmail)) {
      setMemberError(lang === 'zh' ? '此帳號已在成員名單中' : 'Member already added.');
      return;
    }
    setMemberError(null);

    try {
      const cid = await ensureCollaborative();
      const newMember: CollaboratorMember = {
        id: `member-${Date.now()}`,
        email: cleanEmail,
        name: cleanEmail.split('@')[0],
        role: roleInput,
        addedAt: Date.now(),
      };

      const updatedMembers = [...currentMembers, newMember];
      const updatedTrip: Trip = {
        ...trip,
        isCollaborative: true,
        collabId: cid,
        ownerId: trip.ownerId || currentUser?.uid,
        ownerEmail: trip.ownerEmail || currentUser?.email || '',
        generalAccess: trip.generalAccess || 'link_viewer',
        collaborators: updatedMembers,
        updatedAt: Date.now(),
      };

      onUpdateTrip(updatedTrip);
      setEmailInput('');
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : '無法新增成員，請稍後重試');
    }
  };

  // Change existing member's role
  const handleChangeRole = (memberEmail: string, newRole: CollaboratorRole) => {
    if (!isOwner) {
      setMemberError('僅行程建立者可調整成員角色');
      return;
    }
    const updatedMembers = currentMembers.map((m) =>
      m.email === memberEmail ? { ...m, role: newRole } : m
    );
    onUpdateTrip({
      ...trip,
      collaborators: updatedMembers,
      updatedAt: Date.now(),
    });
  };

  // Remove collaborator
  const handleRemoveMember = (memberEmail: string) => {
    if (!isOwner) {
      setMemberError('僅行程建立者可移除成員');
      return;
    }
    const updatedMembers = currentMembers.filter((m) => m.email !== memberEmail);
    onUpdateTrip({
      ...trip,
      collaborators: updatedMembers,
      updatedAt: Date.now(),
    });
  };

  // Update general access policy
  const handleChangeGeneralAccess = async (newAccess: GeneralAccessType) => {
    setMemberError(null);
    try {
      const cid = await ensureCollaborative();
      onUpdateTrip({
        ...trip,
        collabId: cid,
        isCollaborative: true,
        generalAccess: newAccess,
        updatedAt: Date.now(),
      });
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : '無法更新連結權限');
    }
  };

  const handleCopyLink = async () => {
    setMemberError(null);
    try {
      const cid = collabUrl && trip.collabId ? trip.collabId : await ensureCollaborative();
      const url = `${getPublicShareBaseUrl()}?collab=${cid}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : '無法產生並複製共編連結');
    }
  };

  const handleNativeShare = async () => {
    setMemberError(null);
    try {
      const cid = collabUrl && trip.collabId ? trip.collabId : await ensureCollaborative();
      const url = `${getPublicShareBaseUrl()}?collab=${cid}`;
      if (navigator.share) {
        try {
          await navigator.share({
            title: `共同編輯【${trip.title}】旅遊行程`,
            text: `嗨！已為您開通【${trip.destination}】旅遊行程共編權限，點開即可一起加入編輯規劃：`,
            url,
          });
        } catch {
          // User cancelled share
        }
      } else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : '無法分享共編邀請');
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-3xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 my-auto animate-in fade-in zoom-in-95 duration-150 overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                {lang === 'zh' ? '成員與權限' : 'Members & Permissions'}
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-700 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 space-y-5 overflow-y-auto">
          {/* Trip preview bar */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-3">
            <div>
              <span className="text-[10px] font-bold text-teal-700 dark:text-teal-400 uppercase tracking-wider">
                {trip.destination}
              </span>
              <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                {trip.title}
              </h4>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <ShieldCheck className="w-4 h-4 text-teal-600" />
              <span>{currentMembers.length} 位成員</span>
            </div>
          </div>

          {/* Form: Add Collaborator Member by Email */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between gap-1.5">
              <span className="flex items-center gap-1.5">
                <UserPlus className="w-3.5 h-3.5 text-teal-600" />
                <span>新增成員：</span>
              </span>
              {!isOwner && (
                <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                  僅建立者可調整權限
                </span>
              )}
            </label>

            <form onSubmit={handleAddMember} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <input
                type="email"
                required
                disabled={!isOwner}
                value={emailInput}
                onChange={(e) => {
                  setEmailInput(e.target.value);
                  if (memberError) setMemberError(null);
                }}
                placeholder={lang === 'zh' ? '輸入旅伴 Email...' : 'Enter collaborator email'}
                className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs focus:ring-2 focus:ring-teal-500 focus:outline-hidden disabled:opacity-50"
              />

              <div className="flex items-center gap-2">
                <div className="relative flex items-center">
                  <select
                    value={roleInput}
                    disabled={!isOwner}
                    onChange={(e) => setRoleInput(e.target.value as CollaboratorRole)}
                    className="appearance-none pl-3 pr-8 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold focus:outline-hidden cursor-pointer disabled:opacity-50"
                  >
                    <option value="editor">可編輯</option>
                    <option value="viewer">僅檢視</option>
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 pointer-events-none" />
                </div>

                <button
                  type="submit"
                  disabled={!isOwner || isActivating || !emailInput.trim()}
                  className="px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-bold text-xs transition active:scale-95 shrink-0 flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  {isActivating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                  <span>新增</span>
                </button>
              </div>
            </form>
            {memberError && (
              <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                {memberError}
              </p>
            )}
          </div>

          {/* Member List with Permissions */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
              <span>成員名單：</span>
            </label>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden bg-white dark:bg-slate-900">
              {currentMembers.map((member) => {
                const isOwner = member.role === 'owner';
                return (
                  <div key={member.email} className="p-3 sm:px-4 flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-300 font-bold flex items-center justify-center text-xs shrink-0">
                        {isOwner ? <Crown className="w-4 h-4 text-amber-500" /> : member.email[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="font-bold text-slate-800 dark:text-slate-200 truncate">
                            {member.email}
                          </p>
                          {isOwner && (
                            <span className="px-2 py-0.2 rounded-md bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-[10px] font-bold">
                              建立者
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400">
                          {isOwner ? '擁有完整控制權' : member.role === 'editor' ? '可新增與修改所有日程' : '僅可查閱最新進度與天氣'}
                        </p>
                      </div>
                    </div>

                    {/* Role Control */}
                    <div className="flex items-center gap-2 shrink-0">
                      {isOwner || member.role === 'owner' ? (
                        <span className="px-2.5 py-1 text-slate-500 text-xs font-semibold">
                          {member.role === 'owner' ? '擁有者' : member.role === 'editor' ? '可編輯' : '僅檢視'}
                        </span>
                      ) : (
                        <>
                          <div className="relative flex items-center">
                            <select
                              value={member.role}
                              onChange={(e) => handleChangeRole(member.email, e.target.value as CollaboratorRole)}
                              className="appearance-none pl-2.5 pr-7 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold focus:outline-hidden cursor-pointer"
                            >
                              <option value="editor">可編輯</option>
                              <option value="viewer">僅檢視</option>
                            </select>
                            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-1.5 pointer-events-none" />
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRemoveMember(member.email)}
                            className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                            title="移除成員權限"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* General Access Policy */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-teal-600" />
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  連結權限
                </span>
              </div>

              <div className="relative flex items-center">
                <select
                  value={trip.generalAccess || 'link_viewer'}
                  disabled={!isOwner}
                  onChange={(e) => handleChangeGeneralAccess(e.target.value as GeneralAccessType)}
                  className="appearance-none pl-3 pr-8 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold focus:outline-hidden cursor-pointer shadow-2xs disabled:opacity-50"
                >
                  <option value="restricted">僅限受邀成員</option>
                  <option value="link_editor">知道連結的人皆可編輯</option>
                  <option value="link_viewer">知道連結的人僅可檢視</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 pointer-events-none" />
              </div>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {trip.generalAccess === 'restricted'
                ? '僅名單內的 Email 可存取此行程。'
                : (trip.generalAccess || 'link_viewer') === 'link_viewer'
                ? '取得連結者可瀏覽，僅編輯者可修改。'
                : '取得連結者皆可即時共同編輯。'}
            </p>
          </div>

          {/* Share Link & QR section */}
          <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-800">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              共編連結：
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={collabUrl || '點擊產生共編邀請連結'}
                className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-mono outline-hidden select-all"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                className="px-3.5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-xs transition active:scale-95 shrink-0 flex items-center gap-1.5"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? '已複製！' : '複製連結'}</span>
              </button>
            </div>

            {/* Quick action buttons */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={handleNativeShare}
                className="py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition active:scale-95"
              >
                <Send className="w-3.5 h-3.5 text-teal-600" />
                <span>分享邀請</span>
              </button>

              <button
                type="button"
                onClick={() => setShowQr(!showQr)}
                className="py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition active:scale-95"
              >
                <QrCode className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
                <span>{showQr ? '隱藏 QR' : '顯示 QR'}</span>
              </button>
            </div>

            {showQr && collabUrl && (
              <div className="p-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-center space-y-1.5 animate-in fade-in duration-150">
                <div className="inline-block p-2 rounded-xl bg-white shadow-xs border border-slate-100">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(collabUrl)}`}
                    alt="Collaborate Trip QR Code"
                    className="w-32 h-32 mx-auto"
                    loading="lazy"
                  />
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  掃描 QR Code 立即加入行程
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs transition cursor-pointer"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
};
